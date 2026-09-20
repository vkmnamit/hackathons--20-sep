import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmt } from '@/lib/utils';
import { api, type FulfillWarehouse } from '@/lib/api';
import { Warehouse as WarehouseIcon, Plus, Trash2, Save, RefreshCw, MapPin, Search, ChevronDown, Activity, Boxes, Gauge } from 'lucide-react';

const blank = (): FulfillWarehouse => ({
  id: 'W' + Math.floor(100 + Math.random() * 900),
  name: 'New warehouse', x: 50, y: 50,
  capacity: 600, storageM3: 3, throughputPerHr: 100,
  handlingCostPerUnit: 1.2, fixedOperatingCost: 600,
  open: true, waves: [8, 12, 16, 20], vehicles: [],
});

/** Warehouse registry: every site lives in the DB (Supabase wlo_warehouses
 *  when configured, else backend/data/warehouses.json). */
export function Warehouses() {
  const [rows, setRows] = useState<FulfillWarehouse[]>([]);
  const [via, setVia] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [sort, setSort] = useState<'name' | 'capacity' | 'throughput'>('name');

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.warehouses();
      setRows(r.warehouses); setVia(r.via); setUpdatedAt(r.updatedAt ?? null);
    } catch (e: any) { setErr(e.message || 'Failed to load warehouses'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const patch = (id: string, p: Partial<FulfillWarehouse>) =>
    setRows(prev => prev.map(w => w.id === id ? { ...w, ...p } : w));

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null);
    try {
      const r = await api.saveWarehouses({ warehouses: rows });
      setRows(r.warehouses); setVia(r.via);
      setMsg('Saved ' + r.count + ' via ' + r.via);
    } catch (e: any) { setErr(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };
  const num = (v: string, fb: number) => { const n = parseFloat(v); return isFinite(n) ? n : fb; };
  const visibleRows = useMemo(() => rows.filter(w => {
    const matchesQuery = `${w.name || ''} ${w.id}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === 'all' || (status === 'open' ? w.open !== false : w.open === false);
    return matchesQuery && matchesStatus;
  }).sort((a, b) => sort === 'capacity' ? (b.capacity ?? 0) - (a.capacity ?? 0) : sort === 'throughput' ? (b.throughputPerHr ?? 0) - (a.throughputPerHr ?? 0) : (a.name || a.id).localeCompare(b.name || b.id)), [rows, query, status, sort]);
  const totalCapacity = rows.reduce((sum, w) => sum + (w.capacity ?? 0), 0);
  const totalThroughput = rows.reduce((sum, w) => sum + (w.throughputPerHr ?? 0), 0);
  const openCount = rows.filter(w => w.open !== false).length;

  return (
    <div className="warehouses-shell page-enter p-4 md:p-7 space-y-5 max-w-7xl mx-auto">
      <div className="warehouses-header flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <WarehouseIcon size={15} className="text-emerald-400" />Warehouses
          </h1>
          <p className="text-[11px] text-[#4a4a60]">
            Stored in DB{via ? <> · <span className="font-mono text-[#8080a0]">via {via}</span></> : null}
            {updatedAt ? <> · <span className="font-mono text-[#8080a0]">{new Date(updatedAt).toLocaleString()}</span></> : null}
            {' '}· changes apply to fulfillment on next run
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={12} />Reload
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRows(prev => [...prev, blank()])}>
            <Plus size={12} />Add
          </Button>
          <Button size="sm" variant="primary" onClick={save} loading={saving}>
            <Save size={12} />Save all
          </Button>
        </div>
      </div>

      {err && <div className="warehouse-alert warehouse-alert-error">{err}</div>}
      {msg && <div className="warehouse-alert warehouse-alert-success">{msg}</div>}

      <section className="warehouse-overview">
        <div className="section-kicker"><Activity size={12} /> Network overview</div>
        <div className="warehouse-metrics"><div><span>Total warehouses</span><strong>{rows.length}</strong></div><div><span>Open warehouses</span><strong className="text-emerald-300">{openCount}</strong></div><div><span>Total capacity</span><strong>{fmt(totalCapacity)}</strong><small>units</small></div><div><span>Total throughput</span><strong>{fmt(totalThroughput)}</strong><small>/hr</small></div></div>
      </section>

      <div className="warehouse-toolbar">
        <div className="warehouse-search"><Search size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search warehouses..." /></div>
        <select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="all">All status</option><option value="open">Open only</option><option value="closed">Closed only</option></select>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="name">Sort: Name</option><option value="capacity">Sort: Capacity</option><option value="throughput">Sort: Throughput</option></select>
        <Button size="sm" variant="secondary" onClick={() => { const next = blank(); setRows(prev => [...prev, next]); setExpanded(next.id); }}><Plus size={12} />Add warehouse</Button>
      </div>

      {loading ? (
        <div className="warehouse-list-state">Loading warehouse network…</div>
      ) : (
        <div className="warehouse-list">
          {visibleRows.map(w => {
            const signal = Math.min(100, Math.round(((w.throughputPerHr ?? 0) / Math.max(w.capacity ?? 1, 1)) * 100));
            const isExpanded = expanded === w.id;
            return <div key={w.id} className={`warehouse-row ${w.open === false ? 'is-closed' : 'is-open'} ${isExpanded ? 'is-expanded' : ''}`}>
              <div className="warehouse-row-main">
                <div className="warehouse-status-mark" />
                <div className="warehouse-identity"><input value={w.name || w.id} onChange={e => patch(w.id, { name: e.target.value })} /><span>{w.id} · {w.open === false ? 'closed from network' : 'active in network'}</span></div>
                <div className="warehouse-fact"><span>Capacity</span><strong>{fmt(w.capacity ?? 0)}</strong></div>
                <div className="warehouse-fact"><span>Throughput</span><strong>{fmt(w.throughputPerHr ?? 0)}<small>/hr</small></strong></div>
                <div className="warehouse-signal"><div className="signal-label"><span>capacity signal</span><b>{signal}%</b></div><div className="signal-track"><i style={{ width: `${signal}%` }} /></div></div>
                <div className="warehouse-actions"><Badge variant={w.open === false ? 'muted' : 'success'}>{w.open === false ? 'closed' : 'open'}</Badge><button onClick={() => patch(w.id, { open: !(w.open !== false) })}>{w.open === false ? 'Open' : 'Close'}</button><button className="edit-toggle" onClick={() => setExpanded(isExpanded ? null : w.id)}>{isExpanded ? 'Done' : 'Edit details'}<ChevronDown size={13} className={isExpanded ? 'rotate-180' : ''} /></button><button className="delete-action" onClick={() => setRows(prev => prev.filter(x => x.id !== w.id))}><Trash2 size={14} /></button></div>
              </div>
              {isExpanded && <div className="warehouse-edit-details"><div className="edit-details-heading"><div><span>Editing {w.id}</span><small>Coordinates and operating profile</small></div><MapPin size={15} /></div><div className="edit-fields">
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-[#4a4a60] flex items-center gap-1"><MapPin size={10} />x (east km)</span>
                  <input type="number" value={w.x} onChange={e => patch(w.id, { x: num(e.target.value, w.x) })}
                    className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-2 py-1 text-white font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-[#4a4a60]">y (north km)</span>
                  <input type="number" value={w.y} onChange={e => patch(w.id, { y: num(e.target.value, w.y) })}
                    className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-2 py-1 text-white font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-[#4a4a60]">capacity (units)</span>
                  <input type="number" value={w.capacity ?? 500} onChange={e => patch(w.id, { capacity: num(e.target.value, 500) })}
                    className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-2 py-1 text-white font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-[#4a4a60]">throughput/hr</span>
                  <input type="number" value={w.throughputPerHr ?? 100} onChange={e => patch(w.id, { throughputPerHr: num(e.target.value, 100) })}
                    className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-2 py-1 text-white font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-[#4a4a60]">storage m³</span>
                  <input type="number" value={w.storageM3 ?? 3} onChange={e => patch(w.id, { storageM3: num(e.target.value, 3) })}
                    className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-2 py-1 text-white font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-[#4a4a60]">waves (csv hrs)</span>
                  <input value={(w.waves || []).join(',')} onChange={e => patch(w.id, { waves: e.target.value.split(',').map(s => num(s.trim(), 0)).filter(n => n > 0) })}
                    className="w-full bg-[#111118] border border-[#1e1e2e] rounded px-2 py-1 text-white font-mono" />
                </label>
              </div></div>}
            </div>;
          })}
          {!visibleRows.length && <div className="warehouse-list-state">No warehouses match the current filters.</div>}
        </div>
      )}
    </div>
  );
}
