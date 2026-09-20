import { useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency, fmt } from '@/lib/utils';
import {
  Plus, Copy, Trash2, Play, BarChart2, Clock, CheckCircle2,
  Loader2, ChevronRight, Bookmark
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type OptResult } from '@/lib/api';

interface Scenario {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'completed' | 'error';
  algorithm: string;
  warehouses: number;
  totalCost: number;
  lastRun: string;
  params: any;
  result?: OptResult;
}

const INITIAL: Scenario[] = [
  { id: 's1', name: 'Low cost, tight radius', description: 'Minimize cost with 30km radius limit', status: 'completed', algorithm: 'exact', warehouses: 3, totalCost: 189420, lastRun: '2 min ago', params: { deliveryCostPerKm: 1.5, maxServiceRadius: 30 } },
  { id: 's2', name: 'High capacity, few wh', description: 'Large warehouses, minimize fixed cost', status: 'completed', algorithm: 'localsearch', warehouses: 2, totalCost: 234560, lastRun: '5 min ago', params: { capacity: 2000, fixedCost: 3000 } },
  { id: 's3', name: 'Max coverage', description: 'Every neighborhood within 20km of a wh', status: 'completed', algorithm: 'exact', warehouses: 5, totalCost: 156780, lastRun: '12 min ago', params: { maxServiceRadius: 20 } },
];

export function ScenarioManager() {
  const { nb, wh, loaded } = useStore();
  const [scenarios, setScenarios] = useState<Scenario[]>(INITIAL);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const runScenario = useCallback(async (s: Scenario) => {
    if (!loaded || !nb.length) return;
    setScenarios(prev => prev.map(x => x.id === s.id ? { ...x, status: 'running' } : x));
    setRunningId(s.id);
    try {
      const out = await api.optimize({
        neighborhoods: nb as any,
        candidates: wh as any,
        params: { algorithm: s.params?.algorithm || 'exact', ...s.params },
        explain: true,
      });
      setScenarios(prev => prev.map(x =>
        x.id === s.id
          ? { ...x, status: 'completed', totalCost: out.totalCost, warehouses: out.openWarehouses.length, lastRun: 'just now', result: out }
          : x
      ));
    } catch {
      setScenarios(prev => prev.map(x => x.id === s.id ? { ...x, status: 'error' } : x));
    } finally {
      setRunningId(null);
      setActiveId(null);
    }
  }, [loaded, nb, wh]);

  const duplicate = (id: string) => {
    const src = scenarios.find(s => s.id === id)!;
    setScenarios(prev => [...prev, {
      ...src,
      id: 's' + Date.now(),
      name: src.name + ' (copy)',
      status: 'draft',
      totalCost: 0,
      lastRun: '-',
    }]);
  };

  const remove = (id: string) => setScenarios(prev => prev.filter(s => s.id !== id));

  const statusVariant = (s: string) => s === 'completed' ? 'success' : s === 'running' ? 'info' : s === 'error' ? 'danger' : 'muted';

  return (
    <div className="scenarios-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Bookmark size={16} className="text-blue-400" />Scenarios
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">Compare different optimization configurations</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setScenarios(prev => [...prev, {
          id: 's' + Date.now(),
          name: 'New scenario',
          description: 'Custom configuration',
          status: 'draft',
          algorithm: 'exact',
          warehouses: 0,
          totalCost: 0,
          lastRun: '-',
          params: {},
        }])}>
          <Plus size={13} />New Scenario
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {scenarios.map(s => (
          <Card key={s.id}
            className={`p-4 hover:border-[#2a2a3a] transition-colors cursor-pointer ${
              activeId === s.id ? 'border-blue-500/30' : 'border-[#1e1e2e]'
            }`}
            onClick={() => setActiveId(activeId === s.id ? null : s.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white truncate">{s.name}</span>
                  <Badge variant={statusVariant(s.status)} className="text-[9px] flex-shrink-0">{s.status}</Badge>
                </div>
                <p className="text-xs text-[#5a5a70] leading-relaxed">{s.description}</p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
                <Button variant="ghost" size="sm" className="p-1" onClick={(e: any) => { e.stopPropagation(); duplicate(s.id); }}><Copy size={11}/></Button>
                <Button variant="ghost" size="sm" className="p-1 text-red-400/60 hover:text-red-400" onClick={(e: any) => { e.stopPropagation(); remove(s.id); }}><Trash2 size={11}/></Button>
              </div>
            </div>

            {s.status === 'completed' && (
              <div className="grid grid-cols-3 gap-2 mb-3 p-2 rounded bg-[#0d0d16] border border-[#1a1a24]">
                <div><div className="text-[9px] text-[#3a3a50] mb-0.5">Cost</div><div className="text-xs font-mono font-medium text-white">{fmtCurrency(s.totalCost)}</div></div>
                <div><div className="text-[9px] text-[#3a3a50] mb-0.5">Warehouses</div><div className="text-xs font-mono text-white">{s.warehouses}</div></div>
                <div><div className="text-[9px] text-[#3a3a50] mb-0.5">Algorithm</div><div className="text-[9px] font-mono text-[#8080a0] truncate">{s.algorithm}</div></div>
              </div>
            )}

            <div className="flex items-center gap-1 mt-auto flex-wrap">
              {s.status !== 'running' && s.status !== 'error' && (
                <Button variant="primary" size="sm" className="flex-1 justify-center" onClick={(e: any) => { e.stopPropagation(); runScenario(s); }}>
                  <Play size={11} />{s.status === 'completed' ? 'Re-run' : 'Run'}
                </Button>
              )}
              {s.status === 'running' && (
                <Button variant="primary" size="sm" className="flex-1 justify-center" disabled><Loader2 className="animate-spin" size={11}/>Running</Button>
              )}
              <Button variant="ghost" size="sm" className="flex-1 justify-center"><BarChart2 size={11}/>Compare</Button>
              <ChevronRight size={12} className="text-[#3a3a50] flex-shrink-0" />
            </div>

            <div className="flex items-center gap-1 mt-2 text-[9px] text-[#3a3a50]">
              <Clock size={9} />
              {s.lastRun !== '-' ? `Last run ${s.lastRun}` : 'Not yet run'}
            </div>
          </Card>
        ))}
      </div>

      {/* comparison */}
      <Card>
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <span className="text-sm font-medium text-white">Scenario Comparison</span>
          <Badge variant="info">{scenarios.filter(s => s.status === 'completed').length} completed</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {['Scenario', 'Algorithm', 'Warehouses', 'Total Cost', 'vs Baseline'].map(h => (
                  <th key={h} className="px-5 py-2 text-left text-[9px] font-mono font-medium text-[#3a3a50] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.filter(s => s.status === 'completed').map((s, i) => {
                const baseline = nb.reduce((a, n) => a + (n.demand || 0) * 100, 0);
                const delta = ((s.totalCost - baseline) / Math.max(1, baseline) * 100);
                return (
                  <tr key={s.id} className={`border-b border-[#1a1a24] hover:bg-[#111118] transition-colors ${i === 0 ? 'bg-emerald-500/5' : ''}`}>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#c0c0d0]">{s.name}</span>
                        {i === 0 && <CheckCircle2 size={10} className="text-emerald-400" />}
                      </div>
                    </td>
                    <td className="px-5 py-2 font-mono text-[#8080a0]">{s.algorithm}</td>
                    <td className="px-5 py-2 font-mono text-[#c0c0d0]">{s.warehouses}</td>
                    <td className="px-5 py-2 font-mono font-medium text-white">{fmtCurrency(s.totalCost)}</td>
                    <td className="px-5 py-2 font-mono">
                      {i === 0
                        ? <span className="text-[#4a4a60]">—</span>
                        : <span className={delta > 0 ? 'text-red-400' : 'text-emerald-400'}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {activeId && scenarios.find(s => s.id === activeId)?.result && (
        <Card>
          <CardHeader><span className="text-sm font-medium text-white">{scenarios.find(s => s.id === activeId)?.name} — Results</span></CardHeader>
          <CardBody className="space-y-2 text-xs">
            {[
              { label: 'Total Cost', value: fmtCurrency(scenarios.find(s => s.id === activeId)!.result!.totalCost), color: 'text-emerald-400' },
              { label: 'Delivery Cost', value: fmtCurrency(scenarios.find(s => s.id === activeId)!.result!.deliveryCost) },
              { label: 'Fixed Cost', value: fmtCurrency(scenarios.find(s => s.id === activeId)!.result!.fixedCost) },
              { label: 'Avg Distance', value: scenarios.find(s => s.id === activeId)!.result!.avgDistance.toFixed(2) + ' km' },
              { label: 'Warehouses', value: scenarios.find(s => s.id === activeId)!.result!.openWarehouses.join(', ') },
            ].map((r, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-[#1a1a24] last:border-0">
                <span className="text-[#4a4a60]">{r.label}</span>
                <span className={`font-mono ${r.color || 'text-white'}`}>{r.value}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
