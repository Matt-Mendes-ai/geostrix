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
  // TASKS.csv #1255 — an oblique line is named by its offset from the middle of the data: "Line -4710600 m" measured from the UTM origin meant nothing
  const mid = Math.round(((tMin + tMax) / 2) / w) * w;
  const out = [];
  for (let k = k0; k <= Math.max(k0, k1); k++) {
    const t = k * w;
    const px = t * perpX, py = t * perpY; // the line's point closest to the origin
    let name;
    if (Math.abs(Math.sin(a)) < 1e-9) name = `${Math.round(px)}E`;
    else if (Math.abs(Math.cos(a)) < 1e-9) name = `${Math.round(py)}N`;
    else name = `Line ${t - mid > 0 ? "+" : ""}${Math.round(t - mid)} m`;
    out.push({ t, name });
  }
  return out;
}

// TASKS.csv #1255 — in the 3D view a series labels every nth line, by its short name and at one end: 51 full names at both ends covered every hole. Lines are thin, with no halo.
// Maps a section of a series to { label } (null when this line goes unlabelled); sections outside a series are not in the map. Reads the name fenceSeries gives.
export function fenceLabels(sections, maxLabels = 8) {
  const out = new Map();
  for (const s of sections || []) {
    const m = /^Fence (\d+)\/(\d+) (.+?) \(az /.exec(s.name || "");
    if (!m) continue;
    const k = Number(m[1]), n = Number(m[2]), step = Math.max(1, Math.ceil(n / maxLabels));
    out.set(s, { label: (k - 1) % step === 0 ? m[3] : null });
  }
  return out;
}

// TASKS.csv #1180 — what a fence series covers: the drilling, unless asked for the block models too. A 25 km ZTEM mesh over 5 km of drilling made
// 27 sections at 1 km and would have made about 540 at the default width. With no holes there is only the models to cover.
export function fenceExtentPoints(models, traces, coverModels) {
  const pts = [];
  (traces || []).forEach((t) => t.wx.forEach((wx, i) => pts.push({ x: wx, y: t.wy[i] })));
  if (coverModels || !pts.length) {
    (models || []).forEach((m) => {
      if (m.visible === false) return;
      (m.cells || []).forEach((c) => {
        const hx = (c.dx || 0) / 2, hy = (c.dy || 0) / 2;
        pts.push({ x: c.x - hx, y: c.y - hy }, { x: c.x + hx, y: c.y + hy }, { x: c.x - hx, y: c.y + hy }, { x: c.x + hx, y: c.y - hy });
      });
    });
  }
  return pts;
}
// TASKS.csv #2040 (review #2013, Woodjam) — the lines whose slab (± half the spacing) holds any of the points (drillhole trace vertices,
// and the corners of the covered models' cells): three clusters of holes 3-5 km apart made 94 sections at 50 m, about 76 of them through
// empty ground. traces (optional): a slab a trace SEGMENT crosses counts even with no vertex inside it (a long straight segment).
// -> { lines: [{ t, name }], all (the lines over the whole extent), empty (skipped) }
export function fenceLinesWithData(pts, azimuth, width, traces = null) {
  if (!pts?.length) return { lines: [], all: 0, empty: 0 };
  const a = toRad(norm360(azimuth)), px = Math.cos(a), py = -Math.sin(a);
  const ts = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i++) ts[i] = pts[i].x * px + pts[i].y * py;
  ts.sort();
  const lines = fenceLines(ts[0], ts[ts.length - 1], width, azimuth), h = Math.max(1, width) / 2;
  const any = (lo, hi) => { let l = 0, r = ts.length; while (l < r) { const m = (l + r) >> 1; if (ts[m] < lo) l = m + 1; else r = m; } return l < ts.length && ts[l] <= hi; };
  const segs = [];
  for (const t of traces || []) for (let i = 1; i < (t?.wx?.length || 0); i++) {
    const u = t.wx[i - 1] * px + t.wy[i - 1] * py, v = t.wx[i] * px + t.wy[i] * py;
    if (Math.abs(v - u) > 2 * h) segs.push([Math.min(u, v), Math.max(u, v)]); // shorter segments always have a vertex in any slab they cross
  }
  const crossed = (lo, hi) => segs.some(([u, v]) => u <= hi && v >= lo);
  const kept = lines.filter((ln) => any(ln.t - h, ln.t + h) || crossed(ln.t - h, ln.t + h));
  return { lines: kept, all: lines.length, empty: lines.length - kept.length };
}
// How many sections those points make at this azimuth and width, before any is created (#2040: the slabs with data only)
export function fenceSectionCount(pts, azimuth, width, traces = null) {
  return fenceLinesWithData(pts, azimuth, width, traces).lines.length;
}
