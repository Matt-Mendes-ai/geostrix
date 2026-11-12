// TASKS.csv #2459 / #2591 (reviews #2325 WA uranium, #2486 WA lithium) — the Maps plan drew every collar as the same black dot: aircore,
// RC, diamond and pit bench holes could not be told apart, nothing per hole could be coloured and no hole was named. The smallest useful
// step the reviews asked for: colour the collars by a collar field (hole type, drill code ...) or by a per-hole statistic of an assay
// element (the highest value, or the length-weighted mean of the hole), with a legend, and the hole ids as labels, decluttered. Pure.
import { CATEGORICAL_SAFE_COLORS, VIRIDIS_ANCHORS } from "./layers.js";

// collar keys that are geometry or bookkeeping, never a colour-by field
const SKIP = new Set(["x", "y", "z", "hole_id", "id", "depth", "dip", "azimuth", "azi", "_src", "_row", "lon", "lat", "lng", "elev", "elevation", "easting", "northing", "max_depth", "length"]);
const num = (v) => (typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v));
const MAX_CATEGORIES = 16;
// TASKS.csv #2984 (WA iron review) — an import keeps a collar file's other columns in collar.attrs (#1504), never as top-level keys, so the
// Maps plan offered no collar field on an imported project (the #2459 test built collars no import makes). A field is read at the top
// level first, then in attrs.
export const collarFieldValue = (c, k) => (c?.[k] !== undefined && typeof c[k] !== "object" ? c[k] : c?.attrs?.[k]);

// -> [{ key, kind: "category" | "number", n }] the collar fields worth colouring by: a field with 2-16 distinct values is a category, a
// field whose values are all numbers is a number (an id-like column, a different value on every hole and not numeric, is left out)
export function collarColourFields(collars) {
  const cs = (collars || []).filter((c) => c && typeof c === "object");
  const keys = new Set();
  for (const c of cs.slice(0, 2000)) for (const k of [...Object.keys(c), ...Object.keys(c.attrs && typeof c.attrs === "object" ? c.attrs : {})]) if (k !== "attrs" && !SKIP.has(k.toLowerCase()) && !k.startsWith("_")) keys.add(k);
  const out = [];
  for (const k of keys) {
    const vals = cs.map((c) => collarFieldValue(c, k)).filter((v) => v !== "" && v != null && typeof v !== "object");
    if (vals.length < 2) continue;
    const distinct = new Set(vals.map((v) => String(v).trim()));
    if (vals.every((v) => Number.isFinite(num(v))) && distinct.size > MAX_CATEGORIES) out.push({ key: k, kind: "number", n: vals.length });
    else if (distinct.size >= 2 && distinct.size <= MAX_CATEGORIES) out.push({ key: k, kind: "category", n: vals.length });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// per hole: "max" (the highest value) or "mean" (length-weighted over the intervals with a value). -> Map(hole_id -> value)
export function perHoleAssay(assays, element, stat = "max") {
  const acc = new Map();
  for (const r of assays || []) {
    const v = num(r?.values?.[element]);
    if (!Number.isFinite(v) || r.hole_id == null) continue;
    const L = Number.isFinite(r.to - r.from) && r.to > r.from ? r.to - r.from : 0;
    const a = acc.get(r.hole_id) || { max: -Infinity, sum: 0, len: 0, n: 0, plain: 0 };
    if (v > a.max) a.max = v;
    a.sum += v * L; a.len += L; a.plain += v; a.n++;
    acc.set(r.hole_id, a);
  }
  const out = new Map();
  for (const [h, a] of acc) out.set(h, stat === "max" ? a.max : a.len > 0 ? a.sum / a.len : a.plain / a.n);
  return out;
}

const hex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
function viridis(t) {
  const n = VIRIDIS_ANCHORS.length - 1, s = Math.min(n - 1, Math.max(0, Math.floor(t * n))), f = t * n - s;
  const a = VIRIDIS_ANCHORS[s], b = VIRIDIS_ANCHORS[s + 1];
  return hex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * f));
}
const qSorted = (s, p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toLocaleString()); // 60, 1.23, 0.0123

// values: Map(hole_id -> value) or a collar field. -> { colourOf(collar) -> colour | null, legend: [{ colour, label }], kind }
// Numbers: five classes at the quintiles of the holes' values (viridis, low dark to high yellow); categories: one colour each, by count.
export function collarColouring(collars, { field = null, values = null } = {}) {
  const valueOf = values ? (c) => values.get(c.hole_id) : (c) => collarFieldValue(c, field); // #2984 — attrs too
  const vals = (collars || []).map(valueOf).filter((v) => v !== "" && v != null);
  if (!vals.length) return null;
  const numeric = values || vals.every((v) => Number.isFinite(num(v))) && new Set(vals.map(String)).size > MAX_CATEGORIES;
  if (numeric) {
    const s = vals.map(num).filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return null;
    const breaks = [0.2, 0.4, 0.6, 0.8].map((p) => qSorted(s, p)).filter((b, i, a) => i === 0 || b > a[i - 1]);
    const k = breaks.length + 1, colours = Array.from({ length: k }, (_, i) => viridis(k === 1 ? 0.5 : i / (k - 1)));
    const cls = (v) => { let i = 0; while (i < breaks.length && v > breaks[i]) i++; return i; };
    const edges = [s[0], ...breaks, s[s.length - 1]];
    return {
      kind: "number",
      colourOf: (c) => { const v = num(valueOf(c)); return Number.isFinite(v) ? colours[cls(v)] : null; },
      legend: colours.map((colour, i) => ({ colour, label: `${fmt(edges[i])} – ${fmt(edges[i + 1])}` })),
    };
  }
  const counts = new Map();
  for (const v of vals) { const k = String(v).trim(); counts.set(k, (counts.get(k) || 0) + 1); }
  const order = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const colourFor = new Map(order.map((k, i) => [k, CATEGORICAL_SAFE_COLORS[i % CATEGORICAL_SAFE_COLORS.length]]));
  return { kind: "category", colourOf: (c) => { const v = valueOf(c); return v === "" || v == null ? null : colourFor.get(String(v).trim()) || null; }, legend: order.map((k) => ({ colour: colourFor.get(k), label: `${k} (${counts.get(k).toLocaleString()})` })) };
}

// label boxes that do not overlap, in drawing order: [{ i, x, y }] of the points whose label fits. w / h: a label's size in pixels.
export function declutterLabels(points, w, h) {
  const cell = new Map(), key = (a, b) => `${a},${b}`, out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const gx = Math.floor(p.x / w), gy = Math.floor(p.y / h);
    let clash = false;
    for (let dx = -1; dx <= 1 && !clash; dx++) for (let dy = -1; dy <= 1 && !clash; dy++) for (const q of cell.get(key(gx + dx, gy + dy)) || []) if (Math.abs(q.x - p.x) < w && Math.abs(q.y - p.y) < h) { clash = true; break; }
    if (clash) continue;
    (cell.get(key(gx, gy)) || cell.set(key(gx, gy), []).get(key(gx, gy))).push(p);
    out.push({ i, x: p.x, y: p.y });
  }
  return out;
}
