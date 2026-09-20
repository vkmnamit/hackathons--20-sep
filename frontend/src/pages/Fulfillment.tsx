import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, fmt, fmtCurrency } from '@/lib/utils';
import {
  Truck, Package, Boxes, Clock, Target, AlertTriangle, CheckCircle2, Play, MapPin,
  Repeat, Layers, Zap, CircleDot, TrendingUp, Warehouse as WarehouseIcon, Route, XCircle,
  Info,
} from 'lucide-react';
import {
  api, type FulfillDemo, type FulfillPlan, type FulfillOrderRow, type FulfillParamsIn, type Assignment,
} from '@/lib/api';
import { CustomerMap, DockTable, FlowTimeline } from './CustomerMap';

type Tab = 'orders' | 'inventory' | 'routes' | 'storage' | 'rebalance';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'orders',    label: 'Order console',     icon: Package },
  { id: 'inventory', label: 'Products × Sites',  icon: Boxes },
  { id: 'routes',    label: 'Dispatch & routes', icon: Truck },
  { id: 'storage',   label: 'Storage plan',      icon: Layers },
  { id: 'rebalance', label: 'Rebalance',         icon: Repeat },
];

const PRIORITY_VARIANT: Record<string, 'danger' | 'warning' | 'muted'> = {
  critical: 'danger', express: 'warning', standard: 'muted',
};
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  fulfilled: 'success', partial: 'warning', unfulfilled: 'danger',
};
const ACTION_VARIANT: Record<string, 'warning' | 'danger' | 'info' | 'muted'> = {
  restock: 'warning', capacity_limited: 'danger', excess: 'info', hold: 'muted',
};
const ACTION_LABEL: Record<string, string> = {
  restock: 'restock', capacity_limited: 'cube-limited', excess: 'excess', hold: 'hold',
};

/** Hours-from-now rendered the way an ops board shows it. */
export function hLabel(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h === 0) return 'now';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm';
  return h.toFixed(h < 10 ? 1 : 0) + 'h';
}

/** Absolute calendar date for an hours-from-now stamp ("Sep 20, 14:30").
 *  Plans run from "now", so every ETA/departure becomes a real date. */
export function dateLabel(h: number | null | undefined): string {
  if (h == null) return '—';
  const d = new Date(Date.now() + h * 3600e3);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function Kpi({ label, value, sub, icon: Icon, tone = 'blue' }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/8',
    green: 'text-emerald-400 bg-emerald-500/8',
    amber: 'text-amber-400 bg-amber-500/8',
    red: 'text-red-400 bg-red-500/8',
    violet: 'text-violet-400 bg-violet-500/8',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50]">{label}</div>
          <div className="text-lg font-semibold text-white mt-1 truncate">{value}</div>
          {sub && <div className="text-[11px] text-[#4a4a60] mt-0.5 truncate">{sub}</div>}
        </div>
        <div className={cn('w-7 h-7 rounded flex items-center justify-center flex-shrink-0', tones[tone])}>
          <Icon size={14} />
        </div>
      </div>
    </Card>
  );
}

const selectCls =
  'bg-[#111118] border border-[#1e1e2e] text-[#a0a0b0] rounded px-2 py-1 text-xs ' +
  'focus:outline-none focus:border-blue-500/40 transition-colors';

export function Fulfillment() {
  const [demo, setDemo] = useState<FulfillDemo | null>(null);
  const [plan, setPlan] = useState<FulfillPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('orders');
  const [selected, setSelected] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [commit, setCommit] = useState(false);
  const [includeStorage, setIncludeStorage] = useState(true);
  const [includeRebalance, setIncludeRebalance] = useState(true);
  const [ordersCount, setOrdersCount] = useState(18);
  const [params, setParams] = useState<FulfillParamsIn>({
    strategy: 'balanced', maxSplitShipments: 2, maxServiceRadius: 60, shipmentFixedCost: 9,
    kmPerHour: 28, serviceMinPerStop: 5, latePenaltyPerHr: 12, maxLateHr: 36,
  });

  const refresh = useCallback(async (onlyArea?: string) => {
    setRunning(true); setErr(null);
    try {
      const d = await api.fulfillDemo({ seed: 7, orders: ordersCount });
      setDemo(d);
      // "Do it for me": when an area is picked, auto-plan just that area's
      // orders so every recommendation is scoped to what you filtered.
      const scopedOrders = onlyArea && onlyArea !== 'all'
        ? d.orders.filter(o => ((o.customerName || '').split(' #')[0] || 'Other') === onlyArea)
        : d.orders;
      const p = await api.fulfill({
        warehouses: d.warehouses, orders: scopedOrders.length ? scopedOrders : d.orders,
        products: d.products, demand: d.demand,
        params, options: { commit, includeRoutes: true, includeStorage, includeRebalance },
      });
      setPlan(p);
      setSelected(prev => (prev && p.orders.some(o => o.orderId === prev)) ? prev : (p.orders[0]?.orderId ?? null));
    } catch (e: any) {
      setErr(e.message || 'Fulfillment plan failed');
    } finally { setRunning(false); }
  }, [ordersCount, params, commit, includeStorage, includeRebalance]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Apply the suggested stock transfers for real (books units site-to-site). */
  const applyTransfers = useCallback(async () => {
    if (!demo || !plan?.rebalance?.moves?.length) return;
    setRunning(true); setErr(null);
    try {
      const r = await api.rebalance({
        warehouses: demo.warehouses, orders: demo.orders, params,
        commit: true, stockoutPenaltyPerUnit: 25,
      });
      setPlan({ ...plan, rebalance: r });
    } catch (e: any) { setErr(e.message || 'Rebalance failed'); }
    finally { setRunning(false); }
  }, [demo, plan, params]);

  const selectedOrder: FulfillOrderRow | null =
    plan && selected ? (plan.orders.find(o => o.orderId === selected) ?? null) : null;
  const selectedAssignments: Assignment[] = plan && selected
    ? plan.assignments.filter(a => a.orderId === selected) : [];

  /** Area = city prefix of customerName ("Whitefield #3" -> "Whitefield"). */
  const areaOf = (name: string) => (name || '').split(' #')[0].split(' - ')[0].trim() || 'Other';
  const areas = useMemo(() => {
    if (!plan) return [];
    const s = new Set(plan.orders.map(o => areaOf(o.customerName)));
    return [...s].sort();
  }, [plan]);

  const filteredOrders = useMemo(() => {
    if (!plan) return [];
    const q = search.trim().toLowerCase();
    return plan.orders.filter(o => {
      if (areaFilter !== 'all' && areaOf(o.customerName) !== areaFilter) return false;
      if (q && !(o.orderId.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) ||
        o.customerId.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [plan, areaFilter, search]);

  // Keep selection valid when filter changes: jump to first visible order.
  useEffect(() => {
    if (!plan) return;
    if (!filteredOrders.some(o => o.orderId === selected)) {
      setSelected(filteredOrders[0]?.orderId ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaFilter, search, plan]);

  const kpis = useMemo(() => {
    if (!plan) return null;
    const t = plan.totals;
    return {
      fill: t.fillRate.toFixed(1) + '%',
      onTime: t.onTimePct.toFixed(0) + '%',
      cost: fmtCurrency(Math.round(t.totalCost)),
      orders: t.ordersFulfilled + ' / ' + t.orders,
      trips: t.trips + ' trips · ' + t.vehiclesUsed + ' vans',
      load: t.avgTruckLoadPct.toFixed(0) + '%',
      sites: t.sitesUsed,
      routeKm: t.routeKm,
      splits: t.splits,
      atRisk: t.atRiskLines,
      short: t.linesUnfulfilled,
      late: t.lateLines,
      partial: t.ordersPartial,
      routeCost: Math.round(t.routeCost),
    };
  }, [plan]);

  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button onClick={() => set(!on)}
      className={cn('flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors',
        on ? 'border-blue-500/40 text-blue-300 bg-blue-500/5' : 'border-[#1e1e2e] text-[#4a4a60] hover:text-[#8080a0]')}>
      {on ? <CheckCircle2 size={11} /> : <CircleDot size={11} />}{label}
    </button>
  );

  return (
    <div className="fulfillment-shell page-enter h-full overflow-y-auto bg-[#0a0a0f] p-4 md:p-7 space-y-5">
      {/* header */}
      <div className="fulfillment-hero flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Truck size={16} className="text-blue-400" />Order Fulfillment
            {demo?.warehouseVia && (
              <span className="text-[10px] font-mono font-normal text-[#8080a0] border border-[#1e1e2e] rounded px-1.5 py-0.5"
                title="Where the warehouse list came from: Supabase DB, local file, or built-in seed">
                warehouses via {demo.warehouseVia}
              </span>
            )}
          </h1>
          <p className="text-xs text-[#4a4a60] mt-0.5">
            Order allocation · inventory · dispatch waves · vehicle routes · rebalancing &amp; storage
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {plan && <Badge variant="info"><Zap size={10} />{plan.runtimeMs} ms</Badge>}
          {plan && <Badge variant="muted">{plan.totals.shipments} shipments</Badge>}
          <select className={selectCls} value={ordersCount}
            onChange={e => setOrdersCount(Number(e.target.value))}>
            {[10, 14, 18, 24, 32].map(n => <option key={n} value={n}>{n} orders</option>)}
          </select>
          <Button variant="primary" size="sm" loading={running} onClick={() => refresh()}>
            <Play size={13} />Run plan
          </Button>
        </div>
      </div>

      <div className="fulfillment-steps grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div className="workflow-step active"><b>01</b><span>Run plan</span><p>Score every warehouse for stock, distance, cost, and delivery deadline.</p></div>
        <div className="workflow-step"><b>02</b><span>Select a customer</span><p>Click an order below or a customer dot on the network map.</p></div>
        <div className="workflow-step"><b>03</b><span>Review the decision</span><p>See the recommended warehouse, delivery route, ETA, and cost.</p></div>
        <div className="workflow-step"><b>04</b><span>Plan growth</span><p>Use Year Simulation to identify when and where to open a new warehouse.</p></div>
      </div>

      {/* operating parameters */}
      <Card className="fulfillment-controls">
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] flex flex-col gap-1">
            Strategy
            <select className={selectCls} value={params.strategy}
              onChange={e => setParams({ ...params, strategy: e.target.value as FulfillParamsIn['strategy'] })}>
              <option value="cost">cost — cheapest</option>
              <option value="balanced">balanced</option>
              <option value="speed">speed — fastest</option>
              <option value="green">green — fewest km</option>
            </select>
          </label>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] flex flex-col gap-1">
            Service radius (km)
            <input type="number" min={5} max={500} className={cn(selectCls, 'w-20')}
              value={params.maxServiceRadius}
              onChange={e => setParams({ ...params, maxServiceRadius: Number(e.target.value) })} />
          </label>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] flex flex-col gap-1">
            Max splits / line
            <select className={selectCls} value={params.maxSplitShipments}
              onChange={e => setParams({ ...params, maxSplitShipments: Number(e.target.value) })}>
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] flex flex-col gap-1">
            Shipment fee ($)
            <input type="number" min={0} className={cn(selectCls, 'w-20')}
              value={params.shipmentFixedCost}
              onChange={e => setParams({ ...params, shipmentFixedCost: Number(e.target.value) })} />
          </label>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] flex flex-col gap-1">
            Late penalty ($/h)
            <input type="number" min={0} className={cn(selectCls, 'w-20')}
              value={params.latePenaltyPerHr}
              onChange={e => setParams({ ...params, latePenaltyPerHr: Number(e.target.value) })} />
          </label>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] flex flex-col gap-1">
            Van speed (km/h)
            <input type="number" min={5} className={cn(selectCls, 'w-20')}
              value={params.kmPerHour}
              onChange={e => setParams({ ...params, kmPerHour: Number(e.target.value) })} />
          </label>
          <div className="flex items-center gap-3 pl-2 border-l border-[#1e1e2e]">
            {toggle(commit, setCommit, 'Commit inventory')}
            {toggle(includeStorage, setIncludeStorage, 'Storage plan')}
            {toggle(includeRebalance, setIncludeRebalance, 'Rebalance')}
          </div>
        </CardBody>
      </Card>

      {err && (
        <Card className="ops-error"><CardBody className="flex items-start gap-3 text-xs text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><strong className="block text-red-200">Fulfillment plan unavailable</strong><span className="mt-1 block text-red-300/80">The operational solver could not complete this plan. Existing controls and data are unchanged.</span><code className="mt-2 block break-all rounded bg-black/20 px-2 py-1 font-mono text-[10px] text-red-300/60">{err}</code></div>
        </CardBody></Card>
      )}

      {plan && demo && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-medium text-white flex items-center gap-1.5">
                <Route size={12} className="text-blue-400" />
                {selectedOrder
                  ? <>Customer map — live delivery view · <span className="font-mono text-blue-300">{selectedOrder.customerName}</span>
                    <span className="text-[#4a4a60] font-mono text-[11px]"> ({selectedOrder.orderId} · lanes/markers clickable)</span></>
                  : 'Network view — who ships to whom'}
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono text-[#4a4a60]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-emerald-500 inline-block rounded-sm" />site</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />on-time flow</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />at risk / split</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />partial</span>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {selectedOrder ? (
              <>
                <CustomerMap plan={plan} demo={demo} order={selectedOrder}
                  assignments={selectedAssignments} areaOf={areaOf} onClear={() => setSelected(null)} />
                <DockTable plan={plan} demo={demo} order={selectedOrder} assignments={selectedAssignments} />
              </>
            ) : (
            <svg viewBox="0 0 100 100" className="w-full h-[300px]">
              {[20, 40, 60, 80].map(v => (
                <g key={'g' + v}>
                  <line x1={v} y1={6} x2={v} y2={94} stroke="#16161f" strokeWidth={0.2} />
                  <line x1={6} y1={v} x2={94} y2={v} stroke="#16161f" strokeWidth={0.2} />
                </g>
              ))}
              {plan.assignments.map((a, i) => {
                const w = demo.warehouses.find(x => x.id === a.warehouseId);
                if (!w) return null;
                const isSel = a.orderId === selected;
                const bad = a.atRisk || a.lateHr > 0 || a.split;
                return (
                  <line key={'f' + i} x1={w.x} y1={100 - w.y} x2={a.x} y2={100 - a.y}
                    stroke={bad ? '#ef4444' : '#3b82f6'}
                    strokeWidth={isSel ? 0.9 : bad ? 0.5 : 0.35}
                    opacity={selected == null ? 0.5 : isSel ? 1 : 0.12}
                    strokeLinecap="round" />
                );
              })}
              {(selected ? plan.orders.filter(o => o.orderId === selected)
                : filteredOrders.length ? filteredOrders : plan.orders).map(o => (
                <circle key={'o' + o.orderId} cx={o.x} cy={100 - o.y}
                  r={selected === o.orderId ? 1.6 : 0.9}
                  onClick={() => { setSelected(o.orderId); setTab('orders'); }}
                  className="cursor-pointer"
                  stroke={selected === o.orderId ? '#ffffff' : 'transparent'} strokeWidth={selected === o.orderId ? 0.7 : 0}
                  fill={o.status === 'unfulfilled' ? '#ef4444' : o.status === 'partial' ? '#f59e0b' : '#60a5fa'} />
              ))}
              {demo.warehouses.map(w => (
                <g key={w.id}>
                  <rect x={w.x - 2.4} y={100 - w.y - 2.4} width={4.8} height={4.8} rx={0.8} fill="#22c55e" />
                  <text x={w.x + 3.4} y={100 - w.y + 1.1} fontSize={2.5} fill="#8080a0"
                    fontFamily="monospace">{(w.name || w.id).split(' ')[0]}</text>
                  <text x={w.x + 3.4} y={100 - w.y + 4.1} fontSize={2.1} fill="#4a4a60"
                    fontFamily="monospace">cap {fmt((w.throughputPerHr ?? w.capacity ?? 0) >= 1e9 ? (w.capacity ?? 0) : (w.throughputPerHr ?? w.capacity ?? 0))}</text>
                </g>
              ))}
            </svg>
            )}
          </CardBody>
        </Card>
      )}

      {/* tabs */}
      <div className="operations-tabs flex items-center gap-1 border-b border-[#1e1e2e] overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const count = t.id === 'rebalance' ? plan?.rebalance?.moves.length ?? 0 : 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap transition-colors',
                tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-[#4a4a60] hover:text-[#8080a0]')}>
              <Icon size={12} />{t.label}
              {count > 0 && <Badge variant="muted" className="ml-1">{count}</Badge>}
            </button>
          );
        })}
      </div>

      {/* ===================== ORDER CONSOLE ===================== */}
      {tab === 'orders' && plan && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white flex items-center gap-1.5">
                    <Package size={12} className="text-blue-400" />Allocation per order
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
                    className={selectCls} title="Filter customers by area">
                    <option value="all">All areas ({plan.orders.length})</option>
                    {areas.map(a => {
                      const n = plan.orders.filter(o => areaOf(o.customerName) === a).length;
                      return <option key={a} value={a}>{a} ({n})</option>;
                    })}
                  </select>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search order / customer…" className={selectCls + ' w-44 placeholder:text-[#3a3a50]'} />
                  <Button size="sm" variant="primary" onClick={() => refresh(areaFilter)}
                    disabled={running} title="Re-run the optimizer scoped to the selected area — it picks the optimal dock automatically">
                    <Zap size={12} />Optimize {areaFilter === 'all' ? 'all' : areaFilter} for me
                  </Button>
                  {(areaFilter !== 'all' || search) && (
                    <button onClick={() => { setAreaFilter('all'); setSearch(''); }}
                      className="text-[11px] text-[#8080a0] hover:text-white font-mono">clear ✕</button>
                  )}
                  <Badge variant="muted">{filteredOrders.length} of {plan.orders.length} orders</Badge>
                </div>
              </div>
            </CardHeader>
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] border-b border-[#1e1e2e]">
                    <th className="text-left px-4 py-2 font-medium">Order</th>
                    <th className="text-left px-3 py-2 font-medium">Customer</th>
                    <th className="text-left px-3 py-2 font-medium">Priority</th>
                    <th className="text-right px-3 py-2 font-medium">Due</th>
                    <th className="text-left px-3 py-2 font-medium">Ships from</th>
                    <th className="text-right px-3 py-2 font-medium">Dispatch</th>
                    <th className="text-right px-3 py-2 font-medium">ETA</th>
                    <th className="text-right px-3 py-2 font-medium">Slack</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.orderId} onClick={() => setSelected(o.orderId)}
                      className={cn('border-b border-[#1e1e2e]/60 cursor-pointer transition-colors',
                        selected === o.orderId ? 'bg-blue-500/5' : 'hover:bg-[#15151f]')}>
                      <td className="px-4 py-2 font-mono text-[#c0c0d0]">{o.orderId}</td>
                      <td className="px-3 py-2 text-[#8080a0] max-w-[9rem] truncate">{o.customerName}</td>
                      <td className="px-3 py-2"><Badge variant={PRIORITY_VARIANT[o.priority]}>{o.priority}</Badge></td>
                      <td className="px-3 py-2 text-right font-mono text-[#8080a0]" title={'due ' + dateLabel(o.dueHr)}>{hLabel(o.dueHr)}</td>
                      <td className="px-3 py-2 font-mono text-[#c0c0d0]">{o.warehouses.join(' + ') || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#8080a0]" title={'depart ' + dateLabel(o.departHr)}>{hLabel(o.departHr)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#c0c0d0]" title={'ETA ' + dateLabel(o.etaHr)}>{hLabel(o.etaHr)}</td>
                      <td className={cn('px-3 py-2 text-right font-mono',
                        (o.slackHr ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400')}>
                        {o.slackHr == null ? '—' : (o.slackHr >= 0 ? '+' : '') + o.slackHr.toFixed(1) + 'h'}
                      </td>
                      <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[o.status]}>{o.status}</Badge></td>
                      <td className="px-4 py-2 text-right font-mono text-[#c0c0d0]">
                        {fmtCurrency(Math.round(o.cost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <div className="xl:col-span-2 space-y-5">
            {selectedOrder && (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-white font-mono">{selectedOrder.orderId}</div>
                      <div className="text-[11px] text-[#4a4a60] mt-0.5">
                        {selectedOrder.customerName} · {selectedOrder.customerId} · due {dateLabel(selectedOrder.dueHr)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={PRIORITY_VARIANT[selectedOrder.priority]}>{selectedOrder.priority}</Badge>
                      <Badge variant={STATUS_VARIANT[selectedOrder.status]}>{selectedOrder.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-blue-300">Customer delivery recommendation</div>
                  <FlowTimeline assignments={selectedAssignments} />
                  {selectedAssignments.map(a => {
                    const steps = [
                      { icon: Boxes, label: a.productId + ' · inventory check',
                        text: a.warehouseName + ': ' + a.stockAtPick.onHand + ' on hand, ' +
                          a.stockAtPick.reserved + ' reserved → ' + a.stockAtPick.available + ' available' +
                          (a.stockAtPick.incomingByDue > 0 ? ', +' + a.stockAtPick.incomingByDue + ' inbound by due' : '') },
                      { icon: WarehouseIcon, label: 'Optimal dock for ' + a.productId,
                        text: a.warehouseName + ' — ' + a.distKm.toFixed(1) + ' km road, ' +
                          a.transitHr.toFixed(2) + 'h transit · ETA ' + dateLabel(a.etaHr) + ' vs due ' + dateLabel(a.dueHr) +
                          (a.tripId ? ' · ' + a.tripId + ' / van ' + (a.vehicleId || '—') + (a.stopSeq ? ' · stop ' + a.stopSeq : '') : '') },
                    ];
                    return (
                      <div key={a.key} className="space-y-1.5">
                        {steps.map((s, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="flex flex-col items-center pt-0.5">
                              <div className="w-5 h-5 rounded bg-[#16161f] border border-[#1e1e2e] flex items-center justify-center">
                                <s.icon size={11} className="text-blue-400" />
                              </div>
                              {i < steps.length - 1 && <div className="w-px flex-1 min-h-[10px] bg-[#1e1e2e]" />}
                            </div>
                            <div className="pb-1.5">
                              <div className="text-[11px] text-[#c0c0d0]">{s.label}</div>
                              <div className="text-[11px] text-[#6b6b80]">{s.text}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {selectedAssignments.map(a => (
                    <div key={'cand' + a.key} className="pt-2 border-t border-[#1e1e2e]">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] mb-2">
                        {a.productId} — all warehouses → this customer · optimal first
                      </div>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-[10px] font-mono uppercase text-[#3a3a50]">
                            <th className="text-left py-1 font-medium">Dock</th>
                            <th className="text-right font-medium">km</th>
                            <th className="text-right font-medium">ETA</th>
                            <th className="text-right font-medium">avail</th>
                            <th className="text-left pl-2 font-medium">verdict</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.candidates.map(c => (
                            <tr key={c.warehouseId}
                              className={cn('border-t border-[#1e1e2e]/60',
                                c.warehouseId === a.warehouseId && 'bg-emerald-500/5')}>
                              <td className="py-1 font-mono text-[#c0c0d0]">
                                {c.warehouseId === a.warehouseId ? '▸ ' : ''}{c.warehouseId}
                                {c.warehouseId === a.warehouseId &&
                                  <span className="ml-1 text-[9px] font-mono text-emerald-400 border border-emerald-500/30 rounded px-1">OPTIMAL</span>}
                              </td>
                              <td className="text-right font-mono text-[#8080a0]">{c.distKm.toFixed(1)}</td>
                              <td className="text-right font-mono text-[#8080a0]">{dateLabel(c.etaHr)}</td>
                              <td className="text-right font-mono text-[#8080a0]">
                                {c.available}{c.incomingByDue > 0 ? ' (+' + c.incomingByDue + ')' : ''}
                              </td>
                              <td className="pl-2">
                                {c.feasible
                                  ? <span className="text-emerald-400">available</span>
                                  : <span className="text-[#4a4a60]">{c.reason}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  <div className="pt-2 border-t border-[#1e1e2e] space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50]">Order lines</div>
                    {selectedOrder.lines.map(l => (
                      <div key={l.productId} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-mono text-[#c0c0d0]">{l.productId} × {l.qty}</span>
                        <span className="font-mono text-[#8080a0] text-right">
                          {l.allocated + 1e-9 >= l.qty ? 'fully allocated' : 'short ' + (l.qty - l.allocated).toFixed(0)}
                          {' · '}{l.warehouses.map(w => w.warehouseId + '×' + w.qty).join(', ') || '—'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-[#1e1e2e] grid grid-cols-3 gap-2">
                    {[
                      { k: 'Shipments', v: String(selectedOrder.shipments) },
                      { k: 'Slack', v: selectedOrder.slackHr == null ? '—' : selectedOrder.slackHr.toFixed(1) + 'h',
                        tone: (selectedOrder.slackHr ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400' },
                      { k: 'Cost', v: fmtCurrency(Math.round(selectedOrder.cost)) },
                    ].map(c => (
                      <div key={c.k}>
                        <div className="text-[10px] font-mono uppercase text-[#3a3a50]">{c.k}</div>
                        <div className={cn('font-mono text-[11px]', c.tone || 'text-[#c0c0d0]')}>{c.v}</div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            {plan.unfulfilled.length > 0 && (
              <Card>
                <CardHeader>
                  <span className="text-sm font-medium text-white flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-amber-400" />
                    Short lines &amp; recovery ({plan.unfulfilled.length})
                  </span>
                </CardHeader>
                <CardBody className="space-y-2">
                  {plan.unfulfilled.map(u => (
                    <div key={u.orderId + u.productId}
                      className="rounded border border-[#1e1e2e] bg-[#0d0d16] p-2.5">
                      <div className="flex items-center gap-2 text-[11px] flex-wrap">
                        <XCircle size={11} className="text-red-400" />
                        <span className="font-mono text-[#c0c0d0]">{u.orderId} {u.productId} ×{u.qty}</span>
                        <Badge variant="muted">{u.reason}</Badge>
                        <Badge variant={u.recovery.type === 'lost' ? 'danger' : 'info'}>{u.recovery.type}</Badge>
                      </div>
                      <div className="text-[11px] text-[#6b6b80] mt-1">{u.recovery.note}</div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ===================== PRODUCTS × SITES ===================== */}
      {tab === 'inventory' && plan && demo && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Boxes size={12} className="text-blue-400" />
                  Product × warehouse map — available → after this plan
                </span>
                <span className="text-[10px] font-mono text-[#4a4a60]">
                  blue +n = inbound replenishment · red = oversubscribed
                </span>
              </div>
            </CardHeader>
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] border-b border-[#1e1e2e]">
                    <th className="text-left px-4 py-2 font-medium">SKU</th>
                    {demo.warehouses.map(w => (
                      <th key={w.id} className="text-right px-3 py-2 font-medium">{w.id}</th>
                    ))}
                    <th className="text-right px-4 py-2 font-medium">Network</th>
                  </tr>
                </thead>
                <tbody>
                  {demo.products.map(p => {
                    const cells = demo.warehouses.map(w =>
                      plan.inventory.find(r => r.warehouseId === w.id && r.productId === p.id));
                    const totAvail = cells.reduce((s, r) => s + (r ? r.available : 0), 0);
                    const totAfter = cells.reduce((s, r) => s + (r ? r.afterAvailable : 0), 0);
                    return (
                      <tr key={p.id} className="border-b border-[#1e1e2e]/60">
                        <td className="px-4 py-2">
                          <div className="font-mono text-[#c0c0d0]">{p.id}</div>
                          <div className="text-[10px] text-[#4a4a60]">{p.name}</div>
                        </td>
                        {cells.map((r, i) => (
                          <td key={demo.warehouses[i].id} className="px-3 py-2 text-right font-mono">
                            {r ? (
                              <span className={cn(r.afterAvailable < -1e-9 ? 'text-red-400'
                                : r.allocated > 0 ? 'text-emerald-400' : 'text-[#8080a0]')}>
                                {r.available}
                                {r.allocated > 0 && <span className="text-[#4a4a60]"> → {r.afterAvailable}</span>}
                                {r.incomingQty > 0 && <span className="text-blue-400"> +{r.incomingQty}</span>}
                              </span>
                            ) : <span className="text-[#2a2a3a]">—</span>}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-[#c0c0d0]">
                          {totAvail}{Math.abs(totAfter - totAvail) > 1e-9
                            ? <span className="text-[#4a4a60]"> → {totAfter}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                  <WarehouseIcon size={12} className="text-blue-400" />
                  Inventory ledger — every SKU at every site
                </span>
                <Badge variant="muted">{plan.inventory.length} SKU-site rows</Badge>
              </div>
            </CardHeader>
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] border-b border-[#1e1e2e]">
                    <th className="text-left px-4 py-2 font-medium">Site</th>
                    <th className="text-left px-3 py-2 font-medium">SKU</th>
                    <th className="text-right px-3 py-2 font-medium">On hand</th>
                    <th className="text-right px-3 py-2 font-medium">Reserved</th>
                    <th className="text-right px-3 py-2 font-medium">Available</th>
                    <th className="text-right px-3 py-2 font-medium">Inbound</th>
                    <th className="text-right px-3 py-2 font-medium">Allocated</th>
                    <th className="text-right px-3 py-2 font-medium">After</th>
                    <th className="text-right px-4 py-2 font-medium">Flow</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.inventory.map(r => (
                    <tr key={r.warehouseId + '|' + r.productId} className="border-b border-[#1e1e2e]/60">
                      <td className="px-4 py-2 font-mono text-[#c0c0d0]">{r.warehouseId}</td>
                      <td className="px-3 py-2 font-mono text-[#8080a0]">{r.productId}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#c0c0d0]">{r.onHand}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#8080a0]">{r.reserved}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#c0c0d0]">{r.available}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-400">{r.incomingQty || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{r.allocated || '—'}</td>
                      <td className={cn('px-3 py-2 text-right font-mono',
                        r.afterAvailable < -1e-9 ? 'text-red-400' : 'text-[#c0c0d0]')}>
                        {r.afterAvailable}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.overloaded ? <Badge variant="danger">oversubscribed</Badge>
                          : r.available - r.allocated <= 1e-9 ? <Badge variant="warning">ships all</Badge>
                            : <Badge variant="muted">ok</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ===================== DISPATCH & ROUTES ===================== */}
      {tab === 'routes' && plan && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Clock size={12} className="text-blue-400" />Dispatch board — departure waves per site
                </span>
                <span className="text-[10px] font-mono text-[#4a4a60]">
                  trips are packed per wave; a van can only be in one place at a time
                </span>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {plan.dispatchBoard.map(b => (
                <div key={b.warehouseId} className="flex items-center gap-3 flex-wrap">
                  <div className="w-44 flex-shrink-0">
                    <div className="text-xs text-[#c0c0d0]">{b.warehouseName}</div>
                    <div className="text-[10px] font-mono text-[#4a4a60]">{b.warehouseId}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {b.waves.map(w => (
                      <div key={w.departHr}
                        className="rounded border border-[#1e1e2e] bg-[#0d0d16] px-2.5 py-1.5">
                        <div className="text-[11px] font-mono text-blue-400">depart {hLabel(w.departHr)}</div>
                        <div className="text-[10px] text-[#6b6b80]">
                          {w.orders} stops · {w.units} u · {w.trips} trip(s)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {plan.trips.map(t => (
              <Card key={t.tripId}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Truck size={12} className="text-blue-400" />{t.tripId} · {t.warehouseName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="muted">van {t.vehicleId}</Badge>
                      <Badge variant={t.loadPct > 85 ? 'success' : t.loadPct > 40 ? 'info' : 'warning'}>
                        {t.loadPct.toFixed(0)}% load
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { k: 'Depart', v: hLabel(t.departHr) },
                      { k: 'Return', v: hLabel(t.returnHr) },
                      { k: 'Distance', v: t.distanceKm.toFixed(1) + ' km' },
                      { k: 'Cost', v: fmtCurrency(Math.round(t.cost)) },
                    ].map(c => (
                      <div key={c.k}>
                        <div className="text-[10px] font-mono uppercase text-[#3a3a50]">{c.k}</div>
                        <div className="font-mono text-[11px] text-[#c0c0d0]">{c.v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-1 space-y-1">
                    {t.stops.map(s => (
                      <div key={s.seq} className="flex items-center gap-2 text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-blue-500/10 border border-blue-500/30
                          text-blue-400 text-[9px] font-mono flex items-center justify-center flex-shrink-0">
                          {s.seq}
                        </span>
                        <span className="font-mono text-[#c0c0d0]">{s.orderId}</span>
                        <span className="text-[#4a4a60] truncate flex-1">{s.customerName}</span>
                        <span className="font-mono text-[#8080a0]">{s.units}u</span>
                        <span className={cn('font-mono', s.stopLateHr > 0 ? 'text-red-400' : 'text-emerald-400')}>
                          ETA {hLabel(s.etaHr)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ===================== STORAGE PLAN ===================== */}
      {tab === 'storage' && plan && (
        <div className="space-y-5">
          {!plan.storage && (
            <Card><CardBody className="text-xs text-[#6b6b80] flex items-center gap-2">
              <Info size={13} />Turn on “Storage plan” above and re-run to compute
              how much of each SKU every site should hold.
            </CardBody></Card>
          )}
          {plan.storage && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Demand coverage" value={plan.storage.coveragePct.toFixed(1) + '%'}
                  sub={fmt(Math.round(plan.storage.expectedServed)) + ' of ' +
                    fmt(Math.round(plan.storage.expectedDemand)) + ' units'}
                  icon={Target} tone="green" />
                <Kpi label="Cube utilisation" value={plan.storage.cubeUtilPct.toFixed(1) + '%'}
                  sub={plan.storage.volumeUsed.toFixed(1) + ' of ' +
                    plan.storage.volumeCapacity.toFixed(1) + ' m³'}
                  icon={Boxes} tone={plan.storage.cubeUtilPct > 95 ? 'amber' : 'blue'} />
                <Kpi label="Holding cost" value={fmtCurrency(Math.round(plan.storage.holdingCostTotal))}
                  sub="per planning horizon" icon={TrendingUp} tone="violet" />
                <Kpi label="Capacity-limited" value={String(plan.storage.underStocked.length)}
                  sub="SKU-site pairs that do not fit" icon={AlertTriangle}
                  tone={plan.storage.underStocked.length ? 'amber' : 'green'} />
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Layers size={12} className="text-blue-400" />Recommended stock levels
                    </span>
                    <span className="text-[10px] font-mono text-[#4a4a60]">
                      ranked by value density ($/m³) — the LP-optimal fill
                    </span>
                  </div>
                </CardHeader>
                <CardBody className="p-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] border-b border-[#1e1e2e]">
                        <th className="text-left px-4 py-2 font-medium">Site</th>
                        <th className="text-left px-3 py-2 font-medium">SKU</th>
                        <th className="text-right px-3 py-2 font-medium">On hand</th>
                        <th className="text-right px-3 py-2 font-medium">Forecast</th>
                        <th className="text-right px-3 py-2 font-medium">Recommended</th>
                        <th className="text-right px-3 py-2 font-medium">Δ</th>
                        <th className="text-right px-3 py-2 font-medium">Reorder at</th>
                        <th className="text-right px-3 py-2 font-medium">$/m³</th>
                        <th className="text-left px-4 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.storage.levels.map(l => (
                        <tr key={l.warehouseId + '|' + l.productId} className="border-b border-[#1e1e2e]/60">
                          <td className="px-4 py-2 font-mono text-[#c0c0d0]">{l.warehouseId}</td>
                          <td className="px-3 py-2 font-mono text-[#8080a0]">{l.productId}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#c0c0d0]">{l.onHand}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#8080a0]">{l.expectedDemand}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#c0c0d0]">{Math.round(l.recommended)}</td>
                          <td className={cn('px-3 py-2 text-right font-mono',
                            l.delta > 0 ? 'text-blue-400' : l.delta < 0 ? 'text-amber-400' : 'text-[#4a4a60]')}>
                            {l.delta > 0 ? '+' : ''}{Math.round(l.delta)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[#8080a0]">
                            {Math.round(l.reorderPoint)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[#8080a0]">
                            {l.valueDensity >= 1e6 ? (l.valueDensity / 1e6).toFixed(1) + 'M'
                              : l.valueDensity >= 1e3 ? (l.valueDensity / 1e3).toFixed(0) + 'k'
                                : Math.round(l.valueDensity)}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={ACTION_VARIANT[l.action]}>{ACTION_LABEL[l.action]}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
                <CardBody className="border-t border-[#1e1e2e] text-[11px] text-[#6b6b80]">
                  {plan.storage.note}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {/* REBALANCE */}
      {tab === 'rebalance' && plan && (
        <div className="space-y-5">
          {!plan.rebalance && (
            <Card><CardBody className="text-xs text-[#6b6b80] flex items-center gap-2">
              <Info size={13} />Turn on “Rebalance” above to see which stock should move between sites.
            </CardBody></Card>
          )}
          {plan.rebalance && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Transfers" value={String(plan.rebalance.moves.length)}
                  sub={Math.round(plan.rebalance.movedUnits) + ' units to move'} icon={Repeat} tone="blue" />
                <Kpi label="Transfer cost" value={fmtCurrency(Math.round(plan.rebalance.totalCost))}
                  sub={'$' + (plan.rebalance.stockoutPenaltyPerUnit ?? 25) + '/unit stockout avoided'}
                  icon={Truck} tone="violet" />
                <Kpi label="Net benefit" value={fmtCurrency(Math.round(plan.rebalance.benefit ?? 0))}
                  sub="vs letting the stock sit" icon={TrendingUp}
                  tone={(plan.rebalance.benefit ?? 0) >= 0 ? 'green' : 'red'} />
                <Kpi label="Still unmet" value={String(Math.round(plan.rebalance.unmetDeficit))}
                  sub="units no site can cover" icon={AlertTriangle}
                  tone={plan.rebalance.unmetDeficit > 0 ? 'amber' : 'green'} />
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Repeat size={12} className="text-blue-400" />Suggested stock transfers
                    </span>
                    <Button variant="secondary" size="sm" loading={running}
                      disabled={!plan.rebalance.moves.length} onClick={applyTransfers}>
                      <Repeat size={12} />Apply transfers
                    </Button>
                  </div>
                </CardHeader>
                <CardBody className="p-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase tracking-widest text-[#3a3a50] border-b border-[#1e1e2e]">
                        <th className="text-left px-4 py-2 font-medium">SKU</th>
                        <th className="text-left px-3 py-2 font-medium">From</th>
                        <th className="text-left px-3 py-2 font-medium">To</th>
                        <th className="text-right px-3 py-2 font-medium">Units</th>
                        <th className="text-right px-3 py-2 font-medium">Distance</th>
                        <th className="text-right px-4 py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rebalance.moves.map((m, i) => (
                        <tr key={i} className="border-b border-[#1e1e2e]/60">
                          <td className="px-4 py-2 font-mono text-[#c0c0d0]">{m.productId}</td>
                          <td className="px-3 py-2 font-mono text-[#8080a0]">{m.from}</td>
                          <td className="px-3 py-2 font-mono text-emerald-400">{m.to}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#c0c0d0]">{Math.round(m.qty)}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#8080a0]">
                            {m.distKm.toFixed(1)} km
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[#c0c0d0]">
                            {fmtCurrency(Math.round(m.cost))}
                          </td>
                        </tr>
                      ))}
                      {!plan.rebalance.moves.length && (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 text-center text-[#4a4a60]">
                            No transfer is worth a trip right now.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardBody>
                <CardBody className="border-t border-[#1e1e2e] text-[11px] text-[#6b6b80] space-y-1">
                  <div>{plan.rebalance.algorithmUsed}</div>
                  {plan.rebalance.applied != null && (
                    <div className="text-emerald-400">
                      Applied {plan.rebalance.applied} transfer(s) to the inventory ledger.
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {/* narrative */}
      {plan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-medium text-white flex items-center gap-1.5">
                <Info size={12} className="text-blue-400" />What the planner did
              </span>
              <span className="text-[10px] font-mono text-[#4a4a60]">{plan.algorithmUsed}</span>
            </div>
          </CardHeader>
          <CardBody className="space-y-1.5">
            {plan.explain.map((line, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-[#8080a0]">
                <span className="font-mono text-[#3a3a50] flex-shrink-0">{i + 1}.</span>{line}
              </div>
            ))}
            <div className="pt-1 text-[11px] text-[#4a4a60]">{plan.note}</div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
