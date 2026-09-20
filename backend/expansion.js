// expansion.js — demand-growth expansion advisor for the optimization page.
// Answers: which warehouses to expand, by how much, where to open a new one,
// re-optimized network on a map + LLM executive summary. Zero npm deps.
const year = require('./yearsim.js');
const geo = require('./geo.js');

function round100(v){ return Math.max(100, Math.ceil(v/100)*100); }

// real-world spot for a proposal: uses the shared, data-aware projector so the
// active dataset's own coordinate convention is honoured.
function gridToLatLng(x, y, pts){
  return (pts && pts.length ? geo.makeProjector(pts) : geo.makeProjector(null)).project(x, y);
}

function runExpansion(N0, C0, P, X, runWlopt){
  const growthPct = X.growthPct!=null ? X.growthPct : 25;
  const g = 1 + growthPct/100;
  const thr = X.utilThreshold!=null ? X.utilThreshold : 0.85;
  const N = N0.map(function(n){
    return {id:n.id, x:n.x, y:n.y, demand:Math.max(1, Math.round((n.demand||0)*g))};
  });
  const grownDemandTotal = N.reduce(function(s,n){ return s+n.demand; }, 0);

  // 1) grown-demand run on the CURRENT network (inertia: existing sites only)
  const base = runWlopt({neighborhoods:N, candidates:C0, params:P, mode:'optimize'});
  const utilById={}; (base.utilization||[]).forEach(function(u){ utilById[u.id]=u.u; });
  const capById={}; C0.forEach(function(c){ capById[c.id]=c.capacity; });
  const baseMaxUtil = Math.max(0, (base.utilization||[]).map(function(u){return u.u;})
    .reduce(function(a,b){ return Math.max(a,b); }, 0));

  // 2) which hubs to expand, and by how much (target: util back to threshold)
  const expansions=[];
  (base.openWarehouses||[]).forEach(function(id){
    const u=utilById[id]||0;
    if(u>=thr){
      const cap=capById[id]||0;
      const load=cap*u;                          // current assigned volume
      const to=round100(load/Math.max(0.3,thr)); // capacity that brings util to threshold
      const add=Math.max(100, to-cap);
      const cand=C0.find(function(c){ return c.id===id; });
      expansions.push({id:id, name:(cand&&cand.name)||id, utilBefore:+u.toFixed(3),
        capacityFrom:cap, capacityTo:to, addUnits:add});
    }
  });

  // 3) leftover unmet demand -> propose a NEW warehouse (greenfield site):
  //    demand-weighted geometric median of the stressed catchment
  //    (unserved areas + areas crowded into the hubs we are expanding).
  const overloadedIds={}; expansions.forEach(function(e){ overloadedIds[e.id]=true; });
  const pts=[];
  const asgBase = Array.isArray(base.assignments) ? base.assignments : [];
  N.forEach(function(n){
    const a=asgBase.find(function(x){ return x.neighborhoodId===n.id; });
    const unserved=(base.unserved||[]).indexOf(n.id)>=0;
    if(unserved || (a && overloadedIds[a.warehouseId]))
      pts.push({x:n.x, y:n.y, w:n.demand});
  });
  let proposal=null;
  const capAfterOpen=(base.openWarehouses||[]).reduce(function(s,id){
    const e=expansions.find(function(x){ return x.id===id; });
    return s+(e?e.capacityTo:(capById[id]||0));
  },0);
  const unmetBefore=Math.max(0, grownDemandTotal-capAfterOpen);

  // 3)+4) iterative greenfield siting: after capacity boosts, each round
  // re-optimizes, finds the REMAINING stressed catchment (unserved areas +
  // areas on hubs still over threshold) and proposes the next new warehouse
  // at its demand-weighted geometric median — until healthy or cap reached.
  const maxNew=X.maxNewWarehouses!=null?X.maxNewWarehouses:2;
  const proposals=[];
  let C1=C0.map(function(c){
    const e=expansions.find(function(x){ return x.id===c.id; });
    return e?Object.assign({},c,{capacity:e.capacityTo}):c;
  });
  let fin=runWlopt({neighborhoods:N, candidates:C1,
    params:Object.assign({},P,{maxWarehouses:(P.maxWarehouses||3)+proposals.length}), mode:'optimize'});
  for(let k=0;k<maxNew;k++){
    const utilById={}; (fin.utilization||[]).forEach(function(u){ utilById[u.id]=u.u; });
    const healthy=(fin.unserved||[]).length===0 &&
      (fin.openWarehouses||[]).every(function(id){ return (utilById[id]||0)<thr; });
    if(healthy) break;
    const asg=Array.isArray(fin.assignments)?fin.assignments:[];
    const hotIds={}; (fin.openWarehouses||[]).forEach(function(id){
      if((utilById[id]||0)>=thr) hotIds[id]=true; });
    const pts2=N.filter(function(n){
      const a=asg.find(function(a2){ return a2.neighborhoodId===n.id; });
      return (fin.unserved||[]).indexOf(n.id)>=0||(a&&hotIds[a.warehouseId]);
    }).map(function(n){ return {x:n.x, y:n.y, w:n.demand}; });
    if(!pts2.length) break;
    const med=year.medianOf(pts2);
    let x=med.x, y=med.y;
    const near=C1.find(function(c){ return Math.hypot(c.x-x,c.y-y)<4; });
    if(near){
      x=Math.min(98, Math.max(2, x+(x>=near.x?6:-6)));
      y=Math.min(98, Math.max(2, y+(y>=near.y?6:-6)));
    }
    const need=pts2.reduce(function(s,p){ return s+p.w; },0)*(X.buffer!=null?X.buffer:1.2);
    const ll=gridToLatLng(x,y,N.concat(C0));
    const pr={id:'NEW'+(k+1), name:'Proposed Hub '+(k+1), x:+x.toFixed(2), y:+y.toFixed(2),
      lat:ll.lat, lng:ll.lng,
      capacity:round100(need), fixedCost:X.newFixedCost!=null?X.newFixedCost:1500,
      catchment:pts2.length,
      note:'Demand-weighted geometric median of '+pts2.length+' stressed areas (Weiszfeld, round '+(k+1)+')'};
    proposals.push(pr);
    C1=C1.concat([Object.assign({},pr)]);
    fin=runWlopt({neighborhoods:N, candidates:C1,
      params:Object.assign({},P,{maxWarehouses:(P.maxWarehouses||3)+proposals.length}), mode:'optimize'});
  }
  proposal=proposals[0]||null;
  const finMaxUtil = Math.max(0,(fin.utilization||[]).map(function(u){return u.u;})
    .reduce(function(a,b){ return Math.max(a,b); },0));
  const capAfterFin=(fin.openWarehouses||[]).reduce(function(s,id){
    const c=C1.find(function(x){ return x.id===id; });
    return s+((c&&c.capacity)||0);
  },0);

  const saved=Math.max(0, (base.totalCost||0)-(fin.totalCost||0));
  const totalNewFixed=proposals.reduce(function(s,p){ return s+p.fixedCost; },0);
  const paybackDays = saved>0 && totalNewFixed>0 ? Math.max(1, Math.round(totalNewFixed*12/saved)) : null;

  // stored per-warehouse demand content (feeds UI bars + LLM context)
  const capOf=function(id){ const c=C1.find(function(x){ return x.id===id; }); return (c&&c.capacity)||0; };
  const nameOf=function(id){ const c=C0.find(function(x){ return x.id===id; }); return (c&&c.name)||id; };
  const grownDemand={}; N.forEach(function(n){ grownDemand[n.id]=n.demand; });

  return {growthPct:growthPct, utilThreshold:thr, grownDemandTotal:grownDemandTotal,
    grownDemand:grownDemand,
    base:{openWarehouses:base.openWarehouses, utilization:base.utilization,
      unserved:base.unserved, totalCost:base.totalCost, maxUtil:+baseMaxUtil.toFixed(3),
      capacityViolations:base.capacityViolations,
      warehouseLoads:(base.openWarehouses||[]).map(function(id){
        const u=(base.utilization||[]).find(function(u2){ return u2.id===id; });
        const uu=u?u.u:0;
        return {id:id, name:nameOf(id), load:Math.round(uu*((C0.find(function(c){return c.id===id;})||{}).capacity||0)),
          capacity:(C0.find(function(c){return c.id===id;})||{}).capacity||0, util:+uu.toFixed(3)};
      })},
    expansions:expansions, proposal:proposal, proposals:proposals,
    final:{openWarehouses:fin.openWarehouses, utilization:fin.utilization,
      unserved:fin.unserved, totalCost:fin.totalCost, maxUtil:+finMaxUtil.toFixed(3),
      assignments:fin.assignments,
      warehouseLoads:(fin.openWarehouses||[]).map(function(id){
        const u=(fin.utilization||[]).find(function(u2){ return u2.id===id; });
        const uu=u?u.u:0;
        return {id:id, name:nameOf(id), load:Math.round(uu*capOf(id)), capacity:capOf(id), util:+uu.toFixed(3)};
      })},
    savings:{savedPerPeriod:Math.round(saved),
      unmetBefore:Math.min(grownDemandTotal, unmetBefore),
      unmetAfter:Math.max(0, grownDemandTotal-capAfterFin),
      unservedBefore:(base.unserved||[]).length, unservedAfter:(fin.unserved||[]).length,
      paybackDays:paybackDays},
    stats:{newSiteFixed:totalNewFixed,
      expansionUnits:expansions.reduce(function(s,e){ return s+e.addUnits; },0)}};
}

// Template summary (always available, used when LLM is unavailable)
function templateSummary(o){
  const L=[];
  L.push('Demand surge: at +'+o.growthPct+'% demand ('+o.grownDemandTotal+' orders/day), peak hub utilization is '+
    Math.round((o.base.maxUtil||0)*100)+'% vs threshold '+Math.round(o.utilThreshold*100)+'%.');
  if(o.expansions.length){
    L.push('Expand '+o.expansions.length+' existing hub'+(o.expansions.length>1?'s':'')+': '+
      o.expansions.map(function(e){ return e.name+' +'+e.addUnits+' ('+e.capacityFrom+'→'+e.capacityTo+
        ', was '+Math.round(e.utilBefore*100)+'% full)'; }).join('; ')+'.');
  } else {
    L.push('No existing hub crosses the utilization threshold — capacity is sufficient for this growth.');
  }
  const props=o.proposals&&o.proposals.length?o.proposals:(o.proposal?[o.proposal]:[]);
  if(props.length){
    L.push('Open '+props.length+' new warehouse'+(props.length>1?'s':'')+': '+
      props.map(function(p){ return p.id+' @('+p.x+', '+p.y+') cap '+p.capacity; }).join('; ')+
      ' — demand-weighted geometric medians of the stressed areas, computed from the data.');
  } else {
    L.push('No new site needed: expanding existing hubs covers the whole growth scenario.');
  }
  const fl=(o.final&&o.final.warehouseLoads)||[];
  if(fl.length){
    L.push('Final loads: '+fl.map(function(w){
      return w.name+' '+w.load+'/'+w.capacity+' ('+Math.round(w.util*100)+'%)'; }).join(', ')+'.');
  }
  L.push('Re-optimized network: ['+(o.final.openWarehouses||[]).join(', ')+'] — peak utilization drops '+
    Math.round((o.base.maxUtil||0)*100)+'% → '+Math.round((o.final.maxUtil||0)*100)+'%.');
  L.push('Unserved areas: '+o.savings.unservedBefore+' → '+o.savings.unservedAfter+
    '; unmet capacity: '+o.savings.unmetBefore+' → '+o.savings.unmetAfter+' orders/day.');
  if(o.savings.savedPerPeriod>0){
    L.push('Cost impact: delivery cost '+Math.round(o.base.totalCost||0)+' → '+Math.round(o.final.totalCost||0)+
      ' (saves ~$'+o.savings.savedPerPeriod+'/period)'+(o.savings.paybackDays?
      '; new-site payback ~'+o.savings.paybackDays+' days.':'.'));
  } else {
    L.push('Cost impact: delivery cost moves '+Math.round(o.base.totalCost||0)+' → '+Math.round(o.final.totalCost||
      0)+' — the plan buys full coverage: '+o.savings.unmetBefore+' previously unserved/unmet orders now served.');
  }
  return L;
}

// quality check: rejects junk/instruction-echo and number-free "summaries"
function narrationGood(txt){
  if(!txt) return false;
  const t=String(txt).trim();
  if(t.length<200) return false;
  if(t.split(/\n+/).filter(function(l){ return l.trim(); }).length<3) return false;
  const low=t.toLowerCase();
  if(/each in (the )?form|no markdown|no numbering|exactly \d+ lines|we need to|as an ai|i cannot|i'm sorry/.test(low)) return false;
  const digits=(t.match(/\d[\d.,]*/g)||[]);
  if(digits.length<3) return false;
  return true;
}

// Human-readable reason the LLM was not used, so the UI badge explains WHY the
// deterministic template is showing (quota / dead model slug / no key / timeout).
function failVia(r){
  const reason=(r&&r.reason)||'unavailable';
  const map={'rate-limit':'free LLM quota exhausted','model-unavailable':'free model retired',
    'auth':'LLM key rejected','network':'LLM unreachable','timeout':'LLM timeout',
    'no-key':'no LLM key','empty':'LLM returned no text','error':'LLM error'};
  return 'template · '+(r&&r.noKey?'no LLM key':(map[reason]||reason));
}

// LLM executive summary via OpenRouter/OpenAI-compatible chat; template fallback.
// Free-tier routers fail intermittently, so retry once before falling back.
function llmSummarize(o, cb, attempt){
  attempt=attempt||1;
  let envdb=null; try{ envdb=require('./envdb.js'); }catch(e){}
  const fb=templateSummary(o);
  const giveup=function(via){ cb(null,{text:fb.join('\n'), via:via}); };
  if(!envdb){ giveup('template (no envdb)'); return; }
  const data={growthPct:o.growthPct, grownDemandTotal:o.grownDemandTotal,
    base:{open:o.base.openWarehouses, maxUtil:o.base.maxUtil, unserved:(o.base.unserved||[]).length,
      totalCost:o.base.totalCost, warehouseLoads:o.base.warehouseLoads},
    expansions:o.expansions, proposals:o.proposals,
    final:{open:o.final.openWarehouses, maxUtil:o.final.maxUtil,
      unserved:(o.final.unserved||[]).length, totalCost:o.final.totalCost,
      warehouseLoads:o.final.warehouseLoads},
    savings:o.savings};
  envdb.llmChat([{role:'user', content:'You are a logistics OR engineer. Produce a "Demand-Growth Expansion Plan" for a hackathon demo: exactly 8 lines, each in the strict form "Title: one clear sentence" (no markdown, no numbering, no bold). Cover in this order: Demand Surge (how much demand grew, total orders/day), Capacity Alert (which existing warehouses to expand and by how much, with before/after utilization and loads), New Hub Locations (exact computed coordinates for each new warehouse and why — geometric median of stressed areas), Reoptimized Network (final open set, utilization/unserved improvement), Cost Impact (cost saved or coverage bought), Payback (break-even), Risk Watch (what to monitor), Bottom Line. Use the real numbers from the data. Data: '+JSON.stringify(data).slice(0,4000)}])
    .then(function(r){
      const txt=(r&&r.ok&&r.text)?r.text:'';
      if(narrationGood(txt)){
        cb(null,{text:txt, via:'llm:'+(r&&r.model? r.model : (process.env.OPENROUTER_MODEL||process.env.LLM_MODEL||'default'))});
      } else if(attempt<2){
        setTimeout(function(){ llmSummarize(o, cb, attempt+1); }, 1200);
      } else if(r&&r.noKey){
        giveup(failVia(r));
      } else {
        r&&r.ok? giveup('template · LLM output rejected') : giveup(failVia(r));
      }
    })
    .catch(function(){ 
      if(attempt<2) setTimeout(function(){ llmSummarize(o, cb, attempt+1); }, 1200);
      else giveup('template (llm error)');
    });
}

// Demand-simulation narrator: what the condition WILL be and what to do.
// Data-driven from the Monte Carlo result + expected-demand network run.
function templateSimSummary(o){
  const L=[];
  const net=o.expectedNetwork||{};
  const vol=o.expectedTotal?((o.p90/o.expectedTotal-1)*100):0;
  L.push('Future condition: at +'+o.growthPct+'% demand ('+o.dist+' noise, CV '+Math.round((o.cv||0)*100)+
    '%), expected daily cost $'+Math.round(o.expectedTotal||0)+', P90 $'+Math.round(o.p90||0)+
    ' (+'+vol.toFixed(0)+'% tail risk), worst case $'+Math.round(o.worst||0)+'.');
  const wl=net.warehouseLoads||[];
  if(wl.length){
    L.push('Network load: '+wl.map(function(w){
      return w.name+' '+w.load+'/'+w.capacity+' ('+Math.round(w.util*100)+'%)'; }).join(', ')+'.');
  }
  const hot=wl.filter(function(w){ return w.util>=0.85; });
  if(hot.length){
    L.push('What to do: '+hot.map(function(w){
      return 'expand '+w.name+' by '+Math.max(100,Math.ceil((w.load/0.85-w.capacity)/100)*100)+
        ' units ('+Math.round(w.util*100)+'% full)'; }).join('; ')+'.');
  } else {
    L.push('What to do: no hub crosses the 85% stress line — current network absorbs this growth.');
  }
  if((net.unserved||[]).length){
    L.push('Coverage action: '+net.unserved.length+' areas would go unserved — open an extra hub near the '+
      'unserved cluster; the Expansion Advisor computes the exact coordinates.');
  }
  L.push('Tail risk: across '+o.samples+' scenarios costs run from $'+Math.round(o.best||0)+' to $'+
    Math.round(o.worst||0)+' — keep safety stock and flexible fleet for the P90 tail.');
  L.push('Recommendation: re-run this simulation at +'+Math.round((o.growthPct||0)+15)+
    '% to see when the network tips over, and pre-secure the expansion sites early.');
  return L;
}

function narrateSim(o, cb, attempt){
  attempt=attempt||1;
  let envdb=null; try{ envdb=require('./envdb.js'); }catch(e){}
  const fb=templateSimSummary(o);
  const giveup=function(via){ cb(null,{text:fb.join('\n'), via:via}); };
  if(!envdb){ giveup('template (no envdb)'); return; }
  const data={growthPct:o.growthPct, dist:o.dist, cv:o.cv, samples:o.samples,
    expectedTotal:o.expectedTotal, p90:o.p90, worst:o.worst, best:o.best,
    expectedNetwork:{open:o.expectedNetwork&&o.expectedNetwork.openWarehouses,
      warehouseLoads:o.expectedNetwork&&o.expectedNetwork.warehouseLoads,
      unserved:o.expectedNetwork&&o.expectedNetwork.unserved}};
  envdb.llmChat([{role:'user', content:'You are a logistics OR engineer. Produce a "Demand Simulation Outlook" for a hackathon demo: exactly 7 lines, each in the strict form "Title: one clear sentence" (no markdown, no numbering, no bold). Cover in this order: Future Condition (expected cost and demand level at the horizon), Tail Risk (P90 vs expected, worst case, what volatility means), Network Load (per-warehouse load/capacity/utilization from the data), Capacity Action (which hubs to expand and by how much), Coverage Action (unserved areas / where an extra hub is needed), Flexibility (safety stock & fleet advice for the tail), Next Step (what growth level to test next). Use only the real numbers from the data. Data: '+JSON.stringify(data).slice(0,4000)}])
    .then(function(r){
      const txt=(r&&r.ok&&r.text)?r.text:'';
      if(narrationGood(txt)) cb(null,{text:txt, via:'llm:'+(r&&r.model? r.model : (process.env.OPENROUTER_MODEL||process.env.LLM_MODEL||'default'))});
      else if(attempt<2) setTimeout(function(){ narrateSim(o, cb, attempt+1); },1200);
      else if(r&&r.noKey) giveup(failVia(r));
      else r&&r.ok? giveup('template · LLM output rejected') : giveup(failVia(r));
    })
    .catch(function(){
      if(attempt<2) setTimeout(function(){ narrateSim(o, cb, attempt+1); },1200);
      else giveup('template (llm error)');
    });
}

// Template AI-insight summary for a plain optimization run (no demand growth).
// Used by the Optimization page's "AI plan review" card, and as the fallback
// whenever the LLM is unavailable — so the card is never empty.
function templateOptimizeSummary(o){
  o = o||{};
  const sol = o.sol||o.solution||o;
  const cands = o.candidates||[];
  const nameOf = function(id){
    const c = cands.find(function(x){ return x.id===id; });
    return (c&&c.name)||id;
  };
  const caps = {}; cands.forEach(function(c){ caps[c.id]=c.capacity; });
  const open = sol.openWarehouses||[];
  const util = {}; (sol.utilization||[]).forEach(function(u){ util[u.id]=u.u; });
  const L=[];
  L.push('Plan: solver opened '+open.length+' hub'+(open.length===1?'':'s')+
    ' ['+open.map(nameOf).join(', ')+'] using '+sol.algorithmUsed+
    (sol.optimal?' (proven optimal).':'.'));
  L.push('Cost: total $'+Math.round(sol.totalCost||0)+' = delivery $'+
    Math.round(sol.deliveryCost||0)+' + fixed $'+Math.round(sol.fixedCost||0)+
    (o.savingsPct!=null?'; saves '+o.savingsPct+'% vs a single-warehouse baseline.':'.'));
  const loads = sol.loads||[];
  if(loads.length){
    const hot = loads.filter(function(x){ return (util[x.id]||0)>=0.85; });
    L.push('Loads: '+loads.map(function(x){
      return nameOf(x.id)+' '+x.load+'/'+(caps[x.id]||'?')+' ('+Math.round((util[x.id]||0)*100)+'%)';
    }).join(', ')+'.');
    L.push(hot.length
      ? 'Watch: '+hot.map(function(x){ return nameOf(x.id); }).join(', ')+
        ' above 85% — growth here means expand or open a second hub (run the Expansion Advisor).'
      : 'Watch: no hub above 85% — this plan has headroom for organic growth.');
  }
  const uns = sol.unserved||[];
  L.push('Coverage: '+(sol.servedCount!=null?sol.servedCount:(o.nbCount||0)-uns.length)+
    ' areas served, avg '+(sol.avgDistance!=null?(+sol.avgDistance).toFixed(2):'0')+
    ' km, '+uns.length+' unserved'+(uns.length? ' ('+uns.slice(0,6).join(', ')+')':'')+'.');
  L.push('Next step: compare with the next-cheapest algorithm on the Compare tab, then feed '+
    'this network into the Expansion Advisor to stress-test it at +25% demand.');
  return L;
}

function narrateOptimize(o, cb, attempt){
  attempt = attempt||1;
  let envdb=null; try{ envdb=require('./envdb.js'); }catch(e){}
  const fb=templateOptimizeSummary(o);
  const giveup=function(via){ cb(null,{text:fb.join('\n'), via:via}); };
  if(!envdb){ giveup('template (no envdb)'); return; }
  const sol=o.sol||o.solution||o;
  const cands=o.candidates||[];
  const caps={}; cands.forEach(function(c){ caps[c.id]=c.capacity; });
  const names={}; cands.forEach(function(c){ names[c.id]=c.name||c.id; });
  const data={ algorithm:sol.algorithmUsed, optimal:!!sol.optimal,
    openWarehouses:(sol.openWarehouses||[]).map(function(id){ return names[id]||id; }),
    totalCost:Math.round(sol.totalCost||0), deliveryCost:Math.round(sol.deliveryCost||0),
    fixedCost:Math.round(sol.fixedCost||0), avgDistance:sol.avgDistance,
    savingsPct:o.savingsPct!=null?o.savingsPct:null,
    loads:(sol.loads||[]).map(function(x){
      const u=(sol.utilization||[]).find(function(u2){ return u2.id===x.id; });
      return {id:names[x.id]||x.id, load:x.load, capacity:caps[x.id]||0,
        util:u?+u.u.toFixed(3):0};
    }),
    unserved:sol.unserved||[], params:o.params||{}};
  envdb.llmChat([{role:'user', content:'You are a logistics optimization engineer. Produce an "AI Plan Review" for a hackathon demo: exactly 7 lines, each in the strict form "Title: one clear sentence" (no markdown, no numbering, no bold, no bullet characters). Cover in this order: Chosen Plan (which hubs opened and the solver that chose them), Cost Breakdown (total vs delivery vs fixed, and the saving vs a single-hub baseline if provided), Network Load (per-hub load/capacity/utilization from the data), Risk Watch (which hubs are above 85% utilization, or state clearly that none are), Coverage Gap (unserved areas, or state full coverage), Trade-off (what this plan gives up for what it gains), Next Move (the single best next action: expand, open a new site, or compare another algorithm). Use only real numbers from the data. Data: '+JSON.stringify(data).slice(0,4000)}])
    .then(function(r){
      const txt=(r&&r.ok&&r.text)?r.text:'';
      if(narrationGood(txt)) cb(null,{text:txt, via:'llm:'+(r&&r.model? r.model : (process.env.OPENROUTER_MODEL||process.env.LLM_MODEL||'default'))});
      else if(attempt<2) setTimeout(function(){ narrateOptimize(o, cb, attempt+1); },1200);
      else if(r&&r.noKey) giveup('template (no LLM key)');
      else if(r&&r.ok) giveup('template (llm output rejected)');
      else r&&r.ok? giveup('template (llm output rejected)') : giveup('template (llm unavailable)');
    })
    .catch(function(){
      if(attempt<2) setTimeout(function(){ narrateOptimize(o, cb, attempt+1); },1200);
      else giveup('template (llm error)');
    });
}

module.exports={runExpansion:runExpansion, templateSummary:templateSummary, llmSummarize:llmSummarize,
  templateSimSummary:templateSimSummary, narrateSim:narrateSim,
  templateOptimizeSummary:templateOptimizeSummary, narrateOptimize:narrateOptimize,
  gridToLatLng:gridToLatLng};

