import { useEffect, useRef, useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency, fmtPct } from '@/lib/utils';
import { Plus, Trash2, ZoomIn, ZoomOut, Maximize2, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, type OptResult, type Candidate, type OptBody } from '@/lib/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons in bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// TS helper: leaflet typings are stricter than runtime; CircleMarker is compatible with Marker for our purposes.
function asMarker(m: L.CircleMarker): L.Marker { return m as unknown as L.Marker; }
const BLUE_MARKER = new L.DivIcon({
  className: '',
  html: '<div style="background:#3b82f6;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px rgba(59,130,246,0.3)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const GREEN_MARKER = new L.DivIcon({
  className: '',
  html: '<div style="background:#22c55e;width:14px;height:14px;border-radius:2px;border:2px solid #fff;box-shadow:0 0 0 2px rgba(34,197,94,0.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const RED_MARKER = new L.DivIcon({
  className: '',
  html: '<div style="background:#ef4444;width:10px;height:10px;border-radius:50%;border:2px solid #fff"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const MAP_LAYERS = {
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; OpenStreetMap contributors',
    maxZoom: 16,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
};

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

// Smart coordinate converter: handles real GPS, known area names, and normalized grid
const toBengaluruLatLng = (p: { x: number; y: number; lat?: number; lng?: number; name?: string; id?: string }): L.LatLngExpression => {
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
  const lat = 12.82 + (clampedY / 100) * 0.28;
  const lng = 77.48 + (clampedX / 100) * 0.28;
  return [lat, lng];
};

interface PopupNeighborhood {
  lat?: number; lng?: number; [k: string]: any;
}

export function MapExplorer() {
  const { nb, wh, loaded } = useStore();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefLeaflet = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.CircleMarker | L.Marker>>({});
  const linesRef = useRef<L.LayerGroup | null>(null);
  const [ran, setRan] = useState(false);
  const [result, setResult] = useState<OptResult | null>(null);
  const [zoom, setZoom] = useState(13);

  const [mapStyle, setMapStyle] = useState<'dark' | 'osm' | 'satellite'>('dark');
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const latLng = toBengaluruLatLng;

  useEffect(() => {
    if (!mapRef.current || mapRefLeaflet.current) return;
    const m = L.map(mapRef.current, {
      center: [12.94, 77.58],
      zoom: 12,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const initialLayer = MAP_LAYERS[mapStyle];
    tileLayerRef.current = L.tileLayer(initialLayer.url, initialLayer).addTo(m);
    linesRef.current = L.layerGroup().addTo(m);
    mapRefLeaflet.current = m;

    const onMove = () => setZoom(m.getZoom());
    m.on('zoomend', onMove);
    return () => {
      m.off('zoomend', onMove);
      m.remove();
      mapRefLeaflet.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapRefLeaflet.current;
    if (!m) return;
    if (tileLayerRef.current) {
      m.removeLayer(tileLayerRef.current);
    }
    const layer = MAP_LAYERS[mapStyle];
    tileLayerRef.current = L.tileLayer(layer.url, layer).addTo(m);
  }, [mapStyle]);

  useEffect(() => {
    const m = mapRefLeaflet.current;
    if (!m) return;
    // clear old
    Object.values(markersRef.current).forEach(mk => mk.remove());
    markersRef.current = {};
    linesRef.current?.clearLayers();

    // neighborhoods
    nb.forEach(n => {
      const mk = L.circleMarker(latLng(n), {
        radius: 5 + (n.demand / 200) * 8,
        color: '#3b82f6',
        fillColor: result?.unserved?.includes(n.id) ? '#ef4444' : '#1e3a5f',
        fillOpacity: 0.85,
        weight: result?.unserved?.includes(n.id) ? 2 : 1,
      }).addTo(m);
      (mk as any)._wloData = n;
      mk.bindTooltip(`<strong>${n.name}</strong><br/>Demand: ${n.demand}<br/>ID: ${n.id}`, {
        direction: 'top', className: 'wlo-tooltip',
      });
      mk.on('click', () => { mk.openPopup(); });
      markersRef.current[n.id] = mk;
    });

    // warehouses
    wh.forEach(w => {
      const isOpen = result?.openWarehouses.includes(w.id);
      const mk = L.marker(latLng(w), {
        icon: isOpen ? GREEN_MARKER : BLUE_MARKER,
        draggable: false,
      }).addTo(m);
      (mk as any)._wloData = w;
      const u = result?.utilization?.find(x => x.id === w.id);
      mk.bindTooltip(`<strong>${w.name}</strong><br/>ID: ${w.id}<br/>Cap: ${w.capacity}<br/>$${w.fixedCost}`, {
        direction: 'top', className: 'wlo-tooltip',
      });
      if (isOpen && u) {
        mk.bindPopup(`<b>${w.name}</b><br/>Utilization: ${fmtPct(u.u)}<br/>Load: ${u.u * w.capacity} / ${w.capacity}`);
      }
      markersRef.current[w.id] = mk;
    });

    // assignment lines
    if (result) {
      const optId = new Set(result.openWarehouses);
      Object.entries(result.assignments).forEach(([nid, wid]) => {
        const n = nb.find(x => x.id === nid);
        const w = wh.find(x => x.id === wid);
        if (!n || !w || !optId.has(wid)) return;
        const line = L.polyline([latLng(n), latLng(w)], {
          color: '#3b82f6',
          weight: 1,
          opacity: 0.12,
        }).addTo(linesRef.current!);
      });
    }

    // fit bounds
    if (nb.length) {
      const pts = nb.map(n => latLng(n));
      const bounds = L.latLngBounds(pts);
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [nb, wh, result]);

  const run = async () => {
    if (!nb.length) return;
    setRan(false);
    const out = await api.optimize({
      neighborhoods: nb as any,
      candidates: wh as any,
      // Exact search is not practical for 300/500-location state-wide plans.
      params: { algorithm: 'localsearch', maxWarehouses: 12 },
      explain: true,
    });
    setResult(out); setRan(true);
  };

  return (
    <div className="map-explorer-shell page-enter h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e] bg-[#0d0d16] flex-shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-white flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Map Explorer
          </h1>
          <p className="text-[10px] text-[#4a4a60]">Bengaluru, India · city-wide synthetic demand · {nb.length} areas · {wh.length} candidates</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#111118] border border-[#1e1e2e] rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setMapStyle('dark')}
              className={`px-2 py-1 rounded text-[10px] ${mapStyle === 'dark' ? 'bg-blue-600 text-white font-semibold' : 'text-[#8080a0] hover:text-white'}`}
            >
              Dark
            </button>
            <button
              onClick={() => setMapStyle('osm')}
              className={`px-2 py-1 rounded text-[10px] ${mapStyle === 'osm' ? 'bg-blue-600 text-white font-semibold' : 'text-[#8080a0] hover:text-white'}`}
            >
              Street OSM
            </button>
            <button
              onClick={() => setMapStyle('satellite')}
              className={`px-2 py-1 rounded text-[10px] ${mapStyle === 'satellite' ? 'bg-blue-600 text-white font-semibold' : 'text-[#8080a0] hover:text-white'}`}
            >
              Satellite
            </button>
          </div>
          <Badge variant="muted">{wh.filter(w => result?.openWarehouses.includes(w.id)).length} open · {wh.length} candidates</Badge>
          <Button variant="primary" size="sm" onClick={run}>
            <Plus size={13} />Optimize
          </Button>
          {ran && <Button variant="ghost" size="sm" onClick={() => setResult(prev => ({ ...prev!, openWarehouses: prev!.openWarehouses }))}>
            <Maximize2 size={13} />Fit
          </Button>}
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />

        {/* zoom level */}
        <div className="absolute bottom-left z-10 px-2 py-1 rounded bg-[#111118] border border-[#1e1e2e] text-[10px] font-mono text-[#4a4a60]">
          {Math.round(zoom * 10) / 10}x
        </div>

        {/* legend */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 text-[10px]">
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#111118] border border-[#1e1e2e]">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#1e3a5f', border: '1px solid #3b82f6' }} />
            <span className="text-[#8080a0]">Neighborhood</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#111118] border border-[#1e1e2e]">
            <div className="w-2.5 h-2.5 rounded" style={{ background: '#22c55e' }} />
            <span className="text-[#8080a0]">Open warehouse</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#111118] border border-[#1e1e2e]">
            <div className="w-2.5 h-2.5 rounded" style={{ background: '#3b82f6' }} />
            <span className="text-[#8080a0]">Closed candidate</span>
          </div>
        </div>

        {/* summary */}
        <div className="absolute top-3 right-3 z-10">
          {result ? (
            <Card className="w-52">
              <CardBody className="pt-3">
                <div className="text-xs text-white font-medium mb-2">{result.algorithmUsed}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-[#4a4a60]">Total</span><br/><span className="font-mono text-white">{fmtCurrency(result.totalCost)}</span></div>
                  <div><span className="text-[#4a4a60]">Distance</span><br/><span className="font-mono text-[#c0c0d0]">{result.avgDistance.toFixed(2)} km</span></div>
                  <div><span className="text-[#4a4a60]">Delivery</span><br/><span className="font-mono text-[#c0c0d0]">{fmtCurrency(result.deliveryCost)}</span></div>
                  <div><span className="text-[#4a4a60]">Fixed</span><br/><span className="font-mono text-[#c0c0d0]">{fmtCurrency(result.fixedCost)}</span></div>
                </div>
              </CardBody>
            </Card>
          ) : <div className="px-3 py-1.5 rounded bg-[#111118] border border-[#1e1e2e] text-[10px] text-[#3a3a50]">Run optimize to see results</div>}
        </div>

            {result && result.unserved && result.unserved.length > 0 && (
          <div className="absolute top-14 right-3 z-10 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono">
            {result.unserved.length} unserved: {result.unserved.slice(0,3).join(', ')}{result.unserved.length > 3 ? '...' : ''}
          </div>
        )}
      </div>

      {/* bottom list */}
      <div className="border-t border-[#1e1e2e] bg-[#0d0d16] max-h-32 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2 text-[10px] font-mono text-[#3a3a50] uppercase tracking-widest">
          <span>Assignments ({Object.keys(result?.assignments || {}).length})</span>
          {result?.explanation && <span className="text-blue-400 cursor-pointer hover:underline" onClick={() => alert((result.explanation ?? []).join('\n'))}>Why?</span>}
        </div>
        <div className="px-2 pb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono">
          {Object.entries(result?.assignments || {}).map(([nid, wid]) => {
            const n = nb.find(x => x.id === nid); const w = wh.find(x => x.id === wid);
            return n && w ? <span key={nid} className="text-[#5a5a70]"><span className="text-[#8080a0]">{n.name}</span>→<span className="text-blue-400">{w.name}</span></span> : null;
          })}
        </div>
      </div>
    </div>
  );
}
