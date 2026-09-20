// WLO backend — ZERO npm deps (stdlib only). Bridges HTTP <-> C++ wlopt.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const url = require('url');

const PORT = process.env.PORT || 4000;
let defaultWlopt = path.join(__dirname, '..', 'cpp', 'wlopt');
if (!fs.existsSync(defaultWlopt) && fs.existsSync(defaultWlopt + '.exe')) {
  defaultWlopt += '.exe';
}
const WLOPT = process.env.WLOPT || defaultWlopt;
const ROOT = path.join(__dirname, '..');

function runWlopt(payload) {
  const r = spawnSync(WLOPT, [], {
    input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 64*1024*1024
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr||'wlopt failed').slice(0,2000));
  return JSON.parse(r.stdout);
}
function rng32(seed){ let a=seed>>>0; return function(){
  a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }
function genData(o){
  o=o||{};
  const n = Math.min(500, Math.max(3, o.neighborhoods||18));
  const m = Math.min(30, Math.max(2, o.candidates||6));
  const seed = o.seed!=null?o.seed:42, rng = rng32(seed);
  const mode = o.mode || 'mixed';
  // Normalized clusters used by the map projection. Bengaluru spreads demand
  // across its north, east, south, west and central urban areas.
  const centers = mode === 'bengaluru'
    ? [[50,50],[72,68],[73,38],[48,78],[27,56],[38,28],[62,20],[20,30]]
    : [[20,20],[80,30],[50,75],[25,70],[75,75]];
  const nb=[];
  for(let i=0;i<n;i++){
    let x,y;
    if(mode==='uniform'){ x=rng()*100; y=rng()*100; }
    else { const c=centers[Math.floor(rng()*centers.length)];
      x=Math.min(100,Math.max(0,c[0]+(rng()+rng()+rng()-1.5)*22));
      y=Math.min(100,Math.max(0,c[1]+(rng()+rng()+rng()-1.5)*22)); }
    const hotspot = (x>60&&y<45)?1.8:1.0;
    const demand = Math.max(5, Math.round((20+rng()*120)*hotspot));
    nb.push({id:'N'+(i+1), x:+x.toFixed(2), y:+y.toFixed(2), demand});
  }
  const cd=[];
  for(let j=0;j<m;j++)
    cd.push({id:'W'+(j+1), x:+(rng()*100).toFixed(2), y:+(rng()*100).toFixed(2),
      fixedCost: o.fixedCost!=null?o.fixedCost:1500,
      capacity: o.capacity!=null?o.capacity:800});
  return { neighborhoods: nb, candidates: cd };
}
function explain(sol, payload){
  payload=payload||{};
  const lines = [];
  const P = payload.params||{};
  lines.push('Opened '+sol.openWarehouses.length+' warehouse(s) ['+
    sol.openWarehouses.join(', ')+'] using '+sol.algorithmUsed+
    (sol.optimal?' (PROVEN OPTIMAL by branch-and-bound).':' (heuristic).'));
  lines.push('Total $'+sol.totalCost.toFixed(0)+' = delivery $'+
    sol.deliveryCost.toFixed(0)+' + fixed $'+sol.fixedCost.toFixed(0)+
    '. Avg distance '+sol.avgDistance.toFixed(2)+' km.');
  (sol.loads||[]).forEach(function(L){
    let c=null,u=null;
    (payload.candidates||[]).forEach(function(x){ if(x.id===L.id) c=x; });
    (sol.utilization||[]).forEach(function(x){ if(x.id===L.id) u=x; });
    const pct=u?(u.u*100).toFixed(1):'0';
    let tag='balanced.';
    if(u&&u.u>0.9) tag='nearly full: growth here forces a new warehouse.';
    if(u&&u.u<0.3) tag='underused: candidate for closure if fixed costs rise.';
    lines.push(L.id+': load '+L.load+'/'+(c?c.capacity:'?')+' ('+pct+'% util) - '+tag);
  });
  if((sol.unserved||[]).length)
    lines.push('Unserved ('+sol.unserved.length+'): '+
      sol.unserved.slice(0,8).join(', ')+' - outside radius or capacity full.');
  lines.push('Why: each neighborhood assigned to cheapest feasible open warehouse '+
    '(radius '+P.maxServiceRadius+', capacity-checked, demand-descending order).');
  return lines;
}
// GRIDPOINT seed: real Basavanagudi + Jayanagar neighborhoods, Bangalore.
// Lat/lng converted to a 0-100 normalized grid centred on the area.
// Schema is city-agnostic — swap any neighborhoods (name,x,y,demand) without code changes.
// Reference origin: 12.934°N 77.571°E  (Gandhi Bazaar, Basavanagudi)
// 1 degree lat ≈ 111 km, 1 degree lng ≈ 97 km at this latitude.
// We map: x = (lng - 77.55) * 97 * 5   y = (lat - 12.91) * 111 * 5  → ~0-100 range
function toGrid(lat,lng){ return { x:+((lng-77.55)*97*5).toFixed(2), y:+((lat-12.91)*111*5).toFixed(2) }; }
const NB_RAW=[
  // Basavanagudi cluster
  {id:'N1', name:'Gandhi Bazaar',    lat:12.9340, lng:77.5712, demand:420},
  {id:'N2', name:'DVG Road',         lat:12.9290, lng:77.5690, demand:310},
  {id:'N3', name:'Bull Temple Road', lat:12.9400, lng:77.5680, demand:380},
  {id:'N4', name:'Tagore Park',      lat:12.9250, lng:77.5730, demand:190},
  {id:'N5', name:'Sajjan Rao Circle',lat:12.9310, lng:77.5760, demand:260},
  {id:'N6', name:'NR Colony',        lat:12.9270, lng:77.5650, demand:230},
  {id:'N7', name:'Hanumanthanagar',  lat:12.9230, lng:77.5710, demand:175},
  {id:'N8', name:'VV Puram',         lat:12.9360, lng:77.5740, demand:345},
  // Jayanagar cluster
  {id:'N9',  name:'4th Block Jayanagar', lat:12.9280, lng:77.5830, demand:500},
  {id:'N10', name:'7th Block Jayanagar', lat:12.9220, lng:77.5810, demand:440},
  {id:'N11', name:'9th Block Jayanagar', lat:12.9180, lng:77.5850, demand:390},
  {id:'N12', name:'RV Road',             lat:12.9320, lng:77.5800, demand:280},
  {id:'N13', name:'11th Main Jayanagar', lat:12.9256, lng:77.5862, demand:320},
  {id:'N14', name:'Tilak Nagar',         lat:12.9348, lng:77.5878, demand:210},
  {id:'N15', name:'Jayanagar East',      lat:12.9290, lng:77.5890, demand:185},
  {id:'N16', name:'Jaya Nagar 3rd Block',lat:12.9312, lng:77.5822, demand:295},
];
const neighborhoods=NB_RAW.map(function(n){ const g=toGrid(n.lat,n.lng); return {id:n.id,name:n.name,x:g.x,y:g.y,demand:n.demand,lat:n.lat,lng:n.lng}; });
const CD_RAW=[
  {id:'W1', name:'Basavanagudi Hub',   lat:12.9300, lng:77.5700, capacity:900,  fixedCost:2000},
  {id:'W2', name:'Jayanagar Dock',     lat:12.9250, lng:77.5840, capacity:1100, fixedCost:2200},
  {id:'W3', name:'Gandhi Bazaar Depot',lat:12.9360, lng:77.5720, capacity:700,  fixedCost:1600},
  {id:'W4', name:'DVG Road Point',     lat:12.9270, lng:77.5680, capacity:650,  fixedCost:1500},
  {id:'W5', name:'South Bangalore DC', lat:12.9150, lng:77.5760, capacity:1400, fixedCost:2800},
  {id:'W6', name:'9th Block Node',     lat:12.9200, lng:77.5850, capacity:800,  fixedCost:1800},
];
const candidates=CD_RAW.map(function(c){ const g=toGrid(c.lat,c.lng); return {id:c.id,name:c.name,x:g.x,y:g.y,capacity:c.capacity,fixedCost:c.fixedCost,lat:c.lat,lng:c.lng}; });
const BENGALURU_DATA={ neighborhoods, candidates,
  meta:{ city:'Bangalore', areas:['Basavanagudi','Jayanagar'],
    note:'Real neighborhood lat/lng mapped to normalized 0-100 grid. Schema is city-agnostic.' }};

const year = require('./yearsim.js');
const expansion = require('./expansion.js');
const shared = require('./shared.js');
const envdb = require('./envdb.js');
const fulfill = require('./fulfill.js');
const whstore = require('./whstore.js');
// Per-company inventory ledger for the fulfillment layer (on-hand/reserved/incoming).
// Kept in-process like the rest of the repo's state: zero deps, no migrations.
const INV = {};
function invKeyFor(req){
  const me = bearer(req);
  return (me && me.companyId) ? me.companyId : 'demo';
}
function bearer(req){ const h=req.headers&&req.headers.authorization||''; const m=h.match(/^Bearer (.+)$/); return m?envdb.verify(m[1]):null; }
function send(res, code, obj, isText){
  const body = isText? String(obj) : JSON.stringify(obj);
  res.writeHead(code, {'Content-Type': isText?'text/plain':'application/json',
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Authorization'});
  res.end(body);
}
function readBody(req){
  return new Promise(function(res,rej){ let b='';
    req.on('data',function(c){b+=c; if(b.length>20*1024*1024) rej(new Error('body too large'));});
    req.on('end',function(){res(b);}); req.on('error',rej); });
}
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.csv':'text/csv','.png':'image/png'};
const server = http.createServer(function(req,res){
  const u = url.parse(req.url,true);
  if(req.method==='OPTIONS'){ send(res,200,{}); return; }
  (async function(){
    if(req.method==='GET' && (u.pathname==='/'||u.pathname==='/index.html')){
      const dist=path.join(ROOT,'frontend','dist','index.html');
      const f=fs.existsSync(dist)?dist:path.join(ROOT,'frontend','index.html');
      res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache','Expires':'0'});
      fs.createReadStream(f).pipe(res); return;
    }
    if(req.method==='GET' && u.pathname.indexOf('/assets/')===0){
      const f=path.join(ROOT,'frontend','dist',u.pathname.replace(/\.\./g,''));
      if(fs.existsSync(f)&&fs.statSync(f).isFile()){
        const ext=path.extname(f);
        res.writeHead(200,{'Content-Type':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream'});
        fs.createReadStream(f).pipe(res); return;
      }
      send(res,404,{error:'not found'}); return;
    }
    if(req.method==='GET' && u.pathname==='/sample.csv'){
      const f=path.join(ROOT,'data','sample.csv');
      res.writeHead(200,{'Content-Type':'text/csv'});
      fs.createReadStream(f).pipe(res); return;
    }
    if(req.method==='GET' && u.pathname==='/api/health'){
      send(res,200,{ok:true, wlopt:WLOPT, time:new Date().toISOString(),
        llm:(process.env.OPENROUTER_API_KEY||process.env.OPENAI_API_KEY)?('on:'+(process.env.OPENROUTER_MODEL||process.env.LLM_MODEL||'gpt-4o-mini')):'template-only',
        db:envdb.sbUrl()?'supabase:'+envdb.sbUrl():'local-only'}); return;
    }
    if(req.method==='GET' && u.pathname==='/api/demo'){
      send(res,200,genData({neighborhoods:18,candidates:6,seed:7,
        mode:'mixed',capacity:700,fixedCost:1500})); return;
    }
    // GRIDPOINT: Real Basavanagudi + Jayanagar neighborhoods (lat/lng mapped to x/y grid)
    // Coordinates normalized to 0-100 scale; Haversine applied in C++ via road metric.
    // Seed data is location-agnostic: any city's (x,y,demand) tuple works without code change.
    if(req.method==='GET' && u.pathname==='/api/bengaluru'){
      send(res,200,BENGALURU_DATA); return;
    }
    // GRIDPOINT: k=1..N cost sweep for infrastructure vs delivery trade-off chart
    if(req.method==='POST' && u.pathname==='/api/sweep'){
      const b=JSON.parse(await readBody(req)||'{}');
      if(!b.neighborhoods||!b.candidates){ send(res,400,{error:'neighborhoods + candidates required'}); return; }
      const P=Object.assign({deliveryCostPerKm:2,maxServiceRadius:60,
        algorithm:'localsearch',distanceMetric:'euclidean',roadFactor:1.35,
        randomSeed:42}, b.params||{});
      const fixedSetup=b.fixedSetupCost!=null?b.fixedSetupCost:1500;
      const maxK=Math.min(b.candidates.length, b.maxK||8);
      const sweep=[];
      for(let k=1;k<=maxK;k++){
        try{
          const res2=runWlopt(Object.assign({},b,{mode:'optimize',
            params:Object.assign({},P,{minWarehouses:k,maxWarehouses:k})}));
          sweep.push({k,deliveryCost:res2.deliveryCost,fixedCost:res2.fixedCost,
            infraCost:k*fixedSetup,totalCost:res2.deliveryCost+k*fixedSetup,
            openWarehouses:res2.openWarehouses,unserved:(res2.unserved||[]).length,
            algorithmUsed:res2.algorithmUsed});
        }catch(e){ sweep.push({k,error:String(e.message).slice(0,200)}); }
      }
      send(res,200,{sweep, note:'totalCost = deliveryCost + k×fixedSetupCost'}); return;
    }
    if(req.method==='GET' && u.pathname.indexOf('/app/')===0){
      const f=path.join(ROOT,'frontend',u.pathname.slice(5).replace(/\.\./g,''));
      if(fs.existsSync(f)&&fs.statSync(f).isFile()){
        res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
        fs.createReadStream(f).pipe(res); return;
      }
      send(res,404,{error:'not found'}); return;
    }
    if(req.method==='POST' && u.pathname==='/api/generate'){
      const b=JSON.parse(await readBody(req)||'{}');
      send(res,200,genData(b)); return;
    }
    const modes={'/api/optimize':'optimize','/api/compare':'compare',
      '/api/simulate':'simulate','/api/sensitivity':'sensitivity',
      '/api/median':'median','/api/explain':'optimize'};
    if(req.method==='POST' && modes[u.pathname]){
            const b=JSON.parse(await readBody(req)||'{}');
      const isMedian = u.pathname==='/api/median';
      if(!b.neighborhoods || (!isMedian && !b.candidates)){
        send(res,400,{error:'neighborhoods + candidates required'}); return;
      }
      const payload=Object.assign({}, b, {mode: b.mode||modes[u.pathname]});
      const out=runWlopt(payload);
      // normalize solver assignments array -> {neighborhoodId: warehouseId} map
      // (frontend maps expect a record; also fixes SVG assignment lines)
      const toMap=function(arr){ return arr.reduce(function(m,a){
        m[a.neighborhoodId]=a.warehouseId; return m; },{}); };
      if(Array.isArray(out.assignments)) out.assignments=toMap(out.assignments);
      if(u.pathname==='/api/compare'&&Array.isArray(out.results))
        out.results.forEach(function(r){ if(Array.isArray(r.assignments)) r.assignments=toMap(r.assignments); });
            if(u.pathname==='/api/explain') out.explanation=explain(out,b);
            if(u.pathname==='/api/optimize'){
        if(b.explain) out.explanation=explain(out,b);
        try{
          const P=b.params||{};
          const base=runWlopt(Object.assign({}, b, {mode:'optimize',
            params:Object.assign({},P,{minWarehouses:1,maxWarehouses:1,algorithm:'greedy'})}));
          out.baselineSingle={total:base.totalCost,open:base.openWarehouses};
          if(base.totalCost>0&&isFinite(base.totalCost))
            out.savingsPct=+((1-out.totalCost/base.totalCost)*100).toFixed(1);
        }catch(e){}
      }
      try{ const me2=bearer(req); envdb.saveRun({company_id:me2?me2.companyId:null, name:(b.params&&b.params.algorithm||'auto')+' run',
        algorithm:(b.params&&b.params.algorithm)||'auto', warehouse_count:out.openWarehouses.length,
        total_cost:Math.round(out.totalCost), avg_distance:+out.avgDistance.toFixed(2), runtime_ms:Math.round(out.runtimeMs)}); }catch(e){}
      try{ const log=JSON.parse('[]'); }catch(e){}
      if(u.pathname==='/api/simulate'){
        // expected-demand network: per-warehouse loads + condition narration
        try{
          const gm=out.growthMult||1;
          const Ng=(b.neighborhoods||[]).map(function(n){
            return {id:n.id,x:n.x,y:n.y,demand:Math.max(1,Math.round((n.demand||0)*gm))}; });
          const net=runWlopt({neighborhoods:Ng, candidates:b.candidates,
            params:b.params||{}, mode:'optimize'});
          const caps={}; (b.candidates||[]).forEach(function(c){ caps[c.id]=c.capacity; });
          out.expectedNetwork={
            openWarehouses:net.openWarehouses, unserved:net.unserved,
            totalCost:net.totalCost,
            warehouseLoads:(net.utilization||[]).map(function(u){
              const c=(b.candidates||[]).find(function(x){ return x.id===u.id; });
              return {id:u.id, name:(c&&c.name)||u.id,
                load:Math.round(u.u*(caps[u.id]||0)), capacity:caps[u.id]||0, util:+u.u.toFixed(3)};
            })};
          out.grownDemand=Ng.reduce(function(m,n){ m[n.id]=n.demand; return m; },{});
        }catch(e){ out.expectedNetwork=null; }
        out.growthPct=Math.round(((out.growthMult||1)-1)*100);
        expansion.narrateSim(out, function(err2, nr){
          out.summary=(nr&&nr.text)?nr.text.split(/\n+/).filter(function(l){return l.trim();}):[];
          out.narrVia=(nr&&nr.via)||'template';
          send(res,200,out);
        });
        return;
      }
      send(res,200,out); return;
    }
    if(req.method==='POST' && u.pathname==='/api/optimize/insights'){
      // LLM "AI Plan Review" for an already-computed optimization result. The
      // Optimization page fires this in parallel with /api/optimize so the plan
      // renders instantly and the AI card fills in when the model answers
      // (template fallback guarantees the card is never empty).
      const b=JSON.parse(await readBody(req)||'{}');
      const sol=b.solution||b.result||b.sol;
      if(!sol){ send(res,400,{error:'solution required'}); return; }
      expansion.narrateOptimize({sol:sol, candidates:b.candidates||[],
        params:b.params||{}, savingsPct:b.savingsPct, nbCount:b.nbCount},
        function(err,out){
          send(res,200,{
            summary:(out&&out.text)?out.text.split(/\n+/).filter(function(l){return l.trim();}):[],
            narrVia:(out&&out.via)||'template'});
        });
      return;
    }
    if(req.method==='POST' && u.pathname==='/api/year'){

      // 365-day growth lab: monthly re-optimize, pressure, new-wh proposal,
      // reconnect + money/time/labour + LLM narration.
      const b=JSON.parse(await readBody(req)||'{}');
      if(!b.neighborhoods||!b.candidates){
        send(res,400,{error:'neighborhoods + candidates required'}); return;
      }
      const P=Object.assign({deliveryCostPerKm:2,maxServiceRadius:60,
        minWarehouses:1,maxWarehouses:3,distanceMetric:'euclidean',
        roadFactor:1.35,algorithm:'localsearch',randomSeed:42,
        saIterations:3000}, b.params||{});
      const Y=Object.assign({months:12,dailyGrowthPct:0.12,hotspotMult:1.6,
        weeklyAmp:0.12,annualAmp:0.10,noiseCv:0.06,utilThreshold:0.85,
        newCapacity:null,newFixedCost:1500,kmPerHour:30,wagePerHour:18,
        litresPerKm:0.12,fuelPrice:1.5}, b.year||{});
      const o=year.runYear(b.neighborhoods,b.candidates,P,Y,runWlopt);
      o.year=Y; o.params=P;
      // narration: LLM (OpenRouter/OpenAI-compatible) with template fallback +
      // retry + quality gate — coordinates always come from the data, not text.
      year.llmNarrate(o, function(err, narr){
        o.narration = (narr&&narr.text? [narr.text] : year.templateNarr(o));
        o.narrVia = (narr&&narr.via) || 'template';
        send(res,200,o);
      });
      return;
    }
    if(req.method==='POST' && u.pathname==='/api/narrate'){
      // LLM narrator: pass a /api/year result (or {yearResult}) -> story text.
      // Uses OPENAI_API_KEY / LLM_BASE / LLM_MODEL if set, else template.
      // Robust: missing fields -> template with what we have.
      const b=JSON.parse(await readBody(req)||'{}');
      const yr=b.yearResult||b;
      if(!yr.proposal||!yr.stats){
        send(res,200,{text:(yr.narration||['Run /api/year first for the full story.']).join
          ? (yr.narration||['Run /api/year first.']).join('\n')
          : String(yr.narration||'Run /api/year first.'),
          via:'template (need /api/year result)'});
        return;
      }
      const payload={firstPressure:yr.firstPressure,proposal:yr.proposal,
        baseSolMonth0:yr.baseSolMonth0,newSolEnd:yr.newSolEnd,
        totalYearBase:yr.totalYearBase,totalYearNew:yr.totalYearNew,
        saved:yr.saved,stats:yr.stats,year:yr.year||b.year||{}};
      year.llmNarrate(payload, function(err, out){
        if(err){ send(res,500,{error:String(err)}); return; }
        send(res,200,out);
      });
      return;
    }
    if(req.method==='POST' && u.pathname==='/api/expansion'){
      // Expansion advisor: given a demand-growth %, recommend which existing
      // warehouses to expand and by how much, whether/where to open a new
      // warehouse, re-optimize the network, and narrate it via LLM.
      const b=JSON.parse(await readBody(req)||'{}');
      if(!b.neighborhoods||!b.candidates){
        send(res,400,{error:'neighborhoods + candidates required'}); return;
      }
      const P=Object.assign({deliveryCostPerKm:2,maxServiceRadius:60,
        minWarehouses:1,maxWarehouses:4,distanceMetric:'euclidean',
        roadFactor:1.35,algorithm:'localsearch',randomSeed:42,
        saIterations:3000}, b.params||{});
      const X=Object.assign({growthPct:25,utilThreshold:0.85,
        newFixedCost:1500,buffer:1.2}, b.expansion||{});
      let o;
      try{ o=expansion.runExpansion(b.neighborhoods,b.candidates,P,X,runWlopt); }
      catch(e){ send(res,500,{error:String(e.message||e).slice(0,300)}); return; }
      o.params=P;
      expansion.llmSummarize(o, function(err, out){
        o.summary=(out&&out.text)?out.text.split(/\n+/).filter(Boolean)
          :expansion.templateSummary(o);
        o.narrVia=(out&&out.via)||'template';
        send(res,200,o);
      });
      return;
    }
    if(req.method==='POST' && u.pathname==='/api/tenants'){
      // multi-tenant sharing: register companies + warehouses (solo/shared/open),
      // agreements {sharePct, fixedPct} per partner, per-company demand slices.
      const b=JSON.parse(await readBody(req)||'{}');
      const companies=b.companies||[]; const warehouses=b.warehouses||[];
      const demands=b.demands||{};
      const P=Object.assign({deliveryCostPerKm:2,maxServiceRadius:200,
        minWarehouses:1,maxWarehouses:6,distanceMetric:'euclidean',
        roadFactor:1.35,algorithm:'localsearch',randomSeed:42}, b.params||{});
      const views={};
      companies.forEach(function(c){ views[c.id]=shared.viewFor(c.id,warehouses,companies); });
      const solo=shared.soloAll(companies,warehouses,demands,P,runWlopt);
      const j=shared.joint(companies,warehouses,demands,P,runWlopt);
      const cmp=shared.compareSoloJoint(solo,j);
      send(res,200,{companies:companies,warehouses:warehouses,views:views,
        solo:solo,joint:j,compare:cmp,
        note:'solo = each company on own view (own + shared slices, derated cap, prorated fixed). joint = pooled demand, one C++ run, fixed split pro-rata. Only shared/open warehouses are visible across companies.'});
      return;
    }
    if(req.method==='POST' && u.pathname==='/api/share'){
      // mutate visibility/agreement: {warehouses, op:{type, whId, ...}}
      // ops: setSolo|setShared|setOpen|agree|close
      const b=JSON.parse(await readBody(req)||'{}');
      let warehouses=(b.warehouses||[]).slice();
      const op=b.op||{};
      function find(id){ for(let i=0;i<warehouses.length;i++) if(warehouses[i].id===id) return i; return -1; }
      if(op.type==='setSolo'){ const i=find(op.whId); if(i>=0){ warehouses[i].visibility='solo'; warehouses[i].partners={}; } }
      else if(op.type==='setShared'){ const i=find(op.whId); if(i>=0){ warehouses[i].visibility='shared'; warehouses[i].partners=op.partners||warehouses[i].partners||{}; } }
      else if(op.type==='setOpen'){ const i=find(op.whId); if(i>=0){ warehouses[i].visibility='open'; warehouses[i].partners=op.partners||warehouses[i].partners||{}; } }
      else if(op.type==='agree'){ const i=find(op.whId); if(i>=0){ warehouses[i].partners=warehouses[i].partners||{}; warehouses[i].partners[op.partner]={sharePct:op.sharePct,fixedPct:(op.fixedPct!=null?op.fixedPct:op.sharePct)}; if(warehouses[i].visibility==='solo') warehouses[i].visibility='shared'; } }
      else if(op.type==='close'){ const i=find(op.whId); if(i>=0){ warehouses[i].visibility='solo'; warehouses[i].partners={}; } }
      send(res,200,{warehouses:warehouses}); return;
    }
    if(req.method==='POST' && u.pathname==='/api/auth/login'){
      const b=JSON.parse(await readBody(req)||'{}');
      const r=await envdb.login(b.email,b.password);
      if(!r){ send(res,401,{error:'bad email/password (see backend/.env USERS_JSON or demo logins)'}); return; }
      send(res,200,r); return;
    }
    if(req.method==='POST' && u.pathname==='/api/auth/signup'){
      const b=JSON.parse(await readBody(req)||'{}');
      try { send(res,201,await envdb.signup(b.email,b.password,b.companyName)); }
      catch(e) { send(res,400,{error:e.message||'Unable to create account'}); }
      return;
    }
    if(req.method==='POST' && u.pathname==='/api/datasets'){
      const me=bearer(req);
      if(!me){ send(res,401,{error:'Sign in before saving a dataset'}); return; }
      const b=JSON.parse(await readBody(req)||'{}');
      if(!Array.isArray(b.neighborhoods)||!Array.isArray(b.candidates)){ send(res,400,{error:'neighborhoods and candidates are required'}); return; }
      const out=await envdb.saveDataset({company_id:me.companyId,owner_email:me.sub,neighborhoods:b.neighborhoods,candidates:b.candidates,updated_at:new Date().toISOString()});
      send(res,200,out); return;
    }
    if(req.method==='GET' && u.pathname==='/api/history'){
      const me=bearer(req);
      const rows=await envdb.listRuns(me?me.companyId:null);
      if(rows){ send(res,200,{runs:rows,via:'supabase'}); return; }
      send(res,200,{runs:[],via:'none',note:'create table wlo_runs in Supabase (see README) or rely on local log'}); return;
    }
    if(req.method==='POST' && u.pathname==='/api/forecast'){
      const b=JSON.parse(await readBody(req)||'{}');
      const hist=b.history||{}; const h=b.horizon||4; const out={};
      Object.keys(hist).forEach(function(id){
        const arr=hist[id]; const n=arr.length, k=Math.min(3,n);
        const ma=arr.slice(-k).reduce(function(a,v){return a+v;},0)/k;
        let sx=0,sy=0,sxx=0,sxy=0;
        arr.forEach(function(v,i){sx+=i;sy+=v;sxx+=i*i;sxy+=i*v;});
        const slope=(n*sxy-sx*sy)/Math.max(1e-9,(n*sxx-sx*sx));
        const last=arr[n-1];
        const fc=[]; for(let t=0;t<h;t++) fc.push(Math.max(1,Math.round(last+slope*(t+1))));
        out[id]={movingAvg:+ma.toFixed(1),trend:+slope.toFixed(2),forecast:fc};
      });
      send(res,200,{forecasts:out,
        note:'Baseline (moving-average + linear trend). Feed forecast into /api/optimize.'});
      return;
    }
    if((req.method==='GET'||req.method==='POST') && u.pathname==='/api/fulfill/demo'){
      // Ready-to-run fulfillment scenario: SKUs, sites with stock/vehicles/waves,
      // inbound replenishments, orders with deadlines, and forecast demand.
      // POST additionally accepts {neighborhoods, warehouses} so the scenario is
      // generated from the ACTIVE dataset (and its seed) instead of the fixed
      // Bengaluru demo. Warehouses otherwise come from the persistent registry
      // (DB/file) so edits stick; stock/incoming are layered on top.
      const b = req.method==='POST' ? JSON.parse(await readBody(req)||'{}') : {};
      const seed = b.seed!=null ? +b.seed : (u.query.seed!=null ? +u.query.seed : 7);
      const ordersN = b.orders!=null ? +b.orders : (u.query.orders!=null ? +u.query.orders : 18);
      const nbIn = Array.isArray(b.neighborhoods) ? b.neighborhoods : null;
      const whIn = Array.isArray(b.warehouses) ? b.warehouses : null;
      const d=fulfill.demoFulfill({seed:seed, orders:ordersN, neighborhoods:nbIn, warehouses:whIn});
      if (!whIn) {
        try {
          const reg = await whstore.list(envdb);
          if (reg && reg.warehouses && reg.warehouses.length) {
            const stockGrid = { W1:{P1:24,P2:400,P3:6,P4:60}, W2:{P1:12,P2:900,P3:4,P4:25}, W3:{P1:6,P2:120,P3:10,P4:40}, W4:{P1:3,P2:200,P3:1,P4:6} };
            const incomingGrid = { W1:[{productId:'P1',qty:40,etaHr:18}], W3:[{productId:'P3',qty:12,etaHr:30}] };
            d.warehouses = reg.warehouses.map(function (w) {
              const fleet = (w.vehicles && w.vehicles.length ? w.vehicles : [{ id: w.id + '-V1', capacityUnits: 20, speedKmH: 30, maxStops: 8 }]);
              return Object.assign({}, w, {
                stock: Object.assign({}, stockGrid[w.id] || { P1: 10, P2: 200, P3: 5, P4: 20 }),
                incoming: (incomingGrid[w.id] || []).slice(), reserved: {}, vehicles: fleet,
              });
            });
            d.warehouseVia = reg.via;
          }
        } catch (e) {}
      }
      send(res,200,Object.assign({storedInventory:INV[invKeyFor(req)]||{},
        inventoryOps:'POST /api/inventory {op:{type:receive|reserve|release|commit|adjust,warehouseId,productId,qty}}'},d));
      return;
    }
    if(req.method==='GET' && u.pathname==='/api/warehouses'){
      // Persistent warehouse registry: Supabase wlo_warehouses -> backend/data/warehouses.json -> seed.
      const reg = await whstore.list(envdb);
      send(res,200,{warehouses:reg.warehouses, via:reg.via, updatedAt:reg.updatedAt}); return;
    }
    if(req.method==='POST' && u.pathname==='/api/warehouses'){
      // Save the whole registry (from the Warehouses UI). Body: {warehouses:[...]}.
      const b=JSON.parse(await readBody(req)||'{}');
      if(!Array.isArray(b.warehouses)){ send(res,400,{error:'warehouses array required'}); return; }
      const out = await whstore.saveAll(envdb, b.warehouses);
      send(res,200,{saved:true, via:out.via, count:out.warehouses.length, remote:out.remote, warehouses:out.warehouses}); return;
    }
    if(req.method==='POST' && u.pathname==='/api/fulfill'){
      // Full operational plan: allocate -> schedule waves -> assign vehicles ->
      // update inventory -> (optional) storage plan + rebalance.
      const b=JSON.parse(await readBody(req)||'{}');
      if(!b.warehouses||!b.orders){ send(res,400,{error:'warehouses + orders required'}); return; }
      const key=invKeyFor(req);
      INV[key]=INV[key]||{};
      if(!b.inventory && b.useStored!==false && Object.keys(INV[key]).length) b.inventory=INV[key];
      const out=fulfill.planFulfillment(runWlopt,b,key);
      if(out.error){ send(res,400,out); return; }
      if(out.committed) INV[key]=out.committed.inventory;
      try{ envdb.saveRun({company_id:key==='demo'?null:key,name:'fulfillment plan',
        algorithm:'fulfill',warehouse_count:out.totals.sitesUsed,
        total_cost:Math.round(out.totals.totalCost),
        avg_distance:+out.totals.avgTransitHr.toFixed(2),runtime_ms:out.runtimeMs}); }catch(e){}
      send(res,200,out); return;
    }
    if(req.method==='POST' && u.pathname==='/api/inventory'){
      // Inventory ledger ops: receive (add, or schedule inbound with etaHr),
      // reserve, release, commit (ship out), adjust (set), snapshot, reset.
      const b=JSON.parse(await readBody(req)||'{}');
      const key=invKeyFor(req);
      const base=b.inventory||INV[key]||{};
      const r=fulfill.applyInventoryOp(base,b.op||{type:'snapshot'});
      INV[key]=r.inventory;
      const whs=(b.warehouses||[]).map(function(w){return {id:w.id,name:w.name||w.id};});
      const rows=fulfill.inventoryMatrix(whs,INV[key],[]).rows;
      send(res,200,{result:r.result,inventory:INV[key],rows:rows}); return;
    }
    if(req.method==='POST' && u.pathname==='/api/rebalance'){
      // Move surplus SKUs to deficit sites (transportation problem) and, with
      // options.commit, actually apply the transfers to the inventory ledger.
      const b=JSON.parse(await readBody(req)||'{}');
      if(!b.warehouses){ send(res,400,{error:'warehouses required'}); return; }
      const key=invKeyFor(req);
      const out=fulfill.rebalancePlan(runWlopt,b);
      if(b.commit&&out.moves){
        INV[key]=INV[key]||{};
        out.applied=0;
        out.moves.forEach(function(m){
          INV[key]=fulfill.applyInventoryOp(INV[key],
            {type:'commit',warehouseId:m.from,productId:m.productId,qty:m.qty}).inventory;
          INV[key]=fulfill.applyInventoryOp(INV[key],
            {type:'receive',warehouseId:m.to,productId:m.productId,qty:m.qty}).inventory;
          out.applied++;
        });
        out.inventory=INV[key];
      }
      send(res,200,out); return;
    }
    if(req.method==='POST' && u.pathname==='/api/storage'){
      // How much of each SKU should each site hold? Fractional-knapsack by $/m3
      // (LP-optimal for the relaxation) + safety stock / reorder points.
      const b=JSON.parse(await readBody(req)||'{}');
      if(!b.warehouses){ send(res,400,{error:'warehouses required'}); return; }
      send(res,200,fulfill.storagePlan(runWlopt,b)); return;
    }
    if(req.method==='GET' && !u.pathname.startsWith('/api/')){
      const dist=path.join(ROOT,'frontend','dist','index.html');
      const f=fs.existsSync(dist)?dist:path.join(ROOT,'frontend','index.html');
      if(fs.existsSync(f)){
        res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache','Expires':'0'});
        fs.createReadStream(f).pipe(res); return;
      }
    }
    send(res,404,{error:'unknown route '+u.pathname});
  })().catch(function(e){ send(res,500,{error:String(e.message||e).slice(0,2000)}); });
});
if(require.main===module)
  server.listen(PORT, function(){console.log('WLO backend on :'+PORT);});
module.exports={server:server,runWlopt:runWlopt,genData:genData,explain:explain};
