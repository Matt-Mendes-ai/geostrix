// TASKS.csv #1710 (review #1645, Copley) — a planned station grid for a forward model on a drilled prospect that has no
// survey yet: what anomaly would the magnetite halo give, and is a ground mag survey worth walking? The forward request
// already takes a station list, so one is generated from a rectangle, a line spacing, a station spacing and a sensor height.
// Pure: no React.
export const DEFAULT_PLANNED = { line: 100, station: 25, dir: "NS", height: 2 };

// the collars' box, padded by a share of its longer side (at least `minPad` m); null without two collars
export function defaultPlannedExtent(collars, { pad = 0.25, minPad = 200 } = {}) {
  const xs = (collars || []).map((c) => Number(c.x)).filter(Number.isFinite), ys = (collars || []).map((c) => Number(c.y)).filter(Number.isFinite);
  if (xs.length < 2 || ys.length < 2) return null;
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const p = Math.max(minPad, pad * Math.max(xmax - xmin, ymax - ymin));
  const r = (v) => Math.round(v);
  return { xmin: r(xmin - p), ymin: r(ymin - p), xmax: r(xmax + p), ymax: r(ymax + p) };
}

// TASKS.csv #2969 (review #2876, WA iron) — the planned grid opened on 100 x 25 m over the collars' box: on a 21.6 x 17.4 km field that is
// about 151,000 stations against the 20,000 cap ('capped at 20,000; widen the spacings'). With the spacings still at their defaults, both are
// scaled by the smallest round factor (2, 4, 5, 10, 20...) that keeps the grid within the cap, lines four times the station spacing as before.
// A spacing the user typed is kept. extent: { xmin, ymin, xmax, ymax } | null; p: the panel's { line, station, dir }. -> { line, station } | {}
const ROUND_FACTORS = [1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 400, 500, 1000];
export function fitPlannedSpacing(extent, p, cap = 20000) {
  if (!extent || Number(p?.line) !== DEFAULT_PLANNED.line || Number(p?.station) !== DEFAULT_PLANNED.station) return {};
  const ns = p?.dir !== "EW", across = ns ? extent.xmax - extent.xmin : extent.ymax - extent.ymin, along = ns ? extent.ymax - extent.ymin : extent.xmax - extent.xmin;
  if (!(across > 0 && along > 0)) return {};
  const count = (k) => (Math.floor(across / (DEFAULT_PLANNED.line * k)) + 1) * (Math.floor(along / (DEFAULT_PLANNED.station * k)) + 1);
  const k = ROUND_FACTORS.find((f) => count(f) <= cap) ?? ROUND_FACTORS[ROUND_FACTORS.length - 1];
  return k === 1 ? {} : { line: DEFAULT_PLANNED.line * k, station: DEFAULT_PLANNED.station * k };
}

// -> { rows: [{ x, y, z, value: 0, _src, line }], stats: { lines, perLine, n, capped, lineSpacing, stationSpacing, dir, height } }
// groundAt(x, y) gives the ground elevation (NaN when unknown); z = ground + the sensor height. Lines run N-S ("NS") or E-W ("EW").
export function generatePlannedStations(opts = {}, groundAt = () => NaN, { cap = 20000, src = "Planned grid" } = {}) {
  const xmin = Number(opts.xmin), ymin = Number(opts.ymin), xmax = Number(opts.xmax), ymax = Number(opts.ymax);
  const lineSpacing = Number(opts.line) > 0 ? Number(opts.line) : DEFAULT_PLANNED.line;
  const stationSpacing = Number(opts.station) > 0 ? Number(opts.station) : DEFAULT_PLANNED.station;
  const height = Number.isFinite(Number(opts.height)) ? Number(opts.height) : DEFAULT_PLANNED.height;
  const dir = opts.dir === "EW" ? "EW" : "NS";
  const empty = { rows: [], stats: { lines: 0, perLine: 0, n: 0, capped: false, lineSpacing, stationSpacing, dir, height } };
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || !(xmax > xmin) || !(ymax > ymin)) return empty;
  const across = dir === "NS" ? xmax - xmin : ymax - ymin, along = dir === "NS" ? ymax - ymin : xmax - xmin;
  const lines = Math.floor(across / lineSpacing) + 1, perLine = Math.floor(along / stationSpacing) + 1;
  const rows = [];
  let capped = false;
  outer: for (let i = 0; i < lines; i++) {
    for (let j = 0; j < perLine; j++) {
      if (rows.length >= cap) { capped = true; break outer; }
      const a = i * lineSpacing, b = j * stationSpacing;
      const x = dir === "NS" ? xmin + a : xmin + b, y = dir === "NS" ? ymin + b : ymin + a;
      const g = groundAt(x, y);
      rows.push({ x, y, z: (Number.isFinite(g) ? g : 0) + height, value: 0, _src: src, line: dir === "NS" ? `L${Math.round(x)}E` : `L${Math.round(y)}N`, label: String(j) });
    }
  }
  return { rows, stats: { lines, perLine, n: rows.length, capped, lineSpacing, stationSpacing, dir, height } };
}
