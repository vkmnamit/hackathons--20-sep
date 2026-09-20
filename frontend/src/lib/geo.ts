// geo.ts — shared projection between the optimizer's coordinate plane and
// real-world lat/lng. Handles both conventions used across the platform:
//   * the Bengaluru seed / warehouse registry stores lat/lng directly in x/y
//     (x = latitude, y = longitude)
//   * synthetic datasets use a normalized 0-100 grid (y = north = latitude)
export interface GridPoint { x: number; y: number; lat?: number; lng?: number; name?: string; id?: string; }

const isLat = (v: number) => v >= 8 && v <= 36;
const isLng = (v: number) => v >= 68 && v <= 98;

/** True when points already carry real-world lat/lng in x/y. */
export function looksLikeLatLng(pts: GridPoint[]): boolean {
  const clean = pts.filter(p => p && isFinite(p.x) && isFinite(p.y));
  if (!clean.length) return false;
  const hits = clean.filter(p => isLat(p.x) && isLng(p.y)).length;
  return hits / clean.length >= 0.8;
}

export function gridToLatLng(p: GridPoint, dataset?: GridPoint[]): [number, number] {
  if (p.lat != null && p.lng != null && isLat(p.lat) && isLng(p.lng)) {
    return [p.lat, p.lng];
  }
  // Dataset is already geographic (e.g. the Bengaluru seed) -> x/y ARE lat/lng.
  if ((dataset && looksLikeLatLng(dataset)) || (isLat(p.x) && isLng(p.y))) {
    return [+p.x.toFixed(5), +p.y.toFixed(5)];
  }
  // Normalized grid -> Bengaluru-centred projection.
  const scale = Math.max(Math.abs(p.x), Math.abs(p.y)) <= 1.5 ? 100 : 1;
  const clampedX = Math.max(0, Math.min(100, p.x * scale));
  const clampedY = Math.max(0, Math.min(100, p.y * scale));
  const lat = +(12.82 + (clampedY / 100) * 0.28).toFixed(5);
  const lng = +(77.48 + (clampedX / 100) * 0.28).toFixed(5);
  return [lat, lng];
}

// one-way: grid coords -> {lat, lng} object (for API payloads / popups)
export function gridToLatLngObj(p: GridPoint): { lat: number; lng: number } {
  const [lat, lng] = gridToLatLng(p);
  return { lat, lng };
}
