import { useState, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtCurrency } from '@/lib/utils';
import {
  Sliders, Play, TrendingUp, AlertTriangle
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type SensResult, type SensRow } from '@/lib/api';

export function SensitivityAnalysis() {
  const { nb, wh, loaded } = useStore();
  const [result, setResult] = useState<SensResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!loaded || !nb.length) return;
    setRunning(true); setError(null);
    try {
      const out = await api.sensitivity({
        neighborhoods: nb as any,
        candidates: wh as any,
        params: { algorithm: 'exact' },
      });
      setResult(out);
    } catch (e: any) {
      setError(e.message);
    } finally { setRunning(false); }
  }, [loaded, nb, wh]);

  if (!loaded) return <div className="h-full flex items-center justify-center bg-[#0a0a0f] text-[#6b6b80] text-xs">Loading...</div>;
  if (error && !result) return <div className="h-full flex items-center justify-center bg-[#0a0a0f]"><Card className="max-w-md"><CardBody><div className="flex items-center gap-2 text-amber-400 text-xs mb-3"><AlertTriangle size={14}/>{error}</div><Button variant="primary" size="sm" onClick={run}>Retry</Button></CardBody></Card></div>;

  const demandData = (result?.demandGrowth || []).map((r: SensRow) => ({
    label: 'x'+r.mult.toFixed(2),
    mult: r.mult,
    total: Math.round(r.total),
    delivery: r.delivery ? Math.round(r.delivery) : undefined,
    fixed: r.fixed,
    warehouses: r.open.length,
  }));
  const fuelData = (result?.fuelSweep || []).map((r: SensRow) => ({
    label: 'x'+r.mult.toFixed(2),
    mult: r.mult,
    total: Math.round(r.total),
    delivery: r.delivery ? Math.round(r.delivery) : undefined,
    fixed: r.fixed,
    warehouses: r.open.length,
  }));

  return (
    <div className="sensitivity-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Sliders size={16} className="text-purple-400" />Sensitivity Analysis
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">How cost & warehouse count change as demand grows and fuel prices shift.</p>
        </div>
        <Button variant="primary" size="sm" loading={running} onClick={run}>
          <Play size={13} />Run Sweep
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Cost vs Demand Growth</span></CardHeader>
          <CardBody>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={demandData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#4a4a60' }} label={{ value: 'Demand multiplier', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#4a4a60' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'monospace' }} tickFormatter={v => '$' + (v/1000).toFixed(0)+'k'} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }} formatter={(v: any) => [fmtCurrency(Number(v)), '']} />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Total Cost" />
                  <Line type="monotone" dataKey="delivery" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} name="Delivery Cost" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {demandData.length > 0 && (
              <div className="mt-3 flex gap-4 text-[10px]">
                <span className="text-[#4a4a60]">At 2.0x: <span className="text-white font-mono">{fmtCurrency(demandData[demandData.length-1]?.total || 0)}</span></span>
                <span className="text-[#4a4a60]">WH: {demandData[0]?.warehouses} to {demandData[demandData.length-1]?.warehouses}</span>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Cost vs Fuel Multiplier</span></CardHeader>
          <CardBody>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fuelData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#4a4a60' }} label={{ value: 'Fuel multiplier', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#4a4a60' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#4a4a60', fontFamily: 'monospace' }} tickFormatter={v => '$' + (v/1000).toFixed(0)+'k'} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }} formatter={(v: any) => [fmtCurrency(Number(v)), '']} />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Total Cost" />
                  <Line type="monotone" dataKey="delivery" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} name="Delivery Cost" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {fuelData.length > 0 && (
              <div className="mt-3 flex gap-4 text-[10px]">
                <span className="text-[#4a4a60]">At 2.5x: <span className="text-white font-mono">{fmtCurrency(fuelData[fuelData.length-1]?.total || 0)}</span></span>
                <span className="text-[#4a4a60]">WH: {fuelData[0]?.warehouses} to {fuelData[fuelData.length-1]?.warehouses}</span>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><span className="text-sm font-medium text-white">Warehouse Count Across Sweeps</span></CardHeader>
        <CardBody>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                {label:'Demand', count: demandData[0]?.warehouses || 0, total: demandData[0]?.total || 0},
                {label:'Demand+2x', count: demandData[demandData.length-1]?.warehouses || 0, total: demandData[demandData.length-1]?.total || 0},
                {label:'Fuel', count: fuelData[0]?.warehouses || 0, total: fuelData[0]?.total || 0},
                {label:'Fuel+2.5x', count: fuelData[fuelData.length-1]?.warehouses || 0, total: fuelData[fuelData.length-1]?.total || 0},
              ]}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e1e2e" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#4a4a60' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 8]} tick={{ fontSize: 9, fill: '#4a4a60' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111118', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {result && demandData.length > 0 && fuelData.length > 0 && (
      <Card>
        <CardHeader><span className="text-sm font-medium text-white">Key Insights</span></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-[#0d0d16] border border-[#1e1e2e]">
              <div className="text-[10px] font-mono text-[#3a3a50] mb-1">Demand elasticity</div>
              <div className="text-lg font-mono font-bold text-white mb-1">
                {(((demandData[demandData.length-1]?.total - demandData[0]?.total) / Math.max(1,demandData[0]?.total) / Math.max(0.01, demandData[demandData.length-1]?.mult - demandData[0]?.mult) * 100).toFixed(0) || '0')}%
              </div>
              <div className="text-[10px] text-[#5a5a70]">% cost increase per 1x demand growth.</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0d0d16] border border-[#1e1e2e]">
              <div className="text-[10px] font-mono text-[#3a3a50] mb-1">Fuel sensitivity</div>
                            <div className="text-lg font-mono font-bold text-white mb-1">
                                {(((fuelData[fuelData.length - 1]?.delivery || 0) - (fuelData[0]?.delivery || 0)) / Math.max(1, fuelData[0]?.delivery || 1) * 100).toFixed(0) || '0'}%
              </div>
              <div className="text-[10px] text-[#5a5a70]">% delivery cost increase at 2.5x fuel.</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0d0d16] border border-[#1e1e2e]">
              <div className="text-[10px] font-mono text-[#3a3a50] mb-1">Cost range</div>
              <div className="text-lg font-mono font-bold text-white mb-1">
                {fmtCurrency(Math.min(...demandData.map(d => d.total)))} - {fmtCurrency(Math.max(...demandData.map(d => d.total)))}
              </div>
              <div className="text-[10px] text-[#5a5a70]">Span across demand-growth sweep.</div>
            </div>
          </div>
        </CardBody>
      </Card>
      )}

      {result && <div className="text-xs text-[#3a3a50]">{result.note}</div>}
    </div>
  );
}
