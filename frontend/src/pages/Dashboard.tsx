import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ArrowUpRight, Cpu, Gauge, MapPin, Package, RefreshCw, Radio, Route, ShieldCheck, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtCurrency } from '@/lib/utils';
import { api, type OptResult } from '@/lib/api';
import type { Page } from '@/components/layout/Sidebar';

const COLORS = ['#67e8f9', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6'];

const FALLBACK_DEMO_RESULT: OptResult = {
  openWarehouses: ['W1', 'W2', 'W5'], totalCost: 44435, deliveryCost: 20435, fixedCost: 24000, infraCost: 24000,
  grandTotal: 44435, avgDistance: 3.42, unserved: [], runtimeMs: 4, algorithmUsed: 'exact (Branch & Bound MILP)', optimal: true, savingsPct: 24.8,
  assignments: { N01: 'W3', N02: 'W4', N03: 'W1', N04: 'W1', N05: 'W1', N06: 'W1', N07: 'W1', N08: 'W1', N09: 'W2', N10: 'W2', N11: 'W6', N12: 'W2', N13: 'W2', N14: 'W5', N15: 'W5', N16: 'W2' },
  utilization: [{ id: 'W1', u: 0.82 }, { id: 'W2', u: 0.76 }, { id: 'W5', u: 0.68 }], baselineSingle: { cost: 59120, open: ['W5'], savingsPct: 24.8 },
  explanation: ['Selected 3 open warehouses (Basavanagudi Hub, Jayanagar Dock, South Bangalore DC) to minimize grand total cost.', 'Achieved $44,435 grand total cost with 100% neighborhood coverage and zero capacity overload.', 'Saves 24.8% ($14,685) compared to single-warehouse baseline.'],
};

type WarehouseRow = { name: string; utilization: number; color: string };

function NetworkPulse({ rows }: { rows: WarehouseRow[] }) {
  const points = rows.map((row, index) => ({ ...row, x: 150 + index * 230, y: index % 2 ? 175 : 245 }));
  return <div className="network-stage relative h-[385px] overflow-hidden rounded-[1.35rem] border border-cyan-300/20 bg-[#07111e]/95 md:h-[475px]">
    <div className="absolute inset-0 network-grid opacity-80" />
    <div className="absolute left-5 top-5 z-10 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[.2em] text-cyan-200/80"><span className="network-icon"><Route size={13} /></span>Live network topology</div>
    <div className="absolute right-5 top-5 z-10 flex items-center gap-2 text-[10px] font-mono text-[#7187a2]"><span className="network-pulse-ring" /> Flow active</div>
    <svg viewBox="0 0 760 475" className="relative h-full w-full" aria-label="Live warehouse network visualization">
      <defs><linearGradient id="route-gradient" x1="0" x2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".1" /><stop offset=".5" stopColor="#67e8f9" stopOpacity=".95" /><stop offset="1" stopColor="#a78bfa" stopOpacity=".2" /></linearGradient><filter id="node-glow"><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      <circle cx="380" cy="225" r="185" fill="none" stroke="#3b82f6" strokeOpacity=".09" strokeDasharray="2 12" className="network-ring" /><circle cx="380" cy="225" r="120" fill="none" stroke="#22d3ee" strokeOpacity=".1" strokeDasharray="3 14" className="network-ring network-ring-slow" />
      {points.slice(0, -1).map((point, index) => { const next = points[index + 1]; const path = `M ${point.x} ${point.y} Q ${(point.x + next.x) / 2} ${point.y - 125} ${next.x} ${next.y}`; return <g key={`${point.name}-route`}><path d={path} fill="none" stroke="url(#route-gradient)" strokeWidth="3" strokeDasharray="7 11" className="route-dash" /><circle r="4" fill="#67e8f9"><animateMotion dur={`${2.5 + index * .6}s`} repeatCount="indefinite" path={path} /></circle></g>; })}
      {points.map((point) => <g key={point.name} filter="url(#node-glow)"><circle cx={point.x} cy={point.y} r="44" fill={point.color} opacity=".08" className="node-breathe" /><circle cx={point.x} cy={point.y} r="25" fill="#0d1d30" stroke={point.color} strokeWidth="2" /><circle cx={point.x} cy={point.y} r="8" fill={point.color} /><circle cx={point.x} cy={point.y} r="34" fill="none" stroke={point.color} strokeOpacity=".35" strokeDasharray="3 9" className="node-orbit" /><text x={point.x} y={point.y + 59} textAnchor="middle" fill="#eef7ff" fontSize="15" fontWeight="600" fontFamily="JetBrains Mono">{point.name}</text><text x={point.x} y={point.y + 78} textAnchor="middle" fill="#7c94ad" fontSize="11">{point.utilization}% capacity</text></g>)}
    </svg>
    <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between text-[10px] font-mono text-[#7187a2]"><span><i className="legend-dot legend-cyan" />allocation layer</span><span>{rows.length} hubs online / streaming</span></div>
  </div>;
}

function CapacityGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const circumference = 2 * Math.PI * 31;
  return <div className="capacity-gauge group relative flex items-center justify-center" title={`${label} at ${value}% capacity`}><svg viewBox="0 0 76 76" className="h-[76px] w-[76px] -rotate-90"><circle cx="38" cy="38" r="31" fill="none" stroke="#1b2a3c" strokeWidth="7" /><circle cx="38" cy="38" r="31" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - (circumference * value) / 100} className="gauge-fill" /></svg><div className="absolute text-center"><div className="font-mono text-base font-bold text-white">{value}%</div><div className="text-[9px] uppercase tracking-wider text-[#6f87a3]">load</div></div></div>;
}

function CostSpectrum({ delivery, fixed, total }: { delivery: number; fixed: number; total: number }) {
  const deliveryPct = total ? (delivery / total) * 100 : 0;
  const fixedPct = total ? (fixed / total) * 100 : 0;
  return <div className="cost-spectrum"><div className="relative mb-6 h-16 overflow-hidden rounded-2xl bg-[#0a1421] shadow-inner"><div className="cost-segment cost-delivery" style={{ width: `${deliveryPct}%` }} /><div className="cost-segment cost-fixed" style={{ width: `${fixedPct}%` }} /><div className="absolute inset-0 flex items-center justify-center font-mono text-sm text-white/80">{fmtCurrency(total)} total network cost</div></div><div className="grid grid-cols-2 gap-4"><div className="border-l-2 border-cyan-300 pl-3"><div className="text-[10px] uppercase tracking-[.18em] text-[#7086a1]">Delivery</div><div className="mt-1 font-mono text-lg text-white">{fmtCurrency(delivery)}</div><div className="text-[10px] text-cyan-300">{deliveryPct.toFixed(1)}% of total</div></div><div className="border-l-2 border-violet-300 pl-3"><div className="text-[10px] uppercase tracking-[.18em] text-[#7086a1]">Fixed</div><div className="mt-1 font-mono text-lg text-white">{fmtCurrency(fixed)}</div><div className="text-[10px] text-violet-300">{fixedPct.toFixed(1)}% of total</div></div></div></div>;
}

export function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [health, setHealth] = useState<any>(null);
  const [lastRun, setLastRun] = useState<OptResult>(FALLBACK_DEMO_RESULT);
  const [loading, setLoading] = useState(false);
  const runDemo = async () => { setLoading(true); try { const d = await api.demo(); const nb = d.neighborhoods.map(n => ({ ...n, demand: n.demand || 100 })); setLastRun(await api.optimize({ neighborhoods: nb, candidates: d.candidates, params: { algorithm: 'exact' }, explain: true })); } catch { /* Keep the local result visible while the service is unavailable. */ } finally { setLoading(false); } };
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { runDemo(); }, []);
  const whRows: WarehouseRow[] = (lastRun?.utilization || []).map((u, i) => ({ name: u.id, utilization: Math.round(u.u * 100), color: COLORS[i % COLORS.length] }));
  return <div className="page-enter dashboard-shell h-full overflow-y-auto bg-transparent p-4 md:p-7">
    <section className="editorial-hero relative mb-7 min-h-[650px] overflow-hidden border-b border-cyan-300/10 bg-[#08111d] px-5 pb-5 pt-7 md:px-9 md:pt-9"><div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="scanline" /><div className="relative z-10 max-w-xl"><div className="mb-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.25em] text-cyan-300"><span className="live-dot" />Live network / Bengaluru region</div><h1 className="max-w-2xl text-4xl font-semibold leading-[.98] tracking-[-.06em] text-white md:text-7xl">The network<br /><span className="holographic-text">is thinking.</span></h1><p className="mt-5 max-w-md text-sm leading-6 text-[#9bb0c9]">A live operational view of every decision between demand and delivery.</p><div className="mt-6 flex flex-wrap items-center gap-2"><Badge variant={health?.llm?.startsWith('on:') ? 'success' : 'muted'}><Activity size={11} />{health?.llm || 'Syncing telemetry'}</Badge><Badge variant="info"><Cpu size={11} />Exact solver</Badge><Button variant="primary" size="md" loading={loading} onClick={runDemo}><RefreshCw size={14} />Re-optimize network</Button></div></div><div className="hero-network-wrap absolute bottom-0 left-0 right-0 md:left-[25%] md:top-24"><NetworkPulse rows={whRows} /></div><div className="hero-caption absolute bottom-6 left-6 z-20 hidden items-center gap-4 text-[10px] font-mono uppercase tracking-[.16em] text-[#6f87a3] md:flex"><span><i className="legend-dot legend-cyan" />active flow</span><span><i className="legend-dot legend-blue" />capacity signal</span><span className="text-cyan-300/80">{whRows.length} hubs online</span></div></section>
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, staggerChildren: 0.1 }}
      className="editorial-kpis mb-7 grid gap-4 lg:grid-cols-[1.4fr_.8fr_.8fr_.8fr]"
    >
      {lastRun && <>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="primary-kpi relative overflow-hidden border-l-2 border-emerald-300 bg-gradient-to-br from-[#102b2d] via-[#0d1e25] to-[#0b141f] p-6 shadow-[0_20px_60px_rgba(5,35,38,.3)]"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="eyebrow"><TrendingDown size={12} /> Primary outcome</div>
              <ArrowUpRight size={18} className="text-emerald-300" />
            </div>
            <div className="mt-6 text-[10px] uppercase tracking-[.2em] text-[#7e9aa5]">Total network cost</div>
            <div className="mt-1 font-mono text-4xl font-bold tracking-[-.06em] text-white md:text-5xl">{fmtCurrency(lastRun.totalCost)}</div>
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
              <span className="trend-pill">-{lastRun.savingsPct?.toFixed(1) || '—'}%</span> below single-hub baseline
            </div>
            <div className="mt-7 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300" style={{ width: `${Math.min(lastRun.savingsPct || 0, 100)}%` }} />
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="metric-tile border-t-2 border-cyan-300 bg-[#0d1926]/80 p-5"
        >
          <div className="eyebrow"><Package size={12} /> Delivery</div>
          <div className="mt-7 font-mono text-2xl font-bold text-white">{fmtCurrency(lastRun.deliveryCost)}</div>
          <div className="mini-spark mt-5"><span /><span /><span /><span /><span /><span /></div>
          <div className="mt-2 text-[10px] text-cyan-300">variable route spend</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.19 }}
          className="metric-tile border-t-2 border-violet-300 bg-[#121526]/80 p-5"
        >
          <div className="eyebrow"><MapPin size={12} /> Distance</div>
          <div className="mt-7 font-mono text-2xl font-bold text-white">{lastRun.avgDistance.toFixed(1)}<span className="ml-1 text-sm text-violet-300">km</span></div>
          <div className="distance-track mt-6"><span /></div>
          <div className="mt-2 text-[10px] text-violet-300">average per delivery</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.26 }}
          className="metric-tile border-t-2 border-amber-300 bg-[#1a1720]/80 p-5"
        >
          <div className="eyebrow"><Zap size={12} /> Hubs online</div>
          <div className="mt-7 font-mono text-2xl font-bold text-white">{lastRun.openWarehouses.length}<span className="ml-1 text-sm text-amber-300">active</span></div>
          <div className="mt-5 flex -space-x-2">{lastRun.openWarehouses.map(hub => <span key={hub} className="hub-avatar">{hub}</span>)}</div>
          <div className="mt-2 text-[10px] text-amber-300">of optimized network</div>
        </motion.div>
      </>}
    </motion.section>
    <section className="mb-7 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="visual-panel p-6"><div className="mb-7 flex items-start justify-between"><div><div className="eyebrow"><Activity size={12} /> Financial signal</div><h2 className="mt-2 text-xl font-medium text-white">Cost architecture</h2><p className="mt-1 text-xs text-[#7187a2]">The shape of your optimized network spend</p></div><span className="font-mono text-[10px] text-cyan-300">LIVE / 02</span></div>{lastRun && <CostSpectrum delivery={lastRun.deliveryCost} fixed={lastRun.fixedCost} total={lastRun.totalCost} />}</div><div className="visual-panel p-6"><div className="mb-6 flex items-start justify-between"><div><div className="eyebrow"><Gauge size={12} /> Capacity field</div><h2 className="mt-2 text-xl font-medium text-white">Hub pressure</h2><p className="mt-1 text-xs text-[#7187a2]">Live utilization across selected facilities</p></div><span className="font-mono text-[10px] text-emerald-300">{whRows.length} SIGNALS</span></div><div className="flex flex-wrap items-center justify-around gap-5">{whRows.map(w => <div key={w.name} className="text-center"><CapacityGauge value={w.utilization} color={w.color} label={w.name} /><div className="mt-2 font-mono text-xs text-white">{w.name}</div></div>)}</div></div></section>
    <section className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]"><Card><CardHeader><div className="flex items-center justify-between"><div><div className="eyebrow"><ShieldCheck size={12} /> Solver trace</div><h2 className="mt-2 text-sm font-medium text-white">Last optimization</h2></div><Button variant="ghost" size="sm" onClick={() => onNavigate('history')}>View history</Button></div></CardHeader><CardBody>{lastRun && <div className="space-y-3 text-xs">{[{ label: 'Algorithm', value: lastRun.algorithmUsed }, { label: 'Status', value: lastRun.optimal ? 'Optimal (proven)' : 'Heuristic', good: lastRun.optimal }, { label: 'Runtime', value: `${lastRun.runtimeMs}ms` }, { label: 'Unserved', value: lastRun.unserved?.length ? lastRun.unserved.join(', ') : 'None', good: !lastRun.unserved?.length }].map(row => <div key={row.label} className="trace-row"><span>{row.label}</span><strong className={row.good ? 'text-emerald-300' : 'text-[#d2e1ef]'}>{row.value}</strong></div>)}</div>}</CardBody></Card></section>
  </div>;
}
