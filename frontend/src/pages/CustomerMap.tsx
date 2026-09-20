import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn, fmt } from '@/lib/utils';
import { MapPin } from 'lucide-react';
import { dateLabel, hLabel } from './Fulfillment';
import type { Assignment, FulfillDemo, FulfillOrderRow, FulfillPlan } from '@/lib/api';

const capOf = (w: FulfillDemo['warehouses'][number]) => {
  const t = w.throughputPerHr ?? w.capacity ?? 0;
  return fmt(t >= 1e9 ? (w.capacity ?? 0) : t);
};

export type Dock = { w: FulfillDemo['warehouses'][number]; a: Assignment | undefined; km: number; eta: number; optimal: boolean };

export function dockList(plan: FulfillPlan, demo: FulfillDemo, order: FulfillOrderRow, assignments: Assignment[]): Dock[] {
  const roadKm = (wx: number, wy: number) => {
    let dx = order.x - wx;
    let dy = order.y - wy;
    const isGeoLatX = (order.x >= 6 && order.x <= 40) || (wx >= 6 && wx <= 40);
    const isGeoLngY = (order.y >= 60 && order.y <= 100) || (wy >= 60 && wy <= 100);
    const isGeoLatY = (order.y >= 6 && order.y <= 40) || (wy >= 6 && wy <= 40);
    const isGeoLngX = (order.x >= 60 && order.x <= 100) || (wx >= 60 && wx <= 100);

    if (isGeoLatX && isGeoLngY) {
      dx = (order.x - wx) * 111.0;
      dy = (order.y - wy) * 108.2;
    } else if (isGeoLatY && isGeoLngX) {
      dx = (order.x - wx) * 108.2;
      dy = (order.y - wy) * 111.0;
    }
    return Math.hypot(dx, dy) * (plan.params.roadFactor ?? 1.35);
  };
  const roadHr = (km: number) => (plan.params.kmPerHour ? km / plan.params.kmPerHour : 0);
  return demo.warehouses.map(w => {
    const a = assignments.find(x => x.warehouseId === w.id);
    const km = a ? a.distKm : roadKm(w.x, w.y);
    const eta = a ? a.etaHr : roadHr(km);
    return { w, a, km, eta, optimal: !!a && a === assignments[0] };
  }).sort((p, q) => p.km - q.km);
}

const KNOWN_BENGALURU_COORDS: Record<string, [number, number]> = {
  'whitefield': [12.9698, 77.7499],
  'whitefield dc': [12.9750, 77.7400],
  'peenya': [13.0285, 77.5197],
  'peenya hub': [13.0300, 77.5250],
  'hosur': [12.8452, 77.6602],
  'hosur road depot': [12.8452, 77.6602],
  'hosur road': [12.8452, 77.6602],
  'electronic city': [12.8452, 77.6602],
  'hebbal': [13.0358, 77.5970],
  'hebbal cross-dock': [13.0358, 77.5970],
  'basavanagudi': [12.9410, 77.5750],
  'basavanagudi hub': [12.9420, 77.5700],
  'jayanagar': [12.9250, 77.5830],
  'jayanagar dock': [12.9250, 77.5840],
  'gandhi bazaar': [12.9340, 77.5712],
  'gandhi bazaar depot': [12.9360, 77.5720],
  'dvg road': [12.9290, 77.5690],
  'dvg road point': [12.9270, 77.5680],
  'south bangalore dc': [12.9150, 77.5760],
  '9th block node': [12.9200, 77.5850],
  'koramangala': [12.9352, 77.6245],
  'indiranagar': [12.9784, 77.6408],
  'hsr layout': [12.9121, 77.6446],
  'marathahalli': [12.9591, 77.6974],
  'btm layout': [12.9165, 77.6101],
  'rajajinagar': [12.9982, 77.5530],
  'malleshwaram': [13.0031, 77.5643],
  'yelahanka': [13.1007, 77.5963],
  'banashankari': [12.9255, 77.5468],
};

const ll = (p: { x: number; y: number; lat?: number; lng?: number; name?: string; id?: string }): L.LatLngExpression => {
  if (p.lat != null && p.lng != null && p.lat >= 8 && p.lat <= 36 && p.lng >= 68 && p.lng <= 98) {
    return [p.lat, p.lng];
  }
  const nameKey = (p.name || '').toLowerCase().trim();
  if (KNOWN_BENGALURU_COORDS[nameKey]) {
    return KNOWN_BENGALURU_COORDS[nameKey];
  }
  for (const [key, coords] of Object.entries(KNOWN_BENGALURU_COORDS)) {
    if (nameKey.includes(key) || (nameKey.length > 3 && key.includes(nameKey))) {
      return coords;
    }
  }
  if (p.x >= 12.0 && p.x <= 14.0 && p.y >= 77.0 && p.y <= 78.5) {
    return [p.x, p.y];
  }
  if (p.y >= 12.0 && p.y <= 14.0 && p.x >= 77.0 && p.x <= 78.5) {
    return [p.y, p.x];
  }
  const clampedX = Math.max(0, Math.min(100, p.x));
  const clampedY = Math.max(0, Math.min(100, p.y));
  return [12.82 + (clampedY / 100) * 0.28, 77.48 + (clampedX / 100) * 0.28];
};

const dot = (color: string, size = 12, border = '#fff') => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${border};box-shadow:0 0 0 3px rgba(0,0,0,.35)"></div>`,
  iconSize: [size, size], iconAnchor: [size / 2, size / 2],
});
const siteIcon = (label: string, optimal: boolean) => new L.DivIcon({
  className: '',
  html: `<div style="background:${optimal ? '#22c55e' : '#16a34a99'};color:#fff;font:700 10px monospace;min-width:26px;height:26px;line-height:22px;text-align:center;border-radius:6px;border:2px solid ${optimal ? '#fff' : '#ffffff55'};box-shadow:0 2px 8px rgba(0,0,0,.5);padding:0 4px">${label}</div>`,
  iconSize: [30, 26], iconAnchor: [15, 13],
});

/** Customer-centred LIVE map (delivery-app style): ONE customer, lanes from
 *  EVERY DB warehouse, each tagged km + time + ETA date, plus a full flow
 *  timeline: warehouse -> dispatch date -> transit -> customer date + WHY. */
export function CustomerMap({ plan, demo, order, assignments, areaOf, onClear }: {
  plan: FulfillPlan; demo: FulfillDemo; order: FulfillOrderRow;
  assignments: Assignment[]; areaOf: (n: string) => string; onClear: () => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const docks = dockList(plan, demo, order, assignments);
  const addr = areaOf(order.customerName) + ' \u00b7 blk ' + (1 + Math.floor(order.x % 9)) +
    ', st ' + (1 + Math.floor(order.y % 12)) + ' \u2014 grid ' +
    order.x.toFixed(1) + 'E / ' + order.y.toFixed(1) + 'N';

  useEffect(() => {
    if (!divRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const m = L.map(divRef.current, { zoomControl: true }).setView(ll(order), 12);
    mapRef.current = m;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri &copy; OpenStreetMap contributors', maxZoom: 16,
    }).addTo(m);
    const bounds: L.LatLngExpression[] = [ll(order)];
    docks.forEach(({ w, a, km, eta, optimal }) => {
      const bad = a && (a.atRisk || a.lateHr > 0 || a.split);
      const color = optimal ? '#22c55e' : bad ? '#ef4444' : '#3b82f6';
      const line = L.polyline([ll(w), ll(order)], {
        color, weight: optimal ? 4 : 2.5, opacity: optimal ? 1 : 0.55,
        dashArray: optimal ? undefined : '8 6',
      }).addTo(m);
      line.bindTooltip(
        `<b>${w.id} \u2192 ${order.customerName}</b><br/>${km.toFixed(1)} km \u00b7 travel ${hLabel(plan.params.kmPerHour ? km / plan.params.kmPerHour : 0)}<br/>ETA ${dateLabel(eta)}${optimal ? ' \u2605 OPTIMAL' : ''}`,
        { sticky: true }
      );
      line.bindPopup(
        `<b>${w.name || w.id} \u2192 ${order.customerName}</b><br/>` +
        `Distance: <b>${km.toFixed(1)} km</b><br/>` +
        `Expected delivery: <b>${dateLabel(eta)}</b><br/>` +
        (a ? `Dispatch: ${dateLabel(a.departHr)} (${a.wavePolicy.replace(/-/g, ' ')})<br/>Trip: ${a.tripId || '\u2014'} / van ${a.vehicleId || '\u2014'}${a.stopSeq ? ' \u00b7 stop ' + a.stopSeq : ''}<br/>Why: ${a.candidates.length} docks scored, cheapest feasible dock` : 'No stock for this order at this dock')
      );
      bounds.push(ll(w));
      L.marker(ll(w), { icon: siteIcon(w.id.replace(/^W/, ''), optimal) }).addTo(m)
        .bindPopup(`<b>${w.name || w.id}</b><br/>Capacity: ${capOf(w)}<br/>${optimal ? '\u2605 OPTIMAL dock for this order' : km.toFixed(1) + ' km from customer'}`);
    });
    L.marker(ll(order), { icon: dot('#60a5fa', 16) }).addTo(m)
      .bindPopup(`<b>${order.customerName}</b><br/>${addr}<br/>Due ${dateLabel(order.dueHr)}`)
      .openPopup();
    m.fitBounds(L.latLngBounds(bounds).pad(0.25));

    const timer = setTimeout(() => m.invalidateSize(), 150);
    const onResize = () => m.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.orderId, plan.runtimeMs, demo.warehouses.length]);

  return (
    <>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-blue-500/25 bg-blue-500/5 px-3 py-2">
        <MapPin size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white font-medium truncate">
            {order.customerName} <span className="text-[#4a4a60] font-mono">\u00b7 {order.customerId} \u00b7 {order.orderId}</span>
          </div>
          <div className="text-[11px] text-[#8080a0] truncate">
            User address: {addr} \u00b7 due {dateLabel(order.dueHr)} \u00b7 {order.priority}
          </div>
        </div>
        <button onClick={onClear}
          className="text-[10px] font-mono text-[#8080a0] hover:text-white border border-[#1e1e2e] rounded px-1.5 py-0.5 flex-shrink-0">
          show all \u2715
        </button>
      </div>
      <div ref={divRef} className="w-full h-[420px] rounded-md border border-[#1e1e2e] z-0" />
      <div className="mt-1 text-[10px] font-mono text-[#3a3a50]">Live map \u00b7 {docks.length} DB warehouses \u00b7 click any lane or marker for dates \u00b7 green = optimal</div>
    </>
  );
}

export function FlowTimeline({ assignments }: { assignments: Assignment[] }) {
  const a = assignments[0];
  if (!a) return null;
  const steps = [
    { t: `At ${a.warehouseName} (${a.warehouseId})`, d: dateLabel(a.departHr), s: `${a.stockAtPick.onHand} on hand \u00b7 ${a.stockAtPick.reserved} reserved \u2192 ${a.stockAtPick.available} available${a.stockAtPick.incomingByDue > 0 ? ` \u00b7 +${a.stockAtPick.incomingByDue} inbound by due` : ''}` },
    { t: `Dispatch ${a.wavePolicy.replace(/-/g, ' ')}`, d: dateLabel(a.departHr), s: `pick cutoff ${dateLabel(a.cutoffHr)} \u00b7 ${a.distKm.toFixed(1)} km road` },
    { t: `In transit ${a.tripId || ''} / van ${a.vehicleId || '\u2014'}${a.stopSeq ? ` \u00b7 stop ${a.stopSeq}` : ''}`, d: dateLabel(a.departHr) + ' \u2192 ' + dateLabel(a.etaHr), s: `${a.transitHr.toFixed(2)}h drive` },
    { t: `Delivered to ${a.customerName}`, d: dateLabel(a.etaHr), s: a.lateHr > 0 ? `LATE +${a.lateHr.toFixed(1)}h vs due ${dateLabel(a.dueHr)}` : `on time \u00b7 due ${dateLabel(a.dueHr)}` },
  ];
  return (
    <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
      <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300 mb-2">Full flow \u2014 why this dock on these dates</div>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-col items-center pt-0.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-[10px] font-mono text-emerald-300">{i + 1}</div>
            {i < steps.length - 1 && <div className="w-px flex-1 min-h-[12px] bg-emerald-500/25" />}
          </div>
          <div className="pb-2 min-w-0">
            <div className="text-[11px] text-white">{s.t} <span className="font-mono text-emerald-300">{s.d}</span></div>
            <div className="text-[11px] text-[#6b6b80]">{s.s}</div>
          </div>
        </div>
      ))}
      <div className="text-[11px] text-[#6b6b80] pt-1 border-t border-emerald-500/15">Why: {a.candidates.length} docks scored on landed cost + ETA; {a.warehouseName} was the cheapest feasible dock with stock ({a.stockAtPick.available} avail) on {dateLabel(a.departHr)}.</div>
    </div>
  );
}

export function DockTable({ plan, demo, order, assignments }: {
  plan: FulfillPlan; demo: FulfillDemo; order: FulfillOrderRow; assignments: Assignment[];
}) {
  const roadHr = (km: number) => (plan.params.kmPerHour ? km / plan.params.kmPerHour : 0);
  const docks = dockList(plan, demo, order, assignments);
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-[#1e1e2e]">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[10px] font-mono uppercase text-[#3a3a50] border-b border-[#1e1e2e] bg-[#0d0d16]">
            <th className="text-left px-3 py-1.5 font-medium">Warehouse \u2192 user</th>
            <th className="text-right px-2 py-1.5 font-medium">Stock</th>
            <th className="text-right px-2 py-1.5 font-medium">Capacity</th>
            <th className="text-right px-2 py-1.5 font-medium">Km</th>
            <th className="text-right px-2 py-1.5 font-medium">Travel time</th>
            <th className="text-right px-2 py-1.5 font-medium">Expected delivery</th>
            <th className="text-left px-3 py-1.5 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {docks.map(({ w, a, km, eta, optimal }) => (
            <tr key={w.id} className={cn('border-t border-[#1e1e2e]/60', optimal && 'bg-emerald-500/5')}>
              <td className="px-3 py-1.5 font-mono text-[#c0c0d0]">
                {optimal ? '\u25b8 ' : ''}{w.id} <span className="text-[#4a4a60]">\u2192 {order.customerName}</span>
                {optimal && <span className="ml-1 text-[9px] text-emerald-400 border border-emerald-500/30 rounded px-1">OPTIMAL</span>}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#c0c0d0]">{a ? `${a.stockAtPick.available} avail` : '\u2014'}</td>
              <td className="px-2 py-1.5 text-right font-mono text-[#8080a0]">{capOf(w)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-[#c0c0d0]">{km.toFixed(1)} km</td>
              <td className="px-2 py-1.5 text-right font-mono text-[#8080a0]">{hLabel(roadHr(km))}</td>
              <td className={cn('px-2 py-1.5 text-right font-mono', a && a.lateHr > 0 ? 'text-red-400' : 'text-emerald-400')}>
                {dateLabel(eta)}{a ? ' \u00b7 dep ' + dateLabel(a.departHr) : ''}
              </td>
              <td className="px-3 py-1.5 text-[#6b6b80]">
                {a ? (a.lateHr > 0 ? 'late +' + a.lateHr.toFixed(1) + 'h'
                  : a.wavePolicy.replace(/-/g, ' ') + (a.tripId ? ' \u00b7 ' + a.tripId : ''))
                  : 'no stock for this order'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
