// TASKS.csv #4071 — the guided 3-step flow of the section georeferencer (Figure, Points, Place): what the typed numbers say and which line follows from them.
// Users were lost between three up-front choices (the section line, "Horizontal values are", the elevation datum) before they had seen their figure placed.
// Now the figure is loaded first, the points are typed, and the rest is worked out here:
//   - detectHKind: eastings, northings or distances along the line, from the numbers typed (with the project's own extent when it has one);
//   - sectionLineFor: eastings alone give an east-west line at ONE typed northing (northings alone: a north-south line at one easting); an easting AND a northing
//     on each point give the line itself (nothing asked); distances need a line (a saved section, two clicks on the plan, or typed ends);
//   - nearestSection: the one saved section to recommend (the one nearest the holes);
//   - flowHint: the one short sentence that says what is still missing.
// Pure.
import { sectionLine } from "./sectionGeoref.js";
import { arrMin, arrMax } from "./arrayStats.js"; // no Math.min / max spread (#3031)

const num = (v) => (v === "" || v == null ? NaN : Number(v));

// the project's frame from its holes and saved sections: { x: [min, max], y: [min, max] }, padded by a fifth of its size (at least 1 km); null when it has none
export function projectExtent({ collars = [], sections = [] } = {}) {
  const xs = [], ys = [];
  const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } };
  for (const c of collars) add(Number(c.x), Number(c.y));
  for (const s of sections) { add(Number(s.ax), Number(s.ay)); add(Number(s.bx), Number(s.by)); }
  if (!xs.length) return null;
  const x0 = arrMin(xs), x1 = arrMax(xs), y0 = arrMin(ys), y1 = arrMax(ys);
  const px = Math.max(1000, (x1 - x0) * 0.2), py = Math.max(1000, (y1 - y0) * 0.2);
  return { x: [x0 - px, x1 + px], y: [y0 - py, y1 + py] };
}

// "easting" | "northing" | "distance" | null (nothing typed yet): by where the numbers fall in the project's frame; without one (or when the frame cannot tell
// them apart, a local grid) by their size: six-digit values are eastings, seven-digit ones northings, small ones distances along the line
export function detectHKind(values, extent = null) {
  const v = (values || []).map(num).filter(Number.isFinite);
  if (!v.length) return null;
  const share = (r) => v.filter((x) => x >= r[0] && x <= r[1]).length / v.length;
  if (extent) {
    const e = share(extent.x), n = share(extent.y);
    if (e >= 0.8 && n < 0.5) return "easting";
    if (n >= 0.8 && e < 0.5) return "northing";
  } // (a local grid whose eastings and northings overlap cannot be told apart here: the size rule below, and the override)
  if (v.every((x) => Math.abs(x) >= 100000)) return v.every((x) => Math.abs(x) >= 1000000) ? "northing" : "easting";
  return "distance";
}

// the figure's points as the line sees them: { px, h (the value typed), h2 (a second value, the other horizontal axis, optional) }
// -> { line, distances: [metres along the line for each point, null where unusable], via: "points" | "cross", need: null | "cross" | "line" | "second", error }
export function sectionLineFor({ hKind, points = [], cross = "" }) {
  if (hKind === "distance") return { line: null, distances: null, via: null, need: "line", error: null };
  const ok = points.filter((p) => Number.isFinite(num(p.h)));
  const withSecond = ok.filter((p) => Number.isFinite(num(p.h2)));
  try {
    if (withSecond.length >= 2) { // easting AND northing on the points: the line goes through them, left of the figure first
      const q = [...withSecond].sort((a, b) => a.px - b.px);
      const e = (p) => (hKind === "easting" ? num(p.h) : num(p.h2)), n = (p) => (hKind === "easting" ? num(p.h2) : num(p.h));
      const first = q[0], last = q[q.length - 1];
      const line = sectionLine({ x: e(first), y: n(first) }, { x: e(last), y: n(last) });
      const distances = points.map((p) => (Number.isFinite(num(p.h)) && Number.isFinite(num(p.h2)) ? (e(p) - line.a.x) * line.ux + (n(p) - line.a.y) * line.uy : null));
      return { line, distances, via: "points", need: null, error: null };
    }
    const c = num(cross);
    if (!Number.isFinite(c)) return { line: null, distances: null, via: null, need: "cross", error: null };
    if (!ok.length) return { line: null, distances: null, via: null, need: null, error: null };
    const hs = ok.map((p) => num(p.h)), lo = arrMin(hs), hi = arrMax(hs);
    const to = hi > lo ? hi : lo + 1;
    const line = hKind === "easting" ? sectionLine({ x: lo, y: c }, { x: to, y: c }) : sectionLine({ x: c, y: lo }, { x: c, y: to });
    return { line, distances: null, via: "cross", need: null, error: null };
  } catch (err) { return { line: null, distances: null, via: null, need: null, error: err.message }; }
}

// the saved section to recommend: the one nearest the holes (the mean distance from each hole to the section's segment); the first when there are no holes; null with none
export function nearestSection(sections = [], collars = []) {
  if (!sections.length) return null;
  const pts = collars.map((c) => ({ x: Number(c.x), y: Number(c.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return sections[0];
  const dist = (p, s) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / l2)) : 0;
    return Math.hypot(p.x - (s.ax + t * dx), p.y - (s.ay + t * dy));
  };
  let best = null, bestD = Infinity;
  for (const s of sections) { const d = pts.reduce((a, p) => a + dist(p, s), 0) / pts.length; if (d < bestD) { bestD = d; best = s; } }
  return best;
}

// the one sentence for what is still missing, or "" when the placement can be checked. rows: [{ h, h2, z }] as typed, in order
export function flowHint({ rows = [], hKind, need = null, lineOk = false, lineError = null }) {
  const filled = rows.filter((r) => String(r.h ?? "") !== "" || String(r.z ?? "") !== "");
  if (rows.length < 2) return { id: "two" };
  for (let i = 0; i < rows.length; i++) {
    if (!Number.isFinite(num(rows[i].h))) return { id: "value", n: i + 1 };
    if (!Number.isFinite(num(rows[i].z))) return { id: "elevation", n: i + 1 };
  }
  void filled;
  if (lineError) return { id: "error", text: lineError };
  if (need === "cross") return { id: hKind === "easting" ? "northing" : "easting" };
  if (!lineOk) return { id: "line" };
  return null;
}
