import { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtCurrency, fmt } from '@/lib/utils';
import {
  Clock, CheckCircle2, AlertCircle, ExternalLink,
  RefreshCw, Download, Trash2, TrendingUp
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';

interface RunRow {
  id: string;
  name: string;
  algorithm: string;
  warehouse_count: number;
  total_cost: number;
  avg_distance: number;
  runtime_ms: number;
  created_at: string;
  status?: 'completed' | 'running' | 'error';
}

export function OptimizationHistory() {
  const { token, companyId } = useStore();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [via, setVia] = useState<string>('local');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      let data;
      if (token && companyId) {
        data = await api.history(token);
      } else {
        // no auth — show local placeholder history
        data = { runs: MOCK_RUNS, via: 'local-demo' };
      }
      setRuns(data.runs || []);
      setVia(data.via || 'local');
    } catch (e: any) {
      // fall back to local demo runs
      setRuns(MOCK_RUNS);
      setVia('local-fallback');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const statusVariant = (s: string) =>
    s === 'completed' ? 'success' : s === 'running' ? 'info' : s === 'error' ? 'danger' : 'muted';

  const sorted = [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="history-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Clock size={16} className="text-blue-400" />Optimization History
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">{runs.length} runs · {via === 'supabase' ? 'Persisted in Supabase DB' : 'Local/demo'}</p>
        </div>
        <Button variant="primary" size="sm" onClick={load}>
          <RefreshCw size={13} />Refresh
        </Button>
      </div>

      {error && (
        <div className="text-xs text-amber-400 bg-amber-500/5 p-3 rounded border border-amber-500/20">
          <AlertCircle size={12} className="mr-1" />{error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {['Run', 'Algorithm', 'Warehouses', 'Total Cost', 'Avg Dist', 'Runtime', 'Status', 'Timestamp', ''].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[9px] font-mono font-medium text-[#3a3a50] uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map(run => (
                <tr key={run.id}
                  className="border-b border-[#1a1a24] hover:bg-[#111118] transition-colors cursor-pointer"
                  onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'workspace' }))}
                >
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-[#c0c0d0]">Optimization run</div>
                    <div className="text-[9px] text-[#3a3a50] font-mono mt-0.5">#{run.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-5 py-2.5 text-[#8080a0]">{run.algorithm}</td>
                  <td className="px-5 py-2.5 font-mono text-[#c0c0d0]">{run.warehouse_count}</td>
                  <td className="px-5 py-2.5 font-mono font-medium text-white">{fmtCurrency(run.total_cost)}</td>
                  <td className="px-5 py-2.5 font-mono text-[#8080a0]">{run.avg_distance.toFixed(2)} km</td>
                  <td className="px-5 py-2.5 font-mono text-[#8080a0]">{run.runtime_ms}ms</td>
                  <td className="px-5 py-2.5">
                    <Badge variant={statusVariant(run.status || 'completed')} className="text-[9px]">
                      {run.status || 'completed'}
                    </Badge>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[#4a4a60] whitespace-nowrap text-[9px]">
                    <div className="flex items-center gap-1">
                      <Clock size={8} />
                      {new Date(run.created_at).toLocaleDateString()} {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-5 py-2.5">
                    <Button variant="ghost" size="sm" className="text-[#4a4a60]" onClick={(e: any) => e.stopPropagation()}>
                      <ExternalLink size={10}/>
                    </Button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-xs text-[#3a3a50]">No runs yet. Run an optimization to see it here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-[#3a3a50] flex items-center gap-2">
        <TrendingUp size={10} className="text-blue-400" />
        Click any run to jump back to the workspace with that configuration.
      </div>
    </div>
  );
}

const MOCK_RUNS: RunRow[] = [
  { id: 'run-001', name: 'Optimization run', algorithm: 'exact', warehouse_count: 4, total_cost: 412850, avg_distance: 8.42, runtime_ms: 840, created_at: new Date(Date.now() - 1000*60*17).toISOString(), status: 'completed' },
  { id: 'run-002', name: 'Optimization run', algorithm: 'localsearch', warehouse_count: 4, total_cost: 415200, avg_distance: 8.51, runtime_ms: 95, created_at: new Date(Date.now() - 1000*60*45).toISOString(), status: 'completed' },
  { id: 'run-003', name: 'Optimization run', algorithm: 'greedy', warehouse_count: 5, total_cost: 428100, avg_distance: 9.02, runtime_ms: 12, created_at: new Date(Date.now() - 1000*60*120).toISOString(), status: 'completed' },
  { id: 'run-004', name: 'Optimization run', algorithm: 'kmedoids', warehouse_count: 4, total_cost: 431500, avg_distance: 9.15, runtime_ms: 210, created_at: new Date(Date.now() - 1000*60*200).toISOString(), status: 'completed' },
  { id: 'run-005', name: 'Optimization run', algorithm: 'annealing', warehouse_count: 4, total_cost: 419800, avg_distance: 8.78, runtime_ms: 1500, created_at: new Date(Date.now() - 1000*60*300).toISOString(), status: 'completed' },
];
