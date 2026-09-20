// geo.js — one shared place that turns optimizer coordinates into real-world
// lat/lng. The optimizer works on an abstract plane, but datasets differ:
//   * the Bengaluru seed / warehouse registry stores lat/lng directly in x/y
//     (x = latitude, y = longitude)
//   * synthetic grids use a normalized 0-100 plane (y = north = latitude)
// Inspecting the ACTUAL data lets us pin every proposal to its true spot on the
// map instead of guessing a projection. Zero npm deps.

function isLat(v){ return isFinite(v) && v >= 8 && v <= 36; }
function isLng(v){ return isFinite(v) && v >= 68 && v <= 98; }

// true when every (or nearly every) point already is a lat/lng pair
function looksLikeLatLng(pts){
  const clean = (pts || []).filter(function (p) {
    return p && isFinite(+p.x) && isFinite(+p.y);
  });
  if (!clean.length) return false;
  const hits = clean.filter(function (p) { return isLat(+p.x) && isLng(+p.y); }).length;
  return hits / clean.length >= 0.8;
}

// Build a projector from the active dataset. Returns
// { mode: 'latlng' | 'grid', project(x, y) -> {lat, lng} }.
function makeProjector(pts){
  if (looksLikeLatLng(pts)) {
    return {
      mode: 'latlng',
      project: function (x, y) {
        return { lat: +(+x).toFixed(5), lng: +(+y).toFixed(5) };
      },
    };
  }
  // normalized grid: scale 0-1 grids up to 0-100, then map onto Bengaluru
  const clean = (pts || []).filter(function (p) { return p && isFinite(+p.x) && isFinite(+p.y); });
  const span = clean.length
    ? Math.max(1, Math.max.apply(null, clean.map(function (p) { return Math.abs(+p.x); })),
      Math.max.apply(null, clean.map(function (p) { return Math.abs(+p.y); })))
    : 100;
  const scale = span <= 1.5 ? 100 : 1; // 0..1 grids
  return {
    mode: 'grid',
    project: function (x, y) {
      const gx = Math.max(0, Math.min(100, (+x) * scale));
      const gy = Math.max(0, Math.min(100, (+y) * scale));
      return { lat: +(12.82 + (gy / 100) * 0.28).toFixed(5),
               lng: +(77.48 + (gx / 100) * 0.28).toFixed(5) };
    },
  };
}

// Back-compat helper: grid (or lat/lng, auto-detected) -> {lat, lng}
function gridToLatLng(x, y, pts){
  return makeProjector(pts).project(x, y);
}

module.exports = { makeProjector: makeProjector, gridToLatLng: gridToLatLng, looksLikeLatLng: looksLikeLatLng };
