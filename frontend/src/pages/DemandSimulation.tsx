import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtCurrency, fmt } from '@/lib/utils';
import {
  Play, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Loader2, Info
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type SimBody } from '@/lib/api';
import { StepNarration } from '@/components/ui/StepNarration';

export function DemandSimulation() {
  const { nb, wh, loaded } = useStore();
  const [samples, setSamples] = useState(500);
  const [growth, setGrowth] = useState(15);
  const [cv, setCv] = useState(25);
  const [distType, setDistType] = useState<'normal' | 'lognormal' | 'uniform' | 'poisson'>('normal');
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!loaded || !nb.length || !wh.length) return;
    setRunning(true); setErr(null); setRan(false);
    try {
      const body: SimBody = {
        neighborhoods: nb,
        candidates: wh,
        params: { algorithm: 'exact', deliveryCostPerKm: 2, maxServiceRadius: 60, capacity: 800 },
        scenarios: samples,
        dist: distType,
        cv: cv / 100,
        growthPct: growth,
      };
      const out = await api.simulate(body);
      setResult(out);
      setRan(true);
    } catch (e: any) {
      setErr(e.message || 'Simulation failed');
    } finally { setRunning(false); }
  }, [loaded, nb, wh, samples, distType, cv, growth]);

  useEffect(() => { if (loaded && !result) run(); }, [loaded]);

  if (!loaded) return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0f] text-[#6b6b80] text-xs">
      <RefreshCw className="animate-spin mr-2" size={14} />Loading dataset...
    </div>
  );

  const distData = result?.distribution?.length
    ? result.distribution.map((d: any, i: number) => ({
        cost: d.cost,
        probability: d.density,
        cumPct: i / result.distribution.length * 100
      }))
    : [];

  return (
    <div className="demand-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-6">
      <div className="demand-hero flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Demand Intelligence</h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">Monte Carlo · {samples} scenarios · {distType} · +{growth}% growth · {cv}% variability</p>
        </div>
        <Badge variant={ran ? 'success' : 'muted'}>{ran ? 'Completed' : 'Not run'}</Badge>
      </div>

      <div className="demand-workspace grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls */}
        <Card className="simulation-controls lg:col-span-1">
          <CardHeader><span className="text-sm font-medium text-white">Simulation Controls</span></CardHeader>
          <CardBody className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-[#5a5a70] mb-1">
                <span>Demand growth (%)</span>
                <span className="font-mono text-white">+{growth}%</span>
              </div>
              <input type="range" min={0} max={50} value={growth}
                onChange={e => setGrowth(+e.target.value)}
                className="w-full h-1 accent-blue-500 cursor-pointer" />
              <div className="flex justify-between text-[10px] text-[#3a3a50] mt-0.5">
                <span>0%</span><span>50%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#5a5a70] mb-1">
                <span>Simulations</span>
                <span className="font-mono text-white">{fmt(samples)}</span>
              </div>
              <input type="range" min={100} max={2000} step={100} value={samples}
                onChange={e => setSamples(+e.target.value)}
                className="w-full h-1 accent-blue-500 cursor-pointer" />
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#5a5a70] mb-1">
                <span>Demand variability (CV %)</span>
                <span className="font-mono text-white">{cv}%</span>
              </div>
              <input type="range" min={5} max={60} step={5} value={cv}
                onChange={e => setCv(+e.target.value)}
                className="w-full h-1 accent-blue-500 cursor-pointer" />
              <div className="flex justify-between text-[10px] text-[#3a3a50] mt-0.5">
                <span>stable</span><span>wild</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-[#5a5a70] block mb-1">Distribution</label>
              <select value={distType} onChange={e => setDistType(e.target.value as any)}
                className="w-full px-2.5 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-[#c0c0d0] focus:outline-none focus:border-blue-500/40">
                <option value="normal">Normal</option>
                <option value="lognormal">Log-normal</option>
                <option value="uniform">Uniform</option>
                <option value="poisson">Poisson</option>
              </select>
            </div>

            <Button variant="primary" size="sm" className="w-full" loading={running} onClick={run}>
              <Play size={13} />{running ? 'Running...' : 'Run Simulation'}
            </Button>

            {ran && result && (
              <div className="space-y-2 pt-2 border-t border-[#1e1e2e]">
                <div className="flex justify-between text-xs">
                  <span className="text-[#5a5a70]">Expected cost</span>
                  <span className="font-mono text-white">{fmtCurrency(result.expectedTotal ?? (result as any).meanCost ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#5a5a70]">P90/P95 cost</span>
                  <span className="font-mono text-amber-400">{fmtCurrency(result.p90 ?? (result as any).p95Cost ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#5a5a70]">Worst-case</span>
                  <span className="font-mono text-red-400">{fmtCurrency(result.worst ?? (result as any).worstCost ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#5a5a70]">Best-case</span>
                  <span className="font-mono text-emerald-400">{fmtCurrency(result.best ?? (result as any).bestCost ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#5a5a70]">Volatility (P90/mean)</span>
                  <span className="font-mono text-[#c0c0d0]">{(((result.p90 || (result as any).p95Cost || 1) / Math.max(1, result.expectedTotal || (result as any).meanCost || 1) - 1) * 100).toFixed(1)}%</span>
                </div>
                <div className="pt-2 text-[10px] text-[#4a4a60] leading-relaxed">
                  <Info size={10} className="inline mr-1" />
                  {result.note}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Charts */}
        <div className="simulation-results lg:col-span-3 space-y-6">
          {/* Demand forecast */}
          <Card>
            <CardHeader><span className="text-sm font-medium text-white">Cost Distribution ({fmt(samples)} simulations)</span></CardHeader>
            <CardBody>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={distData}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" vertical={false} />
                    <XAxis
                      dataKey="cost"
                      tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'JetBrains Mono' }}
                      tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: any) => [`${(Number(v) * 100).toFixed(2)}%`, 'Cumulative']}
                    />
                    <ReferenceLine
                      x={result?.expectedTotal ?? (result as any)?.meanCost}
                      stroke="#3b82f6"
                      strokeDasharray="4 2"
                      label={{ value: 'Expected', fontSize: 9, fill: '#3b82f6', position: 'top' }}
                    />
                    <ReferenceLine
                      x={result?.p90 ?? (result as any)?.p95Cost}
                      stroke="#f59e0b"
                      strokeDasharray="4 2"
                      label={{ value: 'P90', fontSize: 9, fill: '#f59e0b', position: 'top' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumPct"
                      stackId="1"
                      fill="#3b82f6"
                      fillOpacity={0.12}
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-start gap-2 mt-3 text-xs text-[#4a4a60]">
                <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                Simulated distribution only. Higher demand growth increases cost volatility and warehouse overload probability.
              </div>
            </CardBody>
          </Card>

          {/* Scenario comparison */}
          <Card>
            <CardHeader><span className="text-sm font-medium text-white">Scenario Comparison</span></CardHeader>
            <CardBody className="space-y-3">
              {[
                { label: 'Baseline (no growth)', cost: result?.best ?? (result as any)?.bestCost ?? 0, color: '#22c55e' },
                { label: 'Expected (+' + growth + '%)', cost: result?.expectedTotal ?? (result as any)?.meanCost ?? 0, color: '#3b82f6' },
                { label: 'P90 (+' + growth + '%)', cost: result?.p90 ?? (result as any)?.p95Cost ?? 0, color: '#f59e0b' },
                { label: 'Worst-case (+' + growth + '%)', cost: result?.worst ?? (result as any)?.worstCost ?? 0, color: '#ef4444' },
              ].map((s, i) => {
                const maxCost = Math.max(1, result?.worst ?? (result as any)?.worstCost ?? 1);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-[#5a5a70]">{s.label}</div>
                    <div className="flex-1 h-6 bg-[#0d0d16] rounded overflow-hidden flex">
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, (s.cost / maxCost) * 100))}%`, background: s.color }}
                      />
                    </div>
                    <div className="w-24 text-right font-mono text-xs text-white">{fmtCurrency(s.cost)}</div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* Warehouse demand & load at grown demand */}
          {result?.expectedNetwork && (
            <Card>
              <CardHeader><span className="text-sm font-medium text-white">Warehouse Demand &amp; Load (+{result.growthPct ?? growth}% expected demand)</span></CardHeader>
              <CardBody className="space-y-3">
                {(result.expectedNetwork.warehouseLoads || []).map(w => (
                  <div key={w.id} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-[#5a5a70] truncate">{w.name}</div>
                    <div className="flex-1 h-6 bg-[#0d0d16] rounded overflow-hidden flex">
                      <div
                        className={`h-full transition-all ${w.util > 0.9 ? 'bg-red-500' : w.util > 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, Math.max(0, (w.load / Math.max(1, w.capacity)) * 100))}%` }}
                      />
                    </div>
                    <div className="w-32 text-right font-mono text-xs text-white">{w.load} / {w.capacity} · {Math.round(w.util * 100)}%</div>
                  </div>
                ))}
                {(result.expectedNetwork.unserved || []).length > 0 && (
                  <div className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> {result.expectedNetwork.unserved.length} areas would go unserved at this growth — consider the Expansion Advisor.
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* AI insights: condition + what to do */}
      {result?.summary && result.summary.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-medium text-white flex items-center gap-1.5"><Info size={14} className="text-blue-400" /> AI Insights — Future Condition &amp; What To Do</span>
              <Badge variant={result.narrVia?.startsWith('llm') ? 'info' : 'muted'}>{result.narrVia}</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <StepNarration lines={result.summary} via={result.narrVia} />
          </CardBody>
        </Card>
      )}

      {err && (
        <div className="text-xs text-amber-400 bg-amber-500/5 p-3 rounded border border-amber-500/20">
          <AlertTriangle size={12} className="mr-1" />{err}
        </div>
      )}
    </div>
  );
}
