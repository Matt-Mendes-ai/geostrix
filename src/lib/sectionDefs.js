// TASKS.csv #393 — section definitions a geologist can type instead of click: a centre + azimuth +
// length, a section through a given hole, and fence lines on round spacing named by the grid line they
// sit on (e.g. "6254500N"), the way sections are named on paper plans. Pure geometry, world coordinates
// (x = easting, y = northing), azimuth clockwise from north.

const toRad = (d) => (d * Math.PI) / 180;
const norm360 = (a) => ((a % 360) + 360) % 360;

// Endpoints of a section line centred on (e, n), running along `azimuth` for `length` metres.
export function sectionFromCentre({ e, n, azimuth, length }) {
  const a = toRad(norm360(azimuth)), h = Math.max(1, length) / 2;
  const dx = Math.sin(a) * h, dy = Math.cos(a) * h;
  return { ax: e - dx, ay: n - dy, bx: e + dx, by: n + dy, azimuth: norm360(azimuth) };
}

// A section through one hole, in the plane of the hole: along the collar -> end-of-hole bearing, centred
// on the midpoint of the trace's plan footprint, long enough to show the whole hole plus a margin.
// `wx`/`wy` are the desurveyed trace (world). A (near-)vertical hole has no bearing: `fallbackAzimuth`
// is used and `vertical` says so.
export function sectionThroughHole(wx, wy, { fallbackAzimuth = 0, minLength = 200 } = {}) {
  if (!wx?.length) return null;
  const x0 = wx[0], y0 = wy[0], x1 = wx[wx.length - 1], y1 = wy[wy.length - 1];
  const horiz = Math.hypot(x1 - x0, y1 - y0);
  const vertical = horiz < 1;
  const azimuth = vertical ? norm360(fallbackAzimuth) : norm360((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI);
  const length = Math.max(minLength, Math.ceil((horiz * 1.5) / 50) * 50);
  return { ...sectionFromCentre({ e: (x0 + x1) / 2, n: (y0 + y1) / 2, azimuth, length }), vertical };
}

// Parallel fence lines covering the perpendicular span [tMin, tMax] (t = x*cos(az) - y*sin(az), the
// same perpendicular axis generateSliceSeries uses), centred on ROUND multiples of `spacing` rather than
// wherever the data happens to start. Names: for N-S lines (az 0/180) the easting, for E-W lines
// (az 90/270) the northing, else the signed offset along the perpendicular.
export function fenceLines(tMin, tMax, spacing, azimuth) {
  const w = Math.max(1, spacing);
  const k0 = Math.floor(tMin / w + 0.5), k1 = Math.ceil(tMax / w - 0.5);
  const az = norm360(azimuth), a = toRad(az);
  const perpX = Math.cos(a), perpY = -Math.sin(a);
  const out = [];
  for (let k = k0; k <= Math.max(k0, k1); k++) {
    const t = k * w;
    const px = t * perpX, py = t * perpY; // the line's point closest to the origin
    let name;
    if (Math.abs(Math.sin(a)) < 1e-9) name = `${Math.round(px)}E`;
    else if (Math.abs(Math.cos(a)) < 1e-9) name = `${Math.round(py)}N`;
    else name = `Line ${t > 0 ? "+" : ""}${Math.round(t)} m`;
    out.push({ t, name });
  }
  return out;
}
