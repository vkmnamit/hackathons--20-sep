// fulfill.js — OPERATIONAL fulfillment layer for LogiOpt.
// ---------------------------------------------------------------------------
// The strategic layer (server.js + cpp/wlopt solveDispatch) answers
//   "WHERE should warehouses go?"            (monthly plan, 1 run)
// This module answers, for every order and every SKU:
//   * ORDER ALLOCATION     which warehouse ships this line?      -> cpp mode=fulfill
//   * INVENTORY MANAGEMENT on-hand / reserved / incoming / available
//   * PRODUCT-WAREHOUSE MAP which SKUs sit where, and how deep
//   * DISPATCH SCHEDULING  which wave departs, and when to cut off picking
//   * DELIVERY ASSIGNMENT  which vehicle runs which stops, in which order
//   * STOCK REBALANCING    move surplus SKUs to deficit sites   -> cpp mode=rebalance
//   * STORAGE OPTIMIZATION how many units each site should hold -> cpp mode=storeopt
//
// Zero npm deps. Node owns state + time + vehicles; C++ owns the combinatorics
// (assignment, transportation problem, knapsack), exactly like the rest of the repo.

// ------------------------------------------------------------------ helpers --
function rng32(seed){ let a=seed>>>0; return function(){
  a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }
function num(v,d){ const n=typeof v==='number'?v:parseFloat(v); return isFinite(n)?n:d; }
function distKm(a,b,factor){
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  const isGeoLatX = (a.x >= 6 && a.x <= 40) || (b.x >= 6 && b.x <= 40);
  const isGeoLngY = (a.y >= 60 && a.y <= 100) || (b.y >= 60 && b.y <= 100);
  const isGeoLatY = (a.y >= 6 && a.y <= 40) || (b.y >= 6 && b.y <= 40);
  const isGeoLngX = (a.x >= 60 && a.x <= 100) || (b.x >= 60 && b.x <= 100);

  if (isGeoLatX && isGeoLngY) {
    dx = (a.x - b.x) * 111.0;
    dy = (a.y - b.y) * 108.2;
  } else if (isGeoLatY && isGeoLngX) {
    dx = (a.x - b.x) * 108.2;
    dy = (a.y - b.y) * 111.0;
  }
  return Math.hypot(dx, dy) * (factor == null ? 1.35 : factor);
}
function round(v,d){ const p=Math.pow(10,d==null?2:d); return Math.round(v*p)/p; }
function priorityOf(p){
  if(typeof p==='number') return Math.max(0,Math.min(2,p));
  const s=String(p||'').toLowerCase();
  if(s==='critical'||s==='same-day') return 2;
  if(s==='express'||s==='priority') return 1;
  return 0;
}
function priorityName(p){ return ['standard','express','critical'][priorityOf(p)]; }

// --------------------------------------------------------------- inventory --
// inventory = { warehouseId: { productId: { onHand, reserved, incoming:[{qty,etaHr}] } } }
function emptyInventory(){ return {}; }
function invRecord(inv, whId, productId){
  if(!inv[whId]) inv[whId]={};
  if(!inv[whId][productId]) inv[whId][productId]={onHand:0,reserved:0,incoming:[]};
  const rec=inv[whId][productId];
  if(!Array.isArray(rec.incoming)) rec.incoming=[];
  rec.onHand=num(rec.onHand,0); rec.reserved=num(rec.reserved,0);
  return rec;
}
function invLook(inv, whId, productId){
  const w=inv&&inv[whId]; const rec=w&&w[productId];
  if(!rec) return {onHand:0,reserved:0,available:0,incoming:[],incomingSoon:0};
  const available=num(rec.onHand,0)-num(rec.reserved,0);
  const incoming=Array.isArray(rec.incoming)?rec.incoming:[];
  return {onHand:num(rec.onHand,0),reserved:num(rec.reserved,0),
    available:available,incoming:incoming,
    incomingSoon:incoming.reduce(function(a,i){return a+num(i.qty,0);},0)};
}
function invAt(inv, whId, productId, atHr){
  const s=invLook(inv,whId,productId);
  const soon=s.incoming.filter(function(i){ return num(i.etaHr,0)<=num(atHr,0)+1e-9; })
    .reduce(function(a,i){return a+num(i.qty,0);},0);
  return {onHand:s.onHand,reserved:s.reserved,available:s.available,
    incoming:s.incoming,incomingByDue:soon,promised:s.available+soon};
}
// Inventory mutations used by POST /api/inventory. Pure: returns a new snapshot.
function applyInventoryOp(inv0, op){
  const inv=JSON.parse(JSON.stringify(inv0||{}));
  op=op||{};
  const type=String(op.type||'snapshot').toLowerCase();
  const whId=op.warehouseId, productId=op.productId, qty=num(op.qty,0);
  if(type==='reset') return {inventory:{},result:{ok:true,type:type}};
  if(type==='receive'){
    const rec=invRecord(inv,whId,productId);
    if(op.etaHr!=null&&num(op.etaHr,0)>0){ rec.incoming.push({qty:qty,etaHr:num(op.etaHr,0)}); }
    else rec.onHand+=qty;
    return {inventory:inv,result:{ok:true,type:type,warehouseId:whId,productId:productId,
      qty:qty,onHand:rec.onHand,incoming:rec.incoming}};
  }
  if(type==='reserve'||type==='release'||type==='commit'){
    const rec=invRecord(inv,whId,productId);
    const available=rec.onHand-rec.reserved;
    if(type==='reserve'){
      if(qty>available+1e-9) return {inventory:inv,result:{ok:false,type:type,
        error:'insufficient available stock',available:available,requested:qty}};
      rec.reserved+=qty;
    } else if(type==='release'){
      rec.reserved=Math.max(0,rec.reserved-qty);
    } else { // commit = ship out: units leave the shelf
      rec.reserved=Math.max(0,rec.reserved-qty);
      rec.onHand=Math.max(0,rec.onHand-qty);
    }
    return {inventory:inv,result:{ok:true,type:type,warehouseId:whId,productId:productId,
      qty:qty,onHand:rec.onHand,reserved:rec.reserved,available:rec.onHand-rec.reserved}};
  }
  if(type==='adjust'){
    const rec=invRecord(inv,whId,productId); rec.onHand=qty;
    return {inventory:inv,result:{ok:true,type:type,warehouseId:whId,productId:productId,
      onHand:rec.onHand,available:rec.onHand-rec.reserved}};
  }
  return {inventory:inv,result:{ok:true,type:'snapshot'}};
}

// ------------------------------------------------------------- defaults ----
const DEFAULT_PARAMS={
  deliveryCostPerKm:2.0, shipmentFixedCost:9, handlingCostPerUnit:1.2,
  latePenaltyPerHr:12, transferCostPerKmPerUnit:0.6,
  kmPerHour:28, roadFactor:1.35, pickMinPerOrder:6, packMinPerOrder:3,
  allowLate:true, maxLateHr:36, maxServiceRadius:60, maxSplitShipments:2,
  strategy:'balanced', distanceMetric:'road', improvementPasses:3,
  serviceMinPerStop:5, waveSlackMin:15
};
const DEFAULT_OPTIONS={commit:false,includeRoutes:true,includeStorage:false,includeRebalance:false};
function defaultVehicle(whId,i){
  return {id:whId+'-V'+(i+1), capacityUnits:i===0?36:20, capacityKg:i===0?220:120,
    capacityM3:i===0?2.4:1.4, costPerKm:i===0?0.85:0.6, speedKmH:30,
    driverCostPerTrip:i===0?45:32, maxStops:i===0?12:8, availableHr:0};
}

// ------------------------------------------------------------ demo data ----
// Deterministic "Bengaluru 3PL" scenario in the same 0..100 km plane the rest
// of the platform uses (x = east km, y = north km).
function demoFulfill(o){
  o=o||{};
  const seed=o.seed!=null?o.seed:7, rng=rng32(seed);
  const nOrders=Math.max(4,Math.min(120,o.orders||18));

  const products=[
    {id:'P1',name:'Laptop 15"',unitValue:55000,weightKg:2.2,volumeM3:0.006,holdingCostPerUnitDay:1.2},
    {id:'P2',name:'Wireless Earbuds',unitValue:3500,weightKg:0.1,volumeM3:0.0008,holdingCostPerUnitDay:0.2},
    {id:'P3',name:'27in Monitor',unitValue:18000,weightKg:5.4,volumeM3:0.035,holdingCostPerUnitDay:0.9},
    {id:'P4',name:'Smartphone',unitValue:32000,weightKg:0.4,volumeM3:0.0009,holdingCostPerUnitDay:0.7}
  ];

  const whSpecSeed=[
    {id:'W1',name:'Whitefield DC',      x:12.9750,y:77.7400, lat:12.9750, lng:77.7400, capacity:900, storageM3:5, throughputPerHr:160, handlingCostPerUnit:1.1, fixedOperatingCost:900, waves:[7,11,15,19]},
    {id:'W2',name:'Peenya Hub',         x:13.0300,y:77.5250, lat:13.0300, lng:77.5250, capacity:700, storageM3:4, throughputPerHr:120, handlingCostPerUnit:1.4, fixedOperatingCost:750, waves:[8,12,16,20]},
    {id:'W3',name:'Hosur Road Depot (Electronic City)', x:12.8452,y:77.6602, lat:12.8452, lng:77.6602, capacity:600, storageM3:3, throughputPerHr: 90, handlingCostPerUnit:1.3, fixedOperatingCost:620, waves:[6,10,14,18]},
    {id:'W4',name:'Hebbal Cross-dock',  x:13.0358,y:77.5970, lat:13.0358, lng:77.5970, capacity:500, storageM3:2, throughputPerHr: 80, handlingCostPerUnit:1.6, fixedOperatingCost:480, waves:[9,13,17]}
  ];

  // warehouse registry (when the caller supplies the active dataset) — sites,
  // capacity and storage all come from the user's own data, not a fixed list.
  const whSpec = (Array.isArray(o.warehouses) && o.warehouses.length
    ? o.warehouses.filter(function (w) { return w && isFinite(w.x) && isFinite(w.y); })
        .map(function (w, i) {
          const cap = Math.max(50, Math.round(num(w.capacity, 600)));
          return { id: w.id || ('W' + (i + 1)), name: w.name || w.id || ('Site ' + (i + 1)),
            x: w.x, y: w.y, lat: w.lat, lng: w.lng, capacity: cap,
            storageM3: Math.max(1, Math.round(cap / 150)), throughputPerHr: Math.max(40, Math.round(cap / 6)),
            handlingCostPerUnit: round(1.1 + (i % 3) * 0.25, 2),
            fixedOperatingCost: Math.round(num(w.fixedCost, 600) / 2),
            waves: [[7,11,15,19],[8,12,16,20],[6,10,14,18],[9,13,17]][i % 4] };
        })
    : whSpecSeed);

  // deliberate stock asymmetry: the east DC is thin on monitors, the depot thin on laptops
  const stockGrid={};
  whSpec.forEach(function (w, wi) {
    stockGrid[w.id] = {
      P1: Math.max(2, Math.round(w.capacity * (wi === 3 ? 0.004 : 0.02))),
      P2: Math.max(20, Math.round(w.capacity * (wi === 1 ? 1.2 : 0.5))),
      P3: Math.max(1, Math.round(w.capacity * (wi === 0 ? 0.008 : 0.02))),
      P4: Math.max(3, Math.round(w.capacity * (wi === 3 ? 0.01 : 0.06))),
    };
  });
  const incomingGrid={};
  if (whSpec.length > 1) {
    incomingGrid[whSpec[0].id] = [{productId:'P1',qty:40,etaHr:18}];
    incomingGrid[whSpec[whSpec.length - 1].id] = [{productId:'P3',qty:12,etaHr:30}];
  }

  const warehouses=whSpec.map(function(w){
    const fleet=[defaultVehicle(w.id,0),defaultVehicle(w.id,1)];
    if(w.capacity>=700) fleet.push(defaultVehicle(w.id,2));
    return {
      id:w.id, name:w.name, x:w.x, y:w.y,
      capacity:w.capacity, storageM3:w.storageM3, throughputPerHr:w.throughputPerHr,
      handlingCostPerUnit:w.handlingCostPerUnit, fixedOperatingCost:w.fixedOperatingCost,
      open:true, waves:w.waves, stock:Object.assign({},stockGrid[w.id]||{}),
      incoming:(incomingGrid[w.id]||[]).slice(), vehicles:fleet,
      reserved:{}
    };
  });

  const hotspots = (Array.isArray(o.neighborhoods) && o.neighborhoods.length
    ? o.neighborhoods.filter(function (n) { return n && isFinite(n.x) && isFinite(n.y); })
        .map(function (n) {
          return { name: n.name || n.id || 'Area', x: n.x, y: n.y, lat: n.lat, lng: n.lng,
            w: Math.max(0.25, num(n.demand, 1)) };
        })
    : [
        {name:'Whitefield',      x:12.9698, y:77.7499, lat:12.9698, lng:77.7499, w:3.0},
        {name:'Electronic City', x:12.8452, y:77.6602, lat:12.8452, lng:77.6602, w:2.5},
        {name:'Koramangala',     x:12.9352, y:77.6245, lat:12.9352, lng:77.6245, w:3.0},
        {name:'Yelahanka',       x:13.1007, y:77.5963, lat:13.1007, lng:77.5963, w:1.5},
        {name:'Rajajinagar',     x:12.9982, y:77.5530, lat:12.9982, lng:77.5530, w:2.0}
      ]);
  const totW=hotspots.reduce(function(a,h){return a+h.w;},0);
  function pickHot(){ let r=rng()*totW; for(const h of hotspots){ r-=h.w; if(r<=0) return h; } return hotspots[0]; }

  const qtyRange={P1:[1,3],P2:[1,6],P3:[1,2],P4:[1,3]};
  const prioPool=['standard','standard','standard','standard','express','express','critical'];
  const orders=[];
  for(let i=0;i<nOrders;i++){
    const h=pickHot();
    const x=round(h.x+(rng()+rng()-1)*0.015,4), y=round(h.y+(rng()+rng()-1)*0.015,4);
    const priority=prioPool[Math.floor(rng()*prioPool.length)];
    const dueHr=priority==='critical'?round(3+rng()*3,1)
      :priority==='express'?round(6+rng()*5,1)
      :round(18+rng()*14,1);
    const nLines=rng()<0.35?2:1;
    const lines=[];
    for(let l=0;l<nLines;l++){
      const p=products[Math.floor(rng()*products.length)];
      if(lines.some(function(z){return z.productId===p.id;})) continue;
      const r=qtyRange[p.id];
      lines.push({productId:p.id,qty:Math.round(r[0]+rng()*(r[1]-r[0])),
        unitPrice:p.unitValue,weightKg:p.weightKg,volumeM3:p.volumeM3});
    }
    orders.push({id:'O'+(1001+i),customerId:'C'+(500+i),customerName:h.name+' #'+(i+1),
      x:x,y:y,placedHr:round(rng()*2,2),dueHr:dueHr,priority:priority,lines:lines});
  }

  // forecast demand over the horizon, per site per SKU (drives the storage plan)
  const networkDemand={P1:540,P2:8400,P3:400,P4:1100};
  const demand={};
  warehouses.forEach(function(w,wi){
    demand[w.id]={};
    products.forEach(function(p){
      const bias=1+(rng()-0.5)*0.8 + (wi===0?0.25:0) + (wi===3?-0.25:0);
      demand[w.id][p.id]=Math.max(1,Math.round(networkDemand[p.id]/warehouses.length*bias));
    });
  });

  return {products:products,warehouses:warehouses,orders:orders,demand:demand,
    params:Object.assign({},DEFAULT_PARAMS,o.params||{}),
    source: (Array.isArray(o.neighborhoods)&&o.neighborhoods.length)?'dataset':'demo',
    note: (Array.isArray(o.neighborhoods)&&o.neighborhoods.length)
      ? 'Built from YOUR dataset: '+hotspots.length+' demand areas weighted by their demand, '+
        warehouses.length+' sites with stock derived from their capacity, mixed express+critical+standard '+
        'orders, inbound replenishments, and deliberately uneven stock so allocation, splitting, '+
        'backorders and rebalancing all have something to chew on.'
      : 'Deterministic demo: 4 SKUs (laptop, earbuds, monitor, phone), 4 Bengaluru sites '+
        '(Whitefield/Peenya/Hosur Road/Hebbal), 5 demand hotspots, mixed express+critical+standard '+
        'orders, two inbound replenishments, and deliberately uneven stock so allocation, splitting, '+
        'backorders and rebalancing all have something to chew on.'};
}

// ------------------------------------------- dispatch (time) scheduling ----
// Ops rule: pick+pack BEFORE the wave leaves. The C++ engine gives us transit
// time; here we pick the departure wave, the picking cutoff, the promised ETA
// and the risk flag. Express/critical take the EARLIEST safe wave (speed is the
// product they bought); standard/economy take the LATEST safe wave so the site
// can consolidate, which cuts trips and cost.
function prepHrFor(wh, qty, P){
  const thru=num(wh.throughputPerHr,1e9);
  return (num(P.pickMinPerOrder,6)+num(P.packMinPerOrder,3)+
    (thru>0&&thru<1e9? qty/thru*60 : 0))/60;
}
function wavesOf(wh){ return (Array.isArray(wh.waves)&&wh.waves.length)?wh.waves.slice().sort(function(a,b){return a-b;}):[8,12,16,20]; }
function scheduleDispatch(wh, priority, dueHr, transitHr, prepHr, P){
  const waves=wavesOf(wh), slack=num(P.waveSlackMin,15)/60;
  const safe=waves.filter(function(w){ return w+transitHr<=dueHr+1e-9; });
  const express=priorityOf(priority)>=1;
  const onDemandEta=transitHr;              // left the dock right now (hour 0)
  let departHr, policy;
  if(express && onDemandEta<=dueHr+1e-9){
    // express/critical can jump the wave entirely: instant dispatch beats waiting,
    // and it is the only way a same-day promise is kept before the first wave.
    departHr=0; policy='on-demand-immediate';
  } else if(safe.length){
    departHr=express? safe[0] : safe[safe.length-1];
    policy=express? 'earliest-safe-wave' : 'latest-safe-wave';
  } else {
    departHr=express? 0 : waves[0]; policy=express? 'on-demand-immediate':'first-wave';
  }
  const etaHr=departHr+transitHr;
  return {
    wavePolicy:policy,
    departHr:round(departHr,2),
    cutoffHr:round(Math.max(0,departHr-prepHr-slack),2),
    etaHr:round(etaHr,2),
    slackHr:round(dueHr-etaHr,2),
    lateHr:Math.max(0,round(etaHr-dueHr,2)),
    atRisk: etaHr>dueHr+1e-9,
    waves:waves
  };
}

// --------------------------------------------------- "why this dock" ------
// For every order line we keep the full candidate table the decision came from,
// so the UI (and an operator under pressure) can see the alternative docks and
// the exact constraint that ruled each one out.
function explainLine(order, line, whs, inv, P){
  const rows=whs.map(function(w){
    const st=invAt(inv,w.id,line.productId,order.dueHr);
    const d=distKm({x:order.x,y:order.y},w,P.roadFactor);
    const transit=P.kmPerHour>0? d/num(P.kmPerHour,30):0;
    const prep=prepHrFor(w,line.qty,P);
    const eta=transit+prep;
    let reason, feasible=false;
    if(!w.open){ reason='site closed'; }
    else if(d>num(P.maxServiceRadius,1e18)+1e-9){ reason='outside '+num(P.maxServiceRadius,0)+'km service radius'; }
    else if(st.available<=1e-9){ reason='out of stock (on hand '+st.onHand+', reserved '+st.reserved+')'; }
    else if(st.available<line.qty-1e-9){ reason='short: only '+round(st.available,0)+' of '+line.qty+' available'; }
    else if(!P.allowLate && eta>order.dueHr+1e-9){ reason='cannot meet due time'; }
    else { reason='available'; feasible=true; }
    return {warehouseId:w.id, name:w.name||w.id, distKm:round(d,2), transitHr:round(transit,2),
      handlingHr:round(prep,2), etaHr:round(eta,2), onHand:st.onHand, reserved:st.reserved,
      available:st.available, incomingByDue:round(st.incomingByDue,0), feasible:feasible, reason:reason};
  });
  rows.sort(function(a,b){
    if(a.feasible!==b.feasible) return a.feasible? -1:1;
    return a.etaHr-b.etaHr;
  });
  return rows.slice(0,4);
}

// --------------------------------------------- delivery assignment --------
// One stop = one order at one site in one wave (lines merged, so the customer
// is visited once). Stops are packed into vehicle trips with best-fit across the
// fleet, then each trip is routed nearest-neighbour from the dock and improved
// with 2-opt. Trip distance is a real road loop (dock -> stops -> back to dock),
// so it is reported separately from the per-line star distance the C++ engine
// costs, and both numbers are visible in the response.
function tripSpare(t){
  const v=t.vehicle;
  return Math.min(num(v.capacityUnits,1e9)-t.loadUnits,
                  num(v.capacityKg,1e9)-t.loadKg,
                  num(v.capacityM3,1e9)-t.loadM3);
}
function tripFits(t,s){
  const v=t.vehicle;
  if(t.stops.length>=num(v.maxStops,12)) return false;
  if(t.loadUnits+s.units>num(v.capacityUnits,1e9)+1e-9) return false;
  if(t.loadKg+s.weightKg>num(v.capacityKg,1e9)+1e-9) return false;
  if(t.loadM3+s.volumeM3>num(v.capacityM3,1e9)+1e-9) return false;
  return true;
}
function routeDistance(wh, pts, factor){
  let d=0, cx=wh.x, cy=wh.y;
  pts.forEach(function(p){ d+=distKm({x:cx,y:cy},p,factor); cx=p.x; cy=p.y; });
  return d;
}
function nnRoute(wh, stops, factor){
  const left=stops.slice(), out=[];
  let cx=wh.x, cy=wh.y;
  while(left.length){
    let bi=0,bd=Infinity;
    left.forEach(function(s,i){ const d=distKm({x:cx,y:cy},s,factor); if(d<bd){bd=d;bi=i;} });
    const s=left.splice(bi,1)[0]; out.push(s); cx=s.x; cy=s.y;
  }
  return out;
}
function twoOpt(wh, stops, factor){
  let best=stops.slice(), bestD=routeDistance(wh,best,factor), improved=true, guard=0;
  while(improved && guard++<150){
    improved=false;
    for(let i=0;i<best.length-1;i++){
      for(let j=i+1;j<best.length;j++){
        const cand=best.slice(0,i).concat(best.slice(i,j+1).reverse()).concat(best.slice(j+1));
        const d=routeDistance(wh,cand,factor);
        if(d<bestD-1e-9){ best=cand; bestD=d; improved=true; }
      }
    }
  }
  return {route:best,distanceKm:bestD};
}
function planTrips(stops, whsById, P){
  const factor=num(P.roadFactor,1.35), serviceHr=num(P.serviceMinPerStop,5)/60;
  const groups={};
  stops.forEach(function(s){ const k=s.warehouseId+'@'+s.departHr; (groups[k]=groups[k]||[]).push(s); });
  const trips=[], byStop={}, board={};

  Object.keys(groups).forEach(function(k){
    const list=groups[k].slice().sort(function(a,b){ return a.dueHr-b.dueHr; });
    const wh=whsById[list[0].warehouseId];
    const fleet=(wh.vehicles&&wh.vehicles.length)?wh.vehicles:[defaultVehicle(wh.id,0)];
    const open=[];

    list.forEach(function(s){
      let best=null;
      open.forEach(function(t){
        if(!tripFits(t,s)) return;
        if(!best || tripSpare(t)<tripSpare(best)) best=t;
      });
      if(!best){
        const used={}; open.forEach(function(t){ used[t.vehicleId]=1; });
        const cand=fleet.filter(function(v){ return !used[v.id]; })
          .sort(function(a,b){ return num(b.capacityUnits,0)-num(a.capacityUnits,0); });
        const v=cand[0]||fleet[0];
        best={tripId:'T'+(trips.length+1), warehouseId:wh.id,
          warehouseName:wh.name||wh.id, vehicleId:v.id, vehicle:v, departHr:s.departHr,
          stops:[], loadUnits:0, loadKg:0, loadM3:0, vehicleReused:!cand.length};
        open.push(best); trips.push(best);
      }
      best.stops.push(s);
      best.loadUnits+=num(s.units,0); best.loadKg+=num(s.weightKg,0); best.loadM3+=num(s.volumeM3,0);
    });

    open.forEach(function(t){
      const v=t.vehicle, speed=Math.max(1,num(v.speedKmH,30));
      const imp=twoOpt(wh, nnRoute(wh, t.stops, factor), factor);
      let cum=0, prev={x:wh.x,y:wh.y};
      const stopsOut=imp.route.map(function(s,i){
        const leg=distKm(prev,s,factor); cum+=leg; prev=s;
        const eta=round(t.departHr+cum/speed+serviceHr*i,2);
        byStop[s.key]={tripId:t.tripId,vehicleId:v.id,seq:i+1,departHr:t.departHr,etaHr:eta,
          lateHr:Math.max(0,round(eta-s.dueHr,2))};
        return {seq:i+1,orderId:s.orderId,customerId:s.customerId,customerName:s.customerName,
          x:s.x,y:s.y,units:round(s.units,2),weightKg:round(s.weightKg,2),
          etaHr:eta,dueHr:s.dueHr,stopLateHr:Math.max(0,round(eta-s.dueHr,2))};
      });
      const returnLeg=imp.route.length?distKm(prev,{x:wh.x,y:wh.y},factor):0;
      const totalKm=imp.distanceKm+returnLeg, driveHr=totalKm/speed;
      t.stops=stopsOut;
      t.stopsCount=stopsOut.length;
      t.distanceKm=round(totalKm,2);
      t.driveHr=round(driveHr,2);
      t.cost=round(totalKm*num(v.costPerKm,0.7)+num(v.driverCostPerTrip,35),2);
      t.returnHr=round(t.departHr+driveHr+serviceHr*stopsOut.length,2);
      t.loadPct=round(100*Math.max(
        t.loadUnits/Math.max(1e-9,num(v.capacityUnits,1)),
        t.loadKg/Math.max(1e-9,num(v.capacityKg,1)),
        t.loadM3/Math.max(1e-9,num(v.capacityM3,1))),1);
      t.capacityUnits=num(v.capacityUnits,0); t.capacityKg=num(v.capacityKg,0);
      t.capacityM3=num(v.capacityM3,0); t.speedKmH=speed;
      t.loadUnits=round(t.loadUnits,2); t.loadKg=round(t.loadKg,2); t.loadM3=round(t.loadM3,4);
      delete t.vehicle;
      const b=board[t.warehouseId]=board[t.warehouseId]||{warehouseId:t.warehouseId,warehouseName:wh.name||wh.id,waves:{}};
      const wv=b.waves[t.departHr]=b.waves[t.departHr]||{departHr:t.departHr,orders:0,units:0,trips:0};
      wv.orders+=stopsOut.length; wv.units=round(wv.units+t.loadUnits,2); wv.trips+=1;
    });
  });

  const boardOut=Object.keys(board).map(function(k){
    const b=board[k];
    const waves=Object.keys(b.waves).map(function(h){ return b.waves[h]; })
      .sort(function(a,b2){ return a.departHr-b2.departHr; });
    return {warehouseId:b.warehouseId,warehouseName:b.warehouseName,waves:waves};
  });
  return {trips:trips,byStop:byStop,board:boardOut};
}

// ------------------------------------------------ orchestration helpers ---
function normWarehouses(body){
  return (body.warehouses||[]).map(function(w){
    return {id:w.id, name:w.name||w.id, x:num(w.x,0), y:num(w.y,0),
      capacity:num(w.capacity,1e9), storageM3:num(w.storageM3,1e9),
      throughputPerHr:num(w.throughputPerHr,1e9),
      handlingCostPerUnit:num(w.handlingCostPerUnit,0),
      fixedOperatingCost:num(w.fixedOperatingCost,0),
      open:w.open!==false,
      waves:(Array.isArray(w.waves)&&w.waves.length)?w.waves.slice():[8,12,16,20],
      vehicles:(Array.isArray(w.vehicles)&&w.vehicles.length)?w.vehicles:[defaultVehicle(w.id,0)],
      stock:w.stock||{}, reserved:w.reserved||{}, incoming:w.incoming||[]};
  });
}
function invFromWarehouses(whs){
  const inv={};
  whs.forEach(function(w){
    Object.keys(w.stock||{}).forEach(function(pid){
      invRecord(inv,w.id,pid); inv[w.id][pid].onHand=num(w.stock[pid],0);
    });
    Object.keys(w.reserved||{}).forEach(function(pid){
      invRecord(inv,w.id,pid); inv[w.id][pid].reserved=num(w.reserved[pid],0);
    });
    (w.incoming||[]).forEach(function(i){
      invRecord(inv,w.id,i.productId);
      inv[w.id][i.productId].incoming.push({qty:num(i.qty,0),etaHr:num(i.etaHr,0)});
    });
  });
  return inv;
}
function availableMap(w){
  const out={}; const keys={};
  Object.keys(w.stock||{}).forEach(function(k){ keys[k]=1; });
  Object.keys(w.reserved||{}).forEach(function(k){ keys[k]=1; });
  Object.keys(keys).forEach(function(pid){
    out[pid]=Math.max(0,num((w.stock||{})[pid],0)-num((w.reserved||{})[pid],0));
  });
  return out;
}
function productIndex(products){
  const idx={}; (products||[]).forEach(function(p){ idx[p.id]=p; }); return idx;
}
// Flatten orders into the order-line rows the C++ engine consumes.
// Line weightKg / volumeM3 are PER UNIT unless a *Total variant is supplied.
function flattenLines(orders, pidx){
  const lines=[];
  (orders||[]).forEach(function(o){
    (o.lines||[]).forEach(function(l){
      const qty=Math.max(0,num(l.qty,0));
      if(qty<=0) return;
      const p=pidx[l.productId]||{};
      const wUnit=l.weightKgTotal!=null?0:(l.weightKgPerUnit!=null?num(l.weightKgPerUnit,0):num(l.weightKg,num(p.weightKg,0)));
      const vUnit=l.volumeM3Total!=null?0:(l.volumeM3PerUnit!=null?num(l.volumeM3PerUnit,0):num(l.volumeM3,num(p.volumeM3,0)));
      const wTot=l.weightKgTotal!=null?num(l.weightKgTotal,0):wUnit*qty;
      const vTot=l.volumeM3Total!=null?num(l.volumeM3Total,0):vUnit*qty;
      lines.push({orderId:o.id, productId:l.productId, destId:o.customerId||o.id,
        x:num(o.x,0), y:num(o.y,0), qty:qty, weightKg:wTot, volumeM3:vTot,
        deadlineHr:num(o.dueHr,24), unitValue:num(l.unitPrice,num(p.unitValue,0)),
        priority:priorityOf(o.priority), key:o.id+'|'+l.productId,
        lineIndex:lines.length});
    });
  });
  return lines;
}
// Expected demand per site per SKU, derived from today's orders by nearest dock.
function deriveDemandFromOrders(orders, whs, factor){
  const dem={}; whs.forEach(function(w){ dem[w.id]={}; });
  (orders||[]).forEach(function(o){
    (o.lines||[]).forEach(function(l){
      let best=null,bd=Infinity;
      whs.forEach(function(w){
        if(!w.open) return;
        const d=distKm({x:num(o.x,0),y:num(o.y,0)},w,factor==null?1.35:factor);
        if(d<bd){ bd=d; best=w; }
      });
      if(!best) return;
      dem[best.id][l.productId]=num(dem[best.id][l.productId],0)+num(l.qty,0);
    });
  });
  return dem;
}

// =========================== ORDER FULFILLMENT PLANNER ======================
// One call answers the whole operational question for a batch of orders:
// allocate -> schedule waves -> assign vehicles -> update inventory -> report.
function planFulfillment(runWlopt, body, companyId){
  const t0=Date.now();
  body=body||{};
  const P=Object.assign({},DEFAULT_PARAMS,body.params||{});
  const OPT=Object.assign({},DEFAULT_OPTIONS,body.options||{});
  const whs=normWarehouses(body);
  const orders=(body.orders||[]).map(function(o){
    return {id:String(o.id||o.orderId), customerId:String(o.customerId||o.destId||o.id),
      customerName:String(o.customerName||o.customerId||o.id),
      x:num(o.x,0), y:num(o.y,0), placedHr:num(o.placedHr,0),
      dueHr:num(o.dueHr!=null?o.dueHr:o.deadlineHr,24),
      priority:priorityName(o.priority),
      lines:(o.lines||[]).map(function(l){
        return {productId:String(l.productId), qty:num(l.qty,0), unitPrice:num(l.unitPrice,0),
          weightKg:num(l.weightKgPerUnit!=null?l.weightKgPerUnit:l.weightKg,0),
          volumeM3:num(l.volumeM3PerUnit!=null?l.volumeM3PerUnit:l.volumeM3,0)};
      })};
  });
  const pidx=productIndex(body.products);
  const ordersById={}, whsById={};
  orders.forEach(function(o){ ordersById[o.id]=o; });
  whs.forEach(function(w){ whsById[w.id]=w; });

  // Inventory: caller may pass an explicit snapshot (from /api/inventory),
  // otherwise we build it from each warehouse's stock/reserved/incoming fields.
  let inv=body.inventory? JSON.parse(JSON.stringify(body.inventory)) : invFromWarehouses(whs);

  const lines=flattenLines(orders,pidx);
  const lineByKey={}; lines.forEach(function(l,i){ lineByKey[l.orderId+'|'+l.productId]=i; });

  if(!whs.length||!lines.length){
    return {error:'warehouses and orders (with lines) are required',
      warehouses:whs.length, lines:lines.length};
  }

  // ---- 1. ORDER ALLOCATION (C++: generalized assignment) ----
  const pro=runWlopt({mode:'fulfill',
    warehouses:whs.map(function(w){
      return {id:w.id,x:w.x,y:w.y,capacity:w.capacity,storageM3:w.storageM3,
        throughputPerHr:w.throughputPerHr,handlingCostPerUnit:w.handlingCostPerUnit,
        fixedOperatingCost:w.fixedOperatingCost,open:w.open,stock:availableMap(w)};
    }),
    orders:lines, params:P});

  // ---- 2. DISPATCH SCHEDULING + 3. DELIVERY ASSIGNMENT ----
  const assignments=[], stops=[];
  (pro.allocations||[]).forEach(function(a){
    const order=ordersById[a.orderId]||{x:0,y:0,dueHr:24,customerName:a.orderId,priority:'standard'};
    const li=lineByKey[a.orderId+'|'+a.productId];
    const line=li!=null?lines[li]:{qty:a.qty,weightKg:0,volumeM3:0};
    const wh=whsById[a.warehouseId];
    const prep=prepHrFor(wh,a.qty,P);
    const sched=scheduleDispatch(wh,order.priority,order.dueHr,a.transitHr,prep,P);
    const st=invAt(inv,wh.id,a.productId,order.dueHr);
    const reqQty=line.qty||a.qty;
    const perW=reqQty>0?line.weightKg/reqQty:0, perV=reqQty>0?line.volumeM3/reqQty:0;
    const key=a.orderId+'|'+a.productId;
    assignments.push({key:key, orderId:a.orderId, productId:a.productId,
      customerId:order.customerId, customerName:order.customerName,
      x:order.x, y:order.y, priority:order.priority, dueHr:order.dueHr,
      requestedQty:round(reqQty,2), qty:round(a.qty,2), split:!!a.split,
      warehouseId:wh.id, warehouseName:wh.name||wh.id,
      distKm:round(a.distKm,2), transitHr:round(a.transitHr,2),
      handlingHr:round(prep,2), etaHr:sched.etaHr,
      departHr:sched.departHr, cutoffHr:sched.cutoffHr,
      slackHr:sched.slackHr, lateHr:sched.lateHr, atRisk:sched.atRisk,
      wavePolicy:sched.wavePolicy,
      deliveryCost:round(a.deliveryCost,2), shipmentCost:round(a.shipmentCost,2),
      handlingCost:round(a.handlingCost,2), latePenalty:round(a.latePenalty,2),
      totalCost:round(a.totalCost,2),
      stockAtPick:{onHand:st.onHand,reserved:st.reserved,available:st.available,
        incomingByDue:round(st.incomingByDue,0),incoming:st.incoming},
      candidates:explainLine(order,{productId:a.productId,qty:reqQty},whs,inv,P)});
    stops.push({key:key, orderId:a.orderId, customerId:order.customerId,
      customerName:order.customerName, x:order.x, y:order.y, dueHr:order.dueHr,
      warehouseId:wh.id, departHr:sched.departHr, units:a.qty,
      weightKg:perW*a.qty, volumeM3:perV*a.qty});
  });

  let tripPlan={trips:[],byStop:{},board:[]};
  if(OPT.includeRoutes!==false) tripPlan=planTrips(stops,whsById,P);
  assignments.forEach(function(a){
    const s=tripPlan.byStop[a.key];
    if(s){ a.tripId=s.tripId; a.vehicleId=s.vehicleId; a.stopSeq=s.seq;
      a.stopEtaHr=s.etaHr; a.stopLateHr=s.lateHr; }
  });

  // ---- 4. INVENTORY LEDGER + PRODUCT-WAREHOUSE MAP ----
  const matrix=inventoryMatrix(whs,inv,assignments);

  const orderRows=orders.map(function(o){
    const mine=assignments.filter(function(a){ return a.orderId===o.id; });
    const reqUnits=o.lines.reduce(function(s,l){ return s+l.qty; },0);
    const gotUnits=mine.reduce(function(s,a){ return s+a.qty; },0);
    const used=[]; mine.forEach(function(a){ if(used.indexOf(a.warehouseId)<0) used.push(a.warehouseId); });
    const lateHr=mine.reduce(function(s,a){ return Math.max(s,a.lateHr); },0);
    const departHr=mine.length?Math.min.apply(null,mine.map(function(a){return a.departHr;})):null;
    const etaHr=mine.length?Math.max.apply(null,mine.map(function(a){return a.etaHr;})):null;
    return {orderId:o.id, customerId:o.customerId, customerName:o.customerName,
      x:o.x, y:o.y, priority:o.priority, placedHr:o.placedHr, dueHr:o.dueHr,
      requestedUnits:round(reqUnits,2), fulfilledUnits:round(gotUnits,2),
      status: gotUnits<=1e-9?'unfulfilled':(gotUnits+1e-9<reqUnits?'partial':'fulfilled'),
      warehouses:used, shipments:mine.length,
      cost:round(mine.reduce(function(s,a){return s+a.totalCost;},0),2),
      departHr:departHr, etaHr:etaHr,
      slackHr:(etaHr!=null?round(o.dueHr-etaHr,2):null),
      lateHr:round(lateHr,2), onTime:lateHr<=1e-9,
      lines:o.lines.map(function(l){
        const a=mine.filter(function(x){ return x.productId===l.productId; });
        return {productId:l.productId, qty:round(l.qty,2),
          allocated:round(a.reduce(function(s,x){return s+x.qty;},0),2),
          warehouses:a.map(function(x){
            return {warehouseId:x.warehouseId, qty:round(x.qty,2), warehouseName:x.warehouseName,
              tripId:x.tripId, vehicleId:x.vehicleId, departHr:x.departHr, etaHr:x.etaHr,
              split:x.split, atRisk:x.atRisk}; }) };
      })};
  });

  // ---- unfulfilled lines get a concrete recovery path, not just a failure ----
  const unfulfilled=(pro.unfulfilled||[]).map(function(u){
    const order=ordersById[u.orderId]||{dueHr:24,x:0,y:0};
    const inbound=[];
    whs.forEach(function(w){
      const inc=(inv[w.id]&&inv[w.id][u.productId]&&inv[w.id][u.productId].incoming)||[];
      inc.forEach(function(i){ inbound.push({warehouseId:w.id,qty:num(i.qty,0),etaHr:num(i.etaHr,0)}); });
    });
    inbound.sort(function(a,b){ return a.etaHr-b.etaHr; });
    let recovery={type:'lost', note:'no stock in the network and nothing inbound - escalate to procurement'};
    if(inbound.length){
      recovery={type:'backorder', warehouseId:inbound[0].warehouseId, qty:round(inbound[0].qty,0),
        etaHr:inbound[0].etaHr,
        note:'promise after inbound replenishment: '+inbound[0].qty+' units land at '+
          inbound[0].warehouseId+' in '+inbound[0].etaHr+'h'};
    } else {
      let best=null,bd=Infinity;
      whs.forEach(function(w){
        const st=invLook(inv,w.id,u.productId);
        if(st.available<=1e-9) return;
        const d=distKm({x:order.x,y:order.y},w,P.roadFactor);
        if(d<bd){ bd=d; best={w:w,st:st,d:d}; }
      });
      if(best) recovery={type:'transfer', warehouseId:best.w.id, qty:round(best.st.available,0),
        distKm:round(best.d,2),
        note:'stock exists at '+best.w.id+' ('+round(best.st.available,0)+' units, '+round(best.d,1)+
          'km) but was blocked because: '+u.reason+' - raise maxServiceRadius/capacity or rebalance'};
    }
    return {orderId:u.orderId, productId:u.productId, qty:round(u.qty,2),
      reason:u.reason, recovery:recovery};
  });

  // ---- 5. KPIs ----
  const reasonCounts={};
  unfulfilled.forEach(function(u){ reasonCounts[u.reason]=(reasonCounts[u.reason]||0)+1; });
  const vehicleSet={};
  tripPlan.trips.forEach(function(tr){ vehicleSet[tr.vehicleId]=1; });
  const lateLines=assignments.filter(function(a){ return a.lateHr>1e-9; }).length;
  const t=pro.totals||{};
  const routeKm=round(tripPlan.trips.reduce(function(s,tr){return s+tr.distanceKm;},0),2);
  const routeCost=round(tripPlan.trips.reduce(function(s,tr){return s+tr.cost;},0),2);
  const avgLoad=tripPlan.trips.length?
    round(tripPlan.trips.reduce(function(s,tr){return s+tr.loadPct;},0)/tripPlan.trips.length,1):0;
  const statusCounts={fulfilled:0,partial:0,unfulfilled:0};
  orderRows.forEach(function(o){ statusCounts[o.status]=(statusCounts[o.status]||0)+1; });
  const totals=Object.assign({},t,{
    routeCost:routeCost, routeKm:routeKm, trips:tripPlan.trips.length,
    vehiclesUsed:Object.keys(vehicleSet).length,
    avgTruckLoadPct:avgLoad,
    atRiskLines:assignments.filter(function(a){return a.atRisk;}).length,
    lateLines:lateLines,
    onTimePct:(t.shipments? round(100*(1-lateLines/t.shipments),1):100),
    ordersUnfulfilled:statusCounts.unfulfilled, ordersPartial:statusCounts.partial,
    ordersFulfilled:statusCounts.fulfilled,
    linesRequested:lines.length, linesUnfulfilled:unfulfilled.length,
    reasonCounts:reasonCounts,
    sitesUsed:Object.keys(assignments.reduce(function(m,a){ m[a.warehouseId]=1; return m; },{})).length
  });

  // ---- 6. OPTIONAL: storage plan + rebalance on the SAME snapshot ----
  // Storage plans against the full forecast horizon; rebalancing fixes TODAY's
  // order book (that is the decision an ops controller actually makes), so the
  // two use different demand bases unless the caller passes its own.
  const demand=body.demand||deriveDemandFromOrders(orders,whs,P.roadFactor);
  const todayDemand=deriveDemandFromOrders(orders,whs,P.roadFactor);
  let storage=null, rebalance=null;
  if(OPT.includeStorage)
    storage=storagePlan(runWlopt,{warehouses:whs,products:body.products||[],demand:demand});
  if(OPT.includeRebalance)
    rebalance=rebalancePlan(runWlopt,{warehouses:whs,
      demand:body.rebalanceDemand||todayDemand, params:P,
      stockoutPenaltyPerUnit:body.stockoutPenaltyPerUnit});

  // ---- 7. COMMIT the plan: consume allocated stock for real ----
  let committed=null;
  if(OPT.commit){
    assignments.forEach(function(a){
      inv=applyInventoryOp(inv,{type:'commit',warehouseId:a.warehouseId,
        productId:a.productId,qty:a.qty}).inventory;
    });
    committed={applied:assignments.length,
      units:round(assignments.reduce(function(s,a){return s+a.qty;},0),2),
      inventory:inv};
  }

  // ---- 8. NARRATION (template; an LLM can rewrite the same numbers) ----
  const expressEarly=assignments.filter(function(a){ return a.priority!=='standard'; }).length;
  const onDemand=assignments.filter(function(a){ return a.wavePolicy==='on-demand-immediate'; }).length;
  const explain=[];
  explain.push(orders.length+' orders / '+lines.length+' lines -> '+assignments.length+
    ' shipments from '+num(totals.sitesUsed,0)+' of '+whs.length+' sites; fill rate '+
    round(num(totals.fillRate,100),1)+'% by units, on-time '+num(totals.onTimePct,100)+'%.');
  explain.push('Cost $'+round(num(totals.totalCost,0),0)+' = delivery $'+
    round(num(totals.deliveryCost,0),0)+' + shipment fees $'+round(num(totals.shipmentCost,0),0)+
    ' + pick/pack $'+round(num(totals.handlingCost,0),0)+
    (num(totals.latePenalty,0)>0? ' + late penalties $'+round(totals.latePenalty,0):'')+'.');
  explain.push('Dispatch: '+onDemand+' express/critical line(s) left immediately (on-demand), '+
    (expressEarly-onDemand>0? (expressEarly-onDemand)+' took the earliest safe wave, ':'')+
    (assignments.length-expressEarly)+' standard line(s) waited for the LATEST safe wave so the dock could consolidate.');
  if(OPT.includeRoutes!==false)
    explain.push('Delivery assignment: '+tripPlan.trips.length+' trips / '+
      Object.keys(vehicleSet).length+' vehicles, '+routeKm+' dock-to-door road km, $'+routeCost+
      ', avg truck load '+avgLoad+'%.'+(num(totals.splits,0)>0? ' '+num(totals.splits,0)+
      ' line(s) split across docks (only when cheaper than a second trip).':''));
  if(committed)
    explain.push('Inventory committed: '+committed.units+' units deducted from on-hand stock.');
  if(storage)
    explain.push('Storage plan: '+round(num(storage.coveragePct,0),1)+
      '% of forecast demand fits in '+round(num(storage.cubeUtilPct,0),1)+'% of cube; '+
      (storage.underStocked||[]).length+' SKU-site(s) capacity-limited.');
  if(rebalance)
    explain.push('Rebalance: '+(rebalance.moves||[]).length+' transfer(s), '+
      num(rebalance.movedUnits,0)+' units for $'+round(num(rebalance.totalCost,0),2)+
      ' (net benefit $'+num(rebalance.benefit,0)+' in avoided stockouts).');
  unfulfilled.slice(0,4).forEach(function(u){
    explain.push('Short '+u.orderId+' '+u.productId+' x'+u.qty+' ('+u.reason+') -> '+
      u.recovery.type+': '+u.recovery.note+'.');
  });

  return {
    orders:orderRows, assignments:assignments, unfulfilled:unfulfilled,
    trips:tripPlan.trips, dispatchBoard:tripPlan.board,
    productWarehouseMap:matrix.byProduct, inventory:matrix.rows,
    loads:pro.loads, coverage:pro.coverage, totals:totals,
    storage:storage, rebalance:rebalance, committed:committed,
    params:P, options:OPT, explain:explain,
    algorithmUsed:(pro.algorithmUsed||'priority-greedy')+
      ' | wave scheduling | best-fit vehicle packing | 2-opt routing',
    runtimeMs:Date.now()-t0, note:pro.note
  };
}

// ------------------------------------------- product-warehouse report -----
// The full SKU x site ledger: what was on the shelf, what this plan consumed,
// what is left, what is inbound. This is the table an ops controller works from.
function inventoryMatrix(whs, inv, assignments){
  const alloc={};
  (assignments||[]).forEach(function(a){
    const k=a.warehouseId+'|'+a.productId;
    alloc[k]=num(alloc[k],0)+num(a.qty,0);
  });
  const rows=[], byProduct={};
  whs.forEach(function(w){
    Object.keys(inv[w.id]||{}).forEach(function(pid){
      const st=invLook(inv,w.id,pid);
      const used=num(alloc[w.id+'|'+pid],0);
      const row={warehouseId:w.id, warehouseName:w.name||w.id, productId:pid,
        onHand:round(st.onHand,2), reserved:round(st.reserved,2), available:round(st.available,2),
        incomingQty:round(st.incomingSoon,2), incoming:st.incoming,
        allocated:round(used,2), afterOnHand:round(st.onHand-used,2),
        afterAvailable:round(st.available-used,2),
        overloaded: st.available-used < -1e-9};
      rows.push(row);
      (byProduct[pid]=byProduct[pid]||[]).push({warehouseId:w.id, warehouseName:w.name||w.id,
        onHand:row.onHand, reserved:row.reserved, available:row.available,
        incoming:row.incomingQty, allocated:row.allocated, afterOnHand:row.afterOnHand});
    });
  });
  return {rows:rows, byProduct:byProduct};
}

function storedWhPayload(whs){
  return whs.map(function(w){
    return {id:w.id,x:w.x,y:w.y,open:w.open,capacity:w.capacity,storageM3:w.storageM3,
      throughputPerHr:w.throughputPerHr,stock:w.stock};
  });
}

// ------------------------------------------ storage / rebalance endpoints --
function storagePlan(runWlopt, body){
  body=body||{};
  const whs=normWarehouses(body);
  return runWlopt({mode:'storeopt', warehouses:storedWhPayload(whs),
    products:body.products||[], demand:body.demand||{},
    defaultVolumeM3:num(body.defaultVolumeM3,0.01)});
}
function rebalancePlan(runWlopt, body){
  body=body||{};
  const whs=normWarehouses(body);
  const P=Object.assign({},DEFAULT_PARAMS,body.params||{});
  const demand=body.demand||deriveDemandFromOrders(body.orders||[],whs,P.roadFactor);
  const out=runWlopt({mode:'rebalance', warehouses:storedWhPayload(whs),
    demand:demand, params:P});
  const penalty=num(body.stockoutPenaltyPerUnit,25);
  out.benefit=round(num(out.movedUnits,0)*penalty-num(out.totalCost,0),2);
  out.stockoutPenaltyPerUnit=penalty;
  out.demand=demand;
  return out;
}

module.exports={
  DEFAULT_PARAMS:DEFAULT_PARAMS, DEFAULT_OPTIONS:DEFAULT_OPTIONS,
  demoFulfill:demoFulfill,
  planFulfillment:planFulfillment,
  storagePlan:storagePlan, rebalancePlan:rebalancePlan,
  applyInventoryOp:applyInventoryOp, emptyInventory:emptyInventory,
  invLook:invLook, invAt:invAt, inventoryMatrix:inventoryMatrix,
  deriveDemandFromOrders:deriveDemandFromOrders,
  priorityName:priorityName, priorityOf:priorityOf, defaultVehicle:defaultVehicle
};
