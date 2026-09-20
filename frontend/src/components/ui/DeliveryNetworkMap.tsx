// DeliveryNetworkMap — real-world Leaflet map of the whole delivery plan.
// Draws every dispatch trip as a dock -> stops -> dock route loop (colour per
// trip), with hub markers, drop pins carrying ETA/units, a click-to-inspect
// callback and trip chips for highlighting one van at a time.
// Coordinates come from the shared grid projection, so it works with the
// Bengaluru seed AND any uploaded dataset.
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gridToLatLng } from '@/lib/geo';

const TRIP_COLORS = [
  '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa',
  '#22d3ee', '#fb923c', '#4ade80', '#f87171', '#818cf8',
];

export interface MapStop { seq: number; orderId: string; customerName: string; x: number; y: number; etaHr: number; dueHr: number; units: number; stopLateHr: number; }
export interface MapTrip { tripId: string; warehouseId: string; warehouseName: string; vehicleId?: string; departHr: number; stops: MapStop[]; distanceKm: number; loadPct: number; }

export function DeliveryNetworkMap({
  wh, trips, selectedTripId, onSelectTrip, onSelectOrder, height = 420,
}: {
  wh: { id: string; x: number; y: number; name?: string; lat?: number; lng?: number }[];
  trips: MapTrip[];
  selectedTripId?: string | null;
  onSelectTrip?: (tripId: string | null) => void;
  onSelectOrder?: (orderId: string) => void;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // stable-ish dependency: only the geometric shape of the plan
  const sig = useMemo(() => JSON.stringify({
    w: wh.map(w => [w.id, w.x, w.y]),
    t: trips.map(t => [t.tripId, t.stops.map(s => [s.orderId, s.x, s.y])]),
  }), [wh, trips]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true, attributionControl: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; }
    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer;
    const pts: L.LatLngExpression[] = [];
    const tripColor = new Map<string, string>();

    const hubAt = new Map(wh.map(w => [w.id, gridToLatLng(w, wh)]));

    // 1) hub markers
    wh.forEach((w, i) => {
      const ll = gridToLatLng(w, wh);
      pts.push(ll);
      L.circleMarker(ll, {
        radius: 9, color: '#4ade80', weight: 2, fillColor: '#22c55e', fillOpacity: 0.45,
      }).bindTooltip(`${w.name || w.id} · dispatch hub`).addTo(layer);
      void i;
    });

    // 2) routes: dock -> stops (in stop order) -> dock
    trips.forEach((t, i) => {
      const color = TRIP_COLORS[i % TRIP_COLORS.length];
      tripColor.set(t.tripId, color);
      const dim = selectedTripId != null && selectedTripId !== t.tripId;
      const hub = hubAt.get(t.warehouseId);
      const path: L.LatLngExpression[] = [];
      if (hub) path.push(hub);
      (t.stops || []).forEach(s => {
        const ll = gridToLatLng(s as any, wh);
        path.push(ll);
        pts.push(ll);
      });
      if (hub && t.stops?.length) path.push(hub);

      if (path.length > 1) {
        const loop = L.polyline(path, {
          color, weight: dim ? 1.5 : 3, opacity: dim ? 0.25 : 0.85,
          dashArray: dim ? '4 6' : undefined,
        }).addTo(layer);
        loop.bindTooltip(`${t.tripId} · ${t.warehouseName} · ${t.distanceKm.toFixed(1)} km · ${t.loadPct.toFixed(0)}% load`);
        if (onSelectTrip) loop.on('click', () => onSelectTrip(t.tripId));
      }

      // stop pins
      (t.stops || []).forEach(s => {
        const ll = gridToLatLng(s as any, wh);
        const late = s.stopLateHr > 0;
        const pin = L.circleMarker(ll, {
          radius: 5, color: late ? '#ef4444' : '#ffffff', weight: 1.5,
          fillColor: color, fillOpacity: dim ? 0.35 : 0.95,
        }).addTo(layer);
        pin.bindTooltip(`${s.orderId} · ${s.customerName}`);
        pin.bindPopup(
          `<div style="font-family:monospace;font-size:12px;line-height:1.5">` +
          `<b style="color:${color}">${s.orderId}</b> · ${s.customerName}<br/>` +
          `trip <b>${t.tripId}</b> · stop #${s.seq} · van ${t.vehicleId || '—'}<br/>` +
          `${s.units} units<br/>` +
          `ETA <b>${s.etaHr.toFixed(1)}h</b> · due ${s.dueHr.toFixed(1)}h · ` +
          (late ? `<span style="color:#ef4444">late +${s.stopLateHr.toFixed(1)}h</span>` : `<span style="color:#22c55e">on time</span>`) +
          `</div>`
        );
        if (onSelectOrder) pin.on('click', () => onSelectOrder(s.orderId));
      });
    });

    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-lg border border-[#1e1e2e] overflow-hidden">
      <div ref={divRef} style={{ height }} className="w-full bg-[#0d0f1a]" />
    </div>
  );
}
