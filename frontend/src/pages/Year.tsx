import { useState } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtCurrency, fmt } from '@/lib/utils';
import {
  Clock, Play, RefreshCw, TrendingUp, TrendingDown,
  MapPin, Loader2, CheckCircle2, AlertTriangle,
  Zap, Lightbulb, ChevronDown
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type YearResult } from '@/lib/api';
import { StepNarration } from '@/components/ui/StepNarration';
import { GrowthStory } from '@/components/ui/GrowthStory';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer
} from 'recharts';

const DEMO_YEAR_PARAMS = {
  deliveryCostPerKm: 2,
  maxServiceRadius: 60,
  minWarehouses: 1,
  maxWarehouses: 3,
  algorithm: 'localsearch',
  distanceMetric: 'euclidean',
} as const;

export function Year() {
  const { nb, wh, loaded, loading: storeLoading } = useStore();
  const [params, setParams] = useState(DEMO_YEAR_PARAMS);
  const [scenario, setScenario] = useState('demand_growth');
  const [growthPlan, setGrowthPlan] = useState('moderate');
  const [months, setMonths] = useState(6);
  const [budget, setBudget] = useState(1500);
  const [newCapacity, setNewCapacity] = useState(800);
  const [utilThresh, setUtilThresh] = useState(0.85);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<YearResult | null>(null);

  const run = async () => {
    if (!loaded || !nb.length) { setErr('Load a dataset first'); return; }
    setRunning(true); setErr(null); setResult(null);
    try {
      const scenarioInput = {
        demand_growth: { daily: growthPlan === 'high' ? 0.16 : growthPlan === 'low' ? 0.04 : 0.08, hotspot: 1.5 },
        new_region: { daily: 0.12, hotspot: 2.0 }, overloaded: { daily: 0.06, hotspot: 1.7 },
        unavailable: { daily: 0.03, hotspot: 1.3 }, fuel_cost: { daily: 0.06, hotspot: 1.4 },
        festival: { daily: 0.18, hotspot: 2.2 }, budget_limited: { daily: 0.08, hotspot: 1.5 },
      }[scenario] || { daily: 0.08, hotspot: 1.5 };
      const out = await api.year({
        neighborhoods: nb.map(n => ({...n, demand: n.demand || 100})),
        candidates: wh,
        params: { ...params, algorithm: params.algorithm },
        year: {
          months,
          dailyGrowthPct: scenarioInput.daily,
          hotspotMult: scenarioInput.hotspot,
          utilThreshold: utilThresh,
          newCapacity,
          newFixedCost: budget,
        },
      });
      setResult(out);
    } catch (e: any) {
      setErr(e.message || 'Year simulation failed');
    } finally { setRunning(false); }
  };

  if (!loaded) return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0f] text-[#6b6b80] text-xs">
      <Loader2 className="animate-spin mr-2" size={14} />Loading dataset...
    </div>
  );

  const curve = result?.curve || [];
  const curveNew = result?.curveNew || [];
  const daysPerMonth = Math.round(365 / (curve.length || 12));
  const costData = curve.map(r => ({
    month: 'M' + r.month,
    base: Math.round(r.avgDayCost * daysPerMonth),
    new: curveNew[r.month - 1] ? Math.round(curveNew[r.month - 1].avgDayCost * daysPerMonth) : 0,
  }));

  const utilData = curve.map(r => ({
    month: 'M' + r.month,
    maxUtil: Math.round(r.maxUtil * 100),
    wh: r.open.length,
  }));

  const fp = result?.firstPressure;
  const prop = result?.proposal;
  const stats = result?.stats;

  return (
    <div className="year-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      <div className="scenario-hero flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
            <Clock size={15} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Expansion Scenario Builder</h1>
            <p className="text-xs text-[#8080a0] mt-0.5">Describe what is changing in your business. LogiOpt turns it into an expansion recommendation.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { window.open('/docs', '_blank'); }}>
            <Lightbulb size={13} />How it works
          </Button>
          <Button variant="primary" size="sm" loading={running} onClick={run}>
            <Play size={13} />Build recommendation
          </Button>
        </div>
      </div>

      {err && (
        <div className="text-xs text-amber-400 bg-amber-500/5 p-3 rounded border border-amber-500/20 flex items-center gap-1">
          <AlertTriangle size={13} />{err}
        </div>
      )}

      <section className="scenario-controls rounded-lg border border-[#1e1e2e] bg-[#0d0d14] p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-blue-400" />
          <h2 className="text-sm font-medium text-white">1. Current network</h2>
        </div>
        <div className="rounded-md bg-[#111118] border border-[#1e1e2e] px-3 py-2 text-xs text-[#c0c0d0]">You currently operate <strong className="text-white">{wh.length} warehouses</strong> serving <strong className="text-white">{nb.length} customer areas</strong>. Existing locations and capacities are taken from your active dataset.</div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">2. What is changing?</label>
          <select value={scenario} onChange={e => setScenario(e.target.value)} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white">
            <option value="demand_growth">Customer demand is increasing</option><option value="new_region">Entering a new city or region</option><option value="overloaded">A warehouse is overloaded</option><option value="unavailable">A warehouse is unavailable</option><option value="fuel_cost">Fuel and delivery costs are increasing</option><option value="festival">Festival or sale demand spike</option><option value="budget_limited">Limited expansion budget</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Expected demand change</label>
          <select value={growthPlan} onChange={e => setGrowthPlan(e.target.value)} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white"><option value="low">Gradual growth</option><option value="moderate">Moderate growth</option><option value="high">Rapid growth</option></select>
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Planning horizon</label>
          <select value={months} onChange={e => setMonths(+e.target.value)} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white"><option value={3}>Next 3 months</option><option value={6}>Next 6 months</option><option value={12}>Next 12 months</option></select>
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">3. Maximum new-site budget ($)</label>
          <input type="number" min="0" value={budget} onChange={e => setBudget(+e.target.value)} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono" />
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">New warehouse capacity</label>
          <input type="number" min="1" value={newCapacity} onChange={e => setNewCapacity(+e.target.value)} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono" />
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Capacity pressure alert</label>
          <select value={utilThresh} onChange={e => setUtilThresh(+e.target.value)} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white"><option value={0.75}>Alert at 75% full</option><option value={0.85}>Alert at 85% full</option><option value={0.95}>Alert at 95% full</option></select>
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#8080a0] block mb-1">Optimization method</label>
          <select value={params.algorithm} onChange={e => setParams({...params, algorithm: e.target.value as any})} className="w-full px-2 py-1 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white">
            <option value="localsearch">Local Search</option>
            <option value="greedy">Greedy</option>
            <option value="exact">Exact</option>
          </select>
        </div>
        </div>
      </section>

      {result && (
        <div className="space-y-5">

          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="text-sm font-semibold text-emerald-300">Expansion decision report</div>
            <p className="mt-1 text-xs text-[#c0c0d0]">
              {fp ? `Additional capacity is needed around Month ${fp.month}. ` : 'No capacity breach is predicted in the selected period. '}
              {prop ? `Theoretical suggested location: ${prop.id}, near the demand-weighted service centre. This is a model recommendation, not a confirmed property location.` : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardBody className="pt-4">
                <div className="text-[10px] font-mono text-[#4a4a60] mb-1">Pressure Month</div>
                <div className="text-xl font-mono font-bold text-white">
                  {fp ? `Month ${fp.month}` : '—'}
                </div>
                <div className="text-[10px] text-[#5a5a70] mt-0.5">
                  {fp ? `Day ${fp.day}, ${Math.round(fp.maxUtil*100)}% util, ${fp.unserved} unserved` : 'No pressure detected'}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="pt-4">
                <div className="text-[10px] font-mono text-[#4a4a60] mb-1">Suggested expansion site</div>
                <div className="text-xl font-mono font-bold text-white">
                  {prop ? prop.id : '—'}
                </div>
                {prop && (
                  <div className="text-[10px] text-[#5a5a70] mt-0.5">
                    Theoretical location · capacity {prop.capacity}
                  </div>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardBody className="pt-4">
                <div className="text-[10px] font-mono text-[#4a4a60] mb-1">Yearly Savings</div>
                <div className="text-xl font-mono font-bold text-white">
                  {stats ? fmtCurrency(stats.money.deliverySaved) : '—'}
                </div>
                <div className="text-[10px] text-[#5a5a70] mt-0.5">
                  {stats ? `${Math.round((stats.money.deliverySaved / stats.money.yearBase * 100))}% of annual cost` : ''}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="pt-4">
                <div className="text-[10px] font-mono text-[#4a4a60] mb-1">Payback</div>
                <div className="text-xl font-mono font-bold text-white">
                  {stats ? (stats.money.paybackDays == null ? 'Not reached' : `${stats.money.paybackDays} days`) : '—'}
                </div>
                <div className="text-[10px] text-[#5a5a70] mt-0.5">
                  {stats ? `Save ~${fmt(stats.money.avgDaySave)}/day` : ''}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Detailed Operational & Fuel Metrics */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-[#111118] border border-[#1e1e2e]">
                <div className="text-[10px] font-mono text-[#6b6b80]">MILEAGE REDUCED</div>
                <div className="text-lg font-mono font-bold text-blue-400 mt-0.5">{stats.kmSaved.toLocaleString()} km</div>
                <div className="text-[10px] text-[#8080a0] mt-0.5">Reduced road travel</div>
              </div>
              <div className="p-3 rounded-lg bg-[#111118] border border-[#1e1e2e]">
                <div className="text-[10px] font-mono text-[#6b6b80]">FUEL COST SAVED</div>
                <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">{fmtCurrency(stats.fuelSaved)}</div>
                <div className="text-[10px] text-[#8080a0] mt-0.5">Direct fuel expenditure reduction</div>
              </div>
              <div className="p-3 rounded-lg bg-[#111118] border border-[#1e1e2e]">
                <div className="text-[10px] font-mono text-[#6b6b80]">DRIVER LABOR SAVED</div>
                <div className="text-lg font-mono font-bold text-purple-400 mt-0.5">{fmtCurrency(stats.labourSaved)}</div>
                <div className="text-[10px] text-[#8080a0] mt-0.5">~{stats.driveHrsSaved} driver hours saved</div>
              </div>
              <div className="p-3 rounded-lg bg-[#111118] border border-[#1e1e2e]">
                <div className="text-[10px] font-mono text-[#6b6b80]">WEISZFELD MEDIAN COORD</div>
                <div className="text-lg font-mono font-bold text-white mt-0.5">
                  {prop ? `(${prop.x.toFixed(2)}, ${prop.y.toFixed(2)})` : '—'}
                </div>
                <div className="text-[10px] text-emerald-400 mt-0.5">Fermat-Weber optimal center</div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader><span className="text-sm font-medium text-white">Total Cost: Base vs With New Warehouse</span></CardHeader>
            <CardBody>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={costData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#4a4a60' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'monospace' }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }} formatter={(v: any) => [fmtCurrency(Number(v)), '']} />
                    <Legend />
                    <Line type="monotone" dataKey="base" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Base (no new wh)" />
                    <Line type="monotone" dataKey="new" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="With new warehouse" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {fp && (
                <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Pressure starts at month {fp.month} (utilization {Math.round(fp.maxUtil*100)}%). New warehouse proposed.
                </div>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><span className="text-sm font-medium text-white">Peak Utilization Over Time</span></CardHeader>
              <CardBody>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={utilData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#4a4a60' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#4a4a60' }} tickFormatter={v => v + '%'} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }} />
                      <Line type="monotone" dataKey="maxUtil" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Max util %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            {stats && (
              <Card>
                <CardHeader><span className="text-sm font-medium text-white">Money &amp; Ops Savings</span></CardHeader>
                <CardBody>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-[#4a4a60]">Delivery cost saved</span><span className="font-mono text-white">{fmtCurrency(stats.money.deliverySaved)}</span></div>
                    <div className="flex justify-between"><span className="text-[#4a4a60]">Annual base cost</span><span className="font-mono text-white">{fmtCurrency(stats.money.yearBase)}</span></div>
                    <div className="flex justify-between"><span className="text-[#4a4a60]">Annual with-new cost</span><span className="font-mono text-emerald-400">{fmtCurrency(stats.money.yearNew)}</span></div>
                    <div className="flex justify-between"><span className="text-[#4a4a60]">km saved</span><span className="font-mono text-white">{fmt(stats.kmSaved)}</span></div>
                    <div className="flex justify-between"><span className="text-[#4a4a60]">Drive-hours saved</span><span className="font-mono text-white">{fmt(Math.round(stats.driveHrsSaved))}</span></div>
                    <div className="flex justify-between"><span className="text-[#4a4a60]">Labour saved ($/hr)</span><span className="font-mono text-white">{fmtCurrency(stats.labourSaved)}</span></div>
                    <div className="flex justify-between"><span className="text-[#4a4a60]">Fuel saved ($/L)</span><span className="font-mono text-white">{fmtCurrency(stats.fuelSaved)}</span></div>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader><span className="text-sm font-medium text-white">Warehouse Reconnect: Base vs Year-End</span></CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div className="space-y-1">
                  <div className="text-[#4a4a60] mb-1">Base plan (M0) open warehouses</div>
                  {(result.baseSolMonth0?.openWarehouses || []).map(w => (
                    <div key={w} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{w}</div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="text-[#4a4a60] mb-1">Year-end plan (with new wh) open</div>
                  {(result.newSolEnd?.openWarehouses || []).map(w => (
                    <div key={w} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{w}</div>
                  ))}
                  {(result.proposals && result.proposals.length ? result.proposals : (prop ? [prop] : [])).map(p => (
                    <div key={p.id} className="mt-2 p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
                      <span className="text-emerald-400 font-mono">+{p.id}</span> @ ({p.x.toFixed(2)}, {p.y.toFixed(2)}) · cap {p.capacity}
                      <div className="text-[10px] text-[#5a5a70] mt-0.5">{p.note}</div>
                    </div>
                  ))}
                  {result?.hotspotMode && (
                    <div className="mt-2 text-[10px] text-[#5a5a70] font-mono">growth mode: {result.hotspotMode}</div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white flex items-center gap-2">
                  LLM narration
                  {result.narrVia && (
                    <Badge variant={result.narrVia?.includes('template') ? 'muted' : 'success'} className="text-[8px]">
                      {result.narrVia}
                    </Badge>
                  )}
                </span>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {result.narration && result.narration.length ? (
                <>
                  {/* structured, sectioned story — 01 growth → 08 payback */}
                  <GrowthStory lines={result.narration} />
                  {/* collapsible raw narrator lines for transparency */}
                  <details className="group rounded-lg border border-[#1e1e2e] bg-[#0d0d16]">
                    <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer text-[10px] font-mono uppercase tracking-widest text-[#5a5a70] hover:text-[#8080a0] select-none">
                      <ChevronDown size={11} className="group-open:rotate-180 transition-transform" />
                      Raw narrator output
                    </summary>
                    <div className="px-3 pb-3">
                      <StepNarration lines={result.narration} via={result.narrVia} />
                    </div>
                  </details>
                </>
              ) : (
                <div className="text-xs text-[#3a3a50]">No narration produced.</div>
              )}
              <div className="text-[9px] text-[#4a4a60]">
                Set OPENROUTER_API_KEY in backend/.env for live LLM narration. Falls back to template narrator automatically.
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {!result && !running && (
        <div className="text-center py-8">
          <Clock size={20} className="mx-auto text-[#2a2a3a] mb-3" />
          <div className="text-xs text-[#3a3a50]">Configure params and run the year simulation.</div>
        </div>
      )}

      <div className="text-xs text-[#3a3a50]">
        {storeLoading ? 'Loading...' : loaded ? `Dataset: ${nb.length} neighborhoods, ${wh.length} candidate warehouses` : 'Not loaded'}
      </div>
    </div>
  );
}
