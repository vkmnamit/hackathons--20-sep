// ProposedSiteMap — real-world Leaflet map showing the exact spot where a new
// warehouse should open: demand areas (blue), open hubs (green), and proposed
// sites (violet stars) with lat/lng popups. Uses the shared grid projection.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gridToLatLng } from '@/lib/geo';

export interface MapProposal {
  id: string; x: number; y: number; lat?: number; lng?: number;
  capacity?: number; note?: string; name?: string;
}

export function ProposedSiteMap({
  nb, wh, openIds, proposals, height = 360,
}: {
  nb: { id: string; x: number; y: number; demand?: number; name?: string }[];
  wh: { id: string; x: number; y: number; name?: string; capacity?: number }[];
  openIds?: string[];
  proposals?: MapProposal[];
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true, attributionControl: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;

    const timer = setTimeout(() => map.invalidateSize(), 150);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; }
    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer;
    const pts: L.LatLngExpression[] = [];

    (nb || []).forEach(n => {
      const ll = gridToLatLng(n, nb);
      pts.push(ll);
      L.circleMarker(ll, {
        radius: n.demand ? 4 + Math.min(6, n.demand / 60) : 4,
        color: '#60a5fa', weight: 1, fillColor: '#1e3a5f', fillOpacity: 0.7,
      }).bindTooltip(`${n.name || n.id} · ${n.demand ?? '—'}/day`).addTo(layer);
    });

    const open = new Set(openIds || []);
    (wh || []).forEach(w => {
      if (openIds && !open.has(w.id)) return;
      const ll = gridToLatLng(w, nb);
      pts.push(ll);
      L.circleMarker(ll, {
        radius: 8, color: '#4ade80', weight: 2, fillColor: '#22c55e', fillOpacity: 0.35,
      }).bindTooltip(`${w.name || w.id} · open hub${w.capacity ? ' · cap ' + w.capacity : ''}`).addTo(layer);
    });

    (proposals || []).forEach(p => {
      const ll = gridToLatLng(p, nb);
      pts.push(ll);
      const icon = L.divIcon({
        className: '',
        html: `<div style="transform:rotate(45deg);width:18px;height:18px;background:#8b5cf6;border:2px solid #c4b5fd;box-shadow:0 0 12px rgba(139,92,246,.8);border-radius:3px;"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      L.marker(ll, { icon })
        .bindPopup(
          `<div style="font-family:monospace;font-size:12px">` +
          `<b style="color:#8b5cf6">${p.id} · proposed site</b><br/>` +
          `lat, lng: <b>${(+ll[0]).toFixed(5)}, ${(+ll[1]).toFixed(5)}</b><br/>` +
          `${p.capacity ? 'capacity: ' + p.capacity + '<br/>' : ''}` +
          `${p.note ? '<span style="color:#666">' + p.note + '</span>' : ''}</div>`
        ).addTo(layer);
    });

    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    }
  }, [nb, wh, openIds, proposals]);

  return (
    <div className="rounded-lg border border-[#1e1e2e] overflow-hidden">
      <div ref={divRef} style={{ height }} className="w-full bg-[#0d0f1a]" />
    </div>
  );
}
