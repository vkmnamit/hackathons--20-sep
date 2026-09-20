import { useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency, fmtPct } from '@/lib/utils';
import {
  Users, Save, RotateCcw, CheckCircle2, AlertTriangle,
  Smile, X, ChevronRight, Building2, Share2, Lock, Globe
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type Params, type TenantsResult, type TenantWarehouse, type OptResult } from '@/lib/api';

const VISIBILITY_ICONS = {
  solo: <Lock size={12} className="text-amber-400" />,
  shared: <Share2 size={12} className="text-blue-400" />,
  open: <Globe size={12} className="text-emerald-400" />,
};

export function Tenants() {
  const { nb, wh, loaded, setData } = useStore();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>(
    [{ id: 'Flipkart', name: 'Flipkart' }, { id: 'Partner', name: 'Partner (ACME)' }]
  );
  const [tWh, setTWh] = useState<TenantWarehouse[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>(companies[0]?.id || '');
  const [sharePct, setSharePct] = useState(40);
  const [fixedPct, setFixedPct] = useState<number | null>(null);
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TenantsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // init tenant warehouses from store
  const initTWh = useCallback(() => {
    const base = wh.map(w => ({
      id: w.id, name: w.name || w.id, x: w.x, y: w.y,
      fixedCost: w.fixedCost, capacity: w.capacity,
      owner: companies[0]?.id || 'Flipkart',
      visibility: 'open',
      partners: {},
    }));
    // make the last warehouse owned by Partner and shared
    if (base.length >= 2) {
      base[base.length - 1] = {
        ...base[base.length - 1],
        owner: companies[1]?.id || 'Partner',
        visibility: 'shared' as const,
        partners: { [companies[0]?.id || 'Flipkart']: { sharePct: 40, fixedPct: 40 } },
      };
    }
    setTWh(base as TenantWarehouse[]);
  }, [wh, companies]);

  useState(() => { if (loaded && tWh.length === 0) initTWh(); });

  const run = useCallback(async () => {
    if (!loaded) return;
    // build per-company demand arrays (split nb by a simple region split for demo)
    const c1 = nb.filter((_, i) => i % 2 === 0);
    const c2 = nb.filter((_, i) => i % 2 === 1);
    const demands: Record<string, (typeof nb)[0][]> = {};
    companies.forEach(c => {
      if (c.id === companies[0]?.id) demands[c.id] = c1;
      else demands[c.id] = c2;
    });
    setRunning(true); setErr(null); setRan(false);
    try {
      const out = await api.tenants({ companies, warehouses: tWh, demands, params: { algorithm: 'exact' } });
      setResult(out); setRan(true);
    } catch (e: any) {
      setErr(e.message || 'Tenants optimize failed');
    } finally { setRunning(false); }
  }, [loaded, companies, tWh, nb]);

  const mutate = async (op: any) => {
    try {
      const out = await api.share({ warehouses: tWh, op });
      setTWh(out.warehouses);
      if (ran) { run(); }
    } catch (e: any) { setErr(e.message); }
  };

  // For solo view: build nb array for the selected company
  const soloResult = result?.solo?.[selectedCompany];
  const joint = result?.joint;
  const cmp = result?.compare;

  return (
    <div className="tenants-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Users size={16} className="text-blue-400" />Multi-Tenant Warehouse Sharing
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">Solo vs joint pooling · shared warehouses with agreement splits</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={initTWh}><RotateCcw size={13}/>Reset</Button>
          <Button variant="primary" size="sm" loading={running} onClick={run}>
            <Save size={13} />{running ? 'Running...' : 'Compare Solo vs Joint'}
          </Button>
        </div>
      </div>

      {err && <div className="text-xs text-amber-400 bg-amber-500/5 p-3 rounded border border-amber-500/20"><AlertTriangle size={12} className="mr-1"/>{err}</div>}

      {/* controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Warehouses</span>
              <Badge variant="info">{tWh.length} docks</Badge>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {tWh.map(w => {
              const ownerName = (companies.find(c => c.id === w.owner)?.name) || w.owner;
              return (
                <div key={w.id} className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-colors ${
                  selectedCompany === w.owner ? 'bg-blue-500/5 border-blue-500/20' : 'border-[#1e1e2e] bg-[#0d0d16]'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-[#111118] border border-[#2a2a3a] flex items-center justify-center flex-shrink-0">
                      {VISIBILITY_ICONS[w.visibility]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-[#c0c0d0] flex items-center gap-1.5">
                        {w.name} <span className="text-[#4a4a60] font-normal">({w.owner === companies[0]?.id ? 'You' : ownerName})</span>
                      </div>
                      <div className="text-[9px] text-[#4a4a60] flex items-center gap-2 mt-0.5">
                        <span>Cap {w.capacity} · ${w.fixedCost} fixed</span>
                        {w.visibility === 'shared' && Object.keys(w.partners).length > 0 && (
                          <span className="text-blue-400">· Shared with {Object.keys(w.partners).length} partner(s)</span>
                        )}
                        {w.visibility === 'open' && <span className="text-emerald-400">· Public pool</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => mutate({ type: 'setSolo', whId: w.id })}
                      className="p-1 rounded hover:bg-[#1a1a24] text-[#5a5a70] hover:text-amber-400 transition-colors" title="Solo (only owner sees)">
                      <Lock size={12} />
                    </button>
                    <button onClick={() => mutate({ type: 'setShared', whId: w.id, partners: { [companies[1]?.id || 'Partner']: { sharePct: 40, fixedPct: 40 } } })}
                      className="p-1 rounded hover:bg-[#1a1a24] text-[#5a5a70] hover:text-blue-400 transition-colors" title="Shared with partner">
                      <Share2 size={12} />
                    </button>
                    <button onClick={() => mutate({ type: 'setOpen', whId: w.id })}
                      className="p-1 rounded hover:bg-[#1a1a24] text-[#5a5a70] hover:text-emerald-400 transition-colors" title="Open public pool">
                      <Globe size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><span className="text-sm font-medium text-white">Agreement</span></CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="text-[10px] font-mono text-[#4a4a60] block mb-1">Company</label>
              <div className="relative">
                <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
                  className="w-full appearance-none px-2 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-[#c0c0d0] focus:border-blue-500/40">
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronRight size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#3a3a50]" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#4a4a60] block mb-1">Share capacity % (partner)</label>
              <input type="number" min={0} max={100} value={sharePct} onChange={e => setSharePct(+e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/40" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#4a4a60] block mb-1">Fixed cost share % (or blank = same as share%)</label>
              <input type="number" min={0} max={100} value={fixedPct ?? ''} onChange={e => setFixedPct(e.target.value ? +e.target.value : null)}
                placeholder="same as share %"
                className="w-full px-2 py-1.5 rounded text-xs bg-[#111118] border border-[#1e1e2e] text-white font-mono focus:border-blue-500/40" />
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => {
              const p = tWh.find(w => w.owner === companies[1]?.id);
              if (!p) return;
              mutate({ type: 'agree', whId: p.id, partner: companies[0]?.id, sharePct, fixedPct: fixedPct ?? sharePct });
            }} disabled={!tWh.find(w => w.owner === companies[1]?.id)}>
              <Share2 size={12} />Sign agreement
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => {
              const p = tWh.find(w => w.owner === companies[1]?.id);
              if (!p) return;
              mutate({ type: 'close', whId: p.id });
            }}>
              <X size={12} />Revoke access
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* cost comparison */}
        {ran && cmp && (
          <>
            <Card className="lg:col-span-1">
              <CardHeader><span className="text-sm font-medium text-white">Cost Comparison</span></CardHeader>
              <CardBody className="space-y-3">
                <div className={`p-3 rounded-lg border text-sm ${cmp.saved > 0 ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20'}`}>
                  <div className="text-xs text-[#4a4a60] mb-1">Total cost</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono font-bold text-white">{fmtCurrency(cmp.soloTotal)}</span>
                    <span className="text-xs text-[#4a4a60]">solo</span>
                    <span className="text-xs text-[#3a3a50]">→</span>
                    <span className="text-2xl font-mono font-bold text-emerald-400">{fmtCurrency(cmp.jointTotal)}</span>
                    <span className="text-xs text-[#4a4a60]">joint</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <CheckCircle2 size={11} className="text-emerald-400" />
                    <span className={`text-xs font-mono ${cmp.saved > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {cmp.saved > 0 ? 'Saved' : 'Extra'} {fmtCurrency(cmp.saved)} ({fmtPct(cmp.savedPct)})
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-[#4a4a60]">{result?.note || ''}</div>
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><span className="text-sm font-medium text-white">Per-Company Breakdown</span></CardHeader>
              <CardBody className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      {['Company', 'Solo Cost', 'Joint Share', 'Saved', 'Saved %'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[9px] font-mono font-medium text-[#3a3a50] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cmp.perCompany.map((pc, i) => (
                      <tr key={i} className="border-b border-[#1a1a24] hover:bg-[#111118]">
                        <td className="px-3 py-2 font-medium text-[#c0c0d0]">{pc.companyName}</td>
                        <td className="px-3 py-2 font-mono text-[#8080a0]">{fmtCurrency(pc.soloCost)}</td>
                        <td className="px-3 py-2 font-mono text-[#8080a0]">{fmtCurrency(pc.jointShare)}</td>
                        <td className={`px-3 py-2 font-mono ${pc.saved > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pc.saved > 0 ? '-' : '+'}{fmtCurrency(Math.abs(pc.saved))}
                        </td>
                        <td className={`px-3 py-2 font-mono ${pc.saved > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pc.savedPct > 0 ? '+' : ''}{pc.savedPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {/* solo vs joint detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white flex items-center gap-1.5">
                <Lock size={12} className="text-amber-400" />Solo (each company on own view)
              </span>
              {soloResult && <Badge variant="muted">{soloResult.totalCost ? fmtCurrency(soloResult.totalCost) : '—'}</Badge>}
            </div
          >
          </CardHeader>
          <CardBody className="text-xs text-[#6b6b80] space-y-1">
            <div className="text-[#4a4a60]">Each company optimizes using only its own demand over warehouses it can see: its own full-capacity docks + any shared dock derated to its share % (with fixed cost prorated). Solo-marked warehouses are invisible to partners.</div>
            {soloResult && (
              <div className="pt-2 border-t border-[#1e1e2e] space-y-1">
                <div className="flex justify-between"><span className="text-[#4a4a60]">Warehouses opened</span><span className="font-mono text-white">{soloResult.openWarehouses.join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-[#4a4a60]">Delivery cost</span><span className="font-mono text-white">{fmtCurrency(soloResult.deliveryCost)}</span></div>
                <div className="flex justify-between"><span className="text-[#4a4a60]">Avg distance</span><span className="font-mono text-white">{soloResult.avgDistance.toFixed(2)} km</span></div>
                <div className="flex justify-between"><span className="text-[#4a4a60]">Algorithm</span><span className="font-mono text-[#8080a0]">{soloResult.algorithmUsed}</span></div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white flex items-center gap-1.5">
                <Globe size={12} className="text-emerald-400" />Joint (pooled demand, one C++ run)
              </span>
              {joint && <Badge variant="success">{fmtCurrency(joint.totalCost)}</Badge>}
            </div
          >
          </CardHeader>
          <CardBody className="text-xs text-[#6b6b80] space-y-1">
            <div className="text-[#4a4a60]">All companies' demand pooled into one capacitated facility-location problem over full-capacity warehouses. Fixed cost split pro-rata by delivery share. This is the "optimal path" — what's achievable when everyone cooperates.</div>
            {joint && (
              <div className="pt-2 border-t border-[#1e1e2e] space-y-1">
                <div className="flex justify-between"><span className="text-[#4a4a60]">Warehouses opened</span><span className="font-mono text-white">{joint.openWarehouses.join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-[#4a4a60]">Delivery cost</span><span className="font-mono text-white">{fmtCurrency(joint.deliveryCost)}</span></div>
                <div className="flex justify-between"><span className="text-[#4a4a60]">Avg distance</span><span className="font-mono text-white">{joint.avgDistance.toFixed(2)} km</span></div>
                <div className="flex justify-between"><span className="text-[#4a4a60]">Algorithm</span><span className="font-mono text-[#8080a0]">{joint.algorithmUsed}</span></div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
