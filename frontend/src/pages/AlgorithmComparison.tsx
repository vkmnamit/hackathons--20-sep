import { useState, useCallback } from 'react';
import {
  BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtCurrency, fmt } from '@/lib/utils';
import {
  Play, Loader2, CheckCircle2, AlertTriangle, Trophy, Zap
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type OptResult } from '@/lib/api';

const ALGOS = [
  { key: 'exact',      label: 'Exact (MILP / B&B)' },
  { key: 'annealing',   label: 'Simulated Annealing' },
  { key: 'localsearch', label: 'Local Search' },
  { key: 'kmedoids',    label: 'K-Medoids' },
  { key: 'kmeans',      label: 'K-Means' },
  { key: 'greedy',      label: 'Greedy' },
];
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

export function AlgorithmComparison() {
  const { nb, wh, loaded } = useStore();
  const [running, setRunning] = useState(false);
    const [results, setResults] = useState<OptResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!loaded || !nb.length) return;
    setRunning(true); setError(null); setResults(null);
    try {
      const out = await api.compare({
        neighborhoods: nb as any,
        candidates: wh as any,
        params: { algorithm: 'exact' },
      });
      setResults(out.results);
    } catch (e: any) {
      setError(e.message || 'Comparison failed');
    } finally { setRunning(false); }
  }, [loaded, nb, wh]);

  if (!loaded) return <div className="h-full flex items-center justify-center bg-[#0a0a0f] text-[#6b6b80] text-xs">Loading...</div>;
  if (error && !results) return <div className="h-full flex items-center justify-center bg-[#0a0a0f]"><Card className="max-w-md"><CardBody><div className="flex items-center gap-2 text-amber-400 text-xs mb-3"><AlertTriangle size={14}/>{error}</div><Button variant="primary" size="sm" onClick={run}>Retry</Button></CardBody></Card></div>;

  const getRes = (key: string) => results?.find(r => r.algorithmUsed === key);
  const bestRes = results ? results.reduce((best, r) => r.totalCost < best.totalCost ? r : best) : null;
  const winner = bestRes?.algorithmUsed || '';

  const algoRows = ALGOS.map((a, i) => {
    const r = getRes(a.key);
    return {
      key: a.key,
      name: a.label,
      totalCost: r?.totalCost ?? 0,
      deliveryCost: r?.deliveryCost ?? 0,
      avgDistance: r?.avgDistance ?? 0,
      runtime: r?.runtimeMs ?? 0,
      warehouseCount: r?.openWarehouses?.length ?? 0,
      violations: r?.unserved?.length ?? 0,
      status: r?.optimal ? 'Optimal' : (r ? 'Heuristic' : '—'),
      color: COLORS[i % COLORS.length],
    };
  });

  return (
    <div className="algorithms-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Trophy size={16} className="text-amber-400" />Algorithm Comparison
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">Same dataset, same constraints · {wh.length} candidates · {nb.length} neighborhoods</p>
        </div>
        {results && <Badge variant="success">{algoRows[0]?.warehouseCount || 0} wh · best: {winner}</Badge>}
        <Button variant="primary" size="sm" loading={running} onClick={run}>
          <Play size={13} />Run All
        </Button>
      </div>

      {/* comparison table */}
      <Card>
        <CardHeader><span className="text-sm font-medium text-white">Performance Comparison</span></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {['Algorithm', 'Total Cost', 'Delivery Cost', 'Avg Dist', 'Runtime', 'WH', 'Violations', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-medium text-[#3a3a50] uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {algoRows.map((a, i) => (
                <tr key={a.key}
                  className={`border-b border-[#1a1a24] hover:bg-[#111118] transition-colors ${i === 0 && results ? 'bg-blue-500/6' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                      <span className="text-[#c0c0d0]">{a.name}</span>
                      {i === 0 && results && <Badge variant="success" className="text-[9px]">Best</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-white">{fmtCurrency(a.totalCost)}</td>
                  <td className="px-3 py-2 font-mono text-[#8080a0]">{fmtCurrency(a.deliveryCost)}</td>
                  <td className="px-3 py-2 font-mono text-[#8080a0]">{a.avgDistance.toFixed(2)} km</td>
                  <td className="px-3 py-2 font-mono text-[#8080a0]">{a.runtime}ms</td>
                  <td className="px-3 py-2 font-mono text-[#c0c0d0]">{a.warehouseCount}</td>
                  <td className="px-3 py-2">
                    {a.violations === 0
                      ? <span className="text-emerald-400"><CheckCircle2 size={10}/>0</span>
                      : <span className="text-amber-400"><AlertTriangle size={10}/>{a.violations}</span>
                    }
                  </td>
                  <td className="px-3 py-2"><Badge variant={a.status === 'Optimal' ? 'success' : a.status === 'Heuristic' ? 'warning' : 'muted'} className="text-[9px]">{a.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Total Cost by Algorithm</span></CardHeader>
          <CardBody>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={algoRows} layout="vertical" barCategoryGap={8}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'monospace' }} tickFormatter={v => '$'+(v/1000).toFixed(0)+'k'} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b6b80' }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }} formatter={(v) => fmtCurrency(Number(v))} />
                  <Bar dataKey="totalCost" radius={3} maxBarSize={20}>
                    {algoRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Cost vs Runtime Trade-off</span></CardHeader>
          <CardBody>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" />
                  <XAxis dataKey="runtime" name="Runtime (ms)" type="number" tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="totalCost" name="Total Cost" type="number" tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'monospace' }} tickFormatter={v => '$'+(v/1000).toFixed(0)+'k'} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-[#111118] border border-[#2a2a3a] rounded-lg p-2 text-xs">
                        <div className="font-medium text-white">{d?.name}</div>
                        <div className="text-[#6b6b80]">Cost: <span className="text-white">{fmtCurrency(d?.totalCost)}</span></div>
                        <div className="text-[#6b6b80]">Runtime: <span className="text-white">{d?.runtime}ms</span></div>
                      </div>
                    );
                  }} />
                  {algoRows.map((a, i) => (
                    <Scatter key={a.key} name={a.name} data={[a]} fill={COLORS[i % COLORS.length]} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="text-xs text-[#4a4a60] bg-[#0d0d16] p-3 rounded border border-[#1e1e2e]">
        <strong className="text-blue-400">Note:</strong> Exact MILP finds the provably optimal solution but requires more compute time. Heuristics trade optimality for speed — useful for large instances or rapid iteration.
        Do not interpret heuristic results as "optimal" — they are lower-bound approximations.
      </div>
    </div>
  );
}
