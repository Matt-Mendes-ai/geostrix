// TASKS.csv #2459 / #2591 (reviews #2325 WA uranium, #2486 WA lithium) — the Maps plan drew every collar as the same black dot: aircore,
// RC, diamond and pit bench holes could not be told apart, nothing per hole could be coloured and no hole was named. The smallest useful
// step the reviews asked for: colour the collars by a collar field (hole type, drill code ...) or by a per-hole statistic of an assay
// element (the highest value, or the length-weighted mean of the hole), with a legend, and the hole ids as labels, decluttered. Pure.
import { CATEGORICAL_SAFE_COLORS, VIRIDIS_ANCHORS } from "./layers.js";

// collar keys that are geometry or bookkeeping, never a colour-by field
const SKIP = new Set(["x", "y", "z", "hole_id", "id", "depth", "dip", "azimuth", "azi", "_src", "_row", "lon", "lat", "lng", "elev", "elevation", "easting", "northing", "max_depth", "length"]);
const num = (v) => (typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v));
const MAX_CATEGORIES = 16;
// TASKS.csv #3340 (Galore Creek review) — a text field with a few more than 16 values (DH_AREA: 18 areas) was silently left out of the menu,
// although it is the field the property is organized by. Up to MAX_GROUPED values the commonest TOP_GROUPED keep their colour and the rest
// are one 'other' class; a field with more is listed in the menu as left out, with its count (collarFieldsLeftOut).
const MAX_GROUPED = 40, TOP_GROUPED = 15;
const fieldKeys = (cs) => {
  const keys = new Set();
  for (const c of cs.slice(0, 2000)) for (const k of [...Object.keys(c), ...Object.keys(c.attrs && typeof c.attrs === "object" ? c.attrs : {})]) if (k !== "attrs" && !SKIP.has(k.toLowerCase()) && !k.startsWith("_")) keys.add(k);
  return keys;
};
const fieldValues = (cs, k) => cs.map((c) => collarFieldValue(c, k)).filter((v) => v !== "" && v != null && typeof v !== "object");
// TASKS.csv #2984 (WA iron review) — an import keeps a collar file's other columns in collar.attrs (#1504), never as top-level keys, so the
// Maps plan offered no collar field on an imported project (the #2459 test built collars no import makes). A field is read at the top
// level first, then in attrs.
export const collarFieldValue = (c, k) => (c?.[k] !== undefined && typeof c[k] !== "object" ? c[k] : c?.attrs?.[k]);

// -> [{ key, kind: "category" | "number", n }] the collar fields worth colouring by: a field with 2-16 distinct values is a category, a
// field whose values are all numbers is a number (an id-like column, a different value on every hole and not numeric, is left out)
export function collarColourFields(collars) {
  const cs = (collars || []).filter((c) => c && typeof c === "object");
  const out = [];
  for (const k of fieldKeys(cs)) {
    const vals = fieldValues(cs, k);
    if (vals.length < 2) continue;
    if (looksLikeDateSerials(k, vals)) continue; // #3351 — a date kept as an Excel serial is not a number to class
    const distinct = new Set(vals.map((v) => String(v).trim()));
    if (vals.every((v) => Number.isFinite(num(v))) && distinct.size > MAX_CATEGORIES) out.push({ key: k, kind: "number", n: vals.length });
    else if (distinct.size >= 2 && distinct.size <= MAX_CATEGORIES) out.push({ key: k, kind: "category", n: vals.length });
    else if (distinct.size > MAX_CATEGORIES && distinct.size <= MAX_GROUPED) out.push({ key: k, kind: "category", n: vals.length, values: distinct.size, grouped: true }); // #3340
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// TASKS.csv #3456 — the collar fields a symbol shape can follow: text (or numeric-looking) fields of 2 to 5 distinct values -> [{ key, values }]
export function collarShapeFields(collars) {
  const cs = (collars || []).filter((c) => c && typeof c === "object");
  const out = [];
  for (const k of fieldKeys(cs)) {
    const vals = fieldValues(cs, k);
    if (vals.length < 2) continue;
    const n = new Set(vals.map((v) => String(v).trim())).size;
    if (n >= 2 && n <= 5) out.push({ key: k, values: n });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
// a field's values -> shapes 0-4, commonest first: { shapeOf(collar) -> 0-4, legend: [{ label, shape, count }] } or null (not 2-5 values)
export function collarShapes(collars, field) {
  const counts = new Map();
  for (const c of collars || []) { const v = collarFieldValue(c, field); if (v === "" || v == null || typeof v === "object") continue; const k = String(v).trim(); counts.set(k, (counts.get(k) || 0) + 1); }
  if (counts.size < 2 || counts.size > 5) return null;
  const order = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shape = new Map(order.map(([k], i) => [k, i]));
  return { shapeOf: (c) => { const v = collarFieldValue(c, field); return v === "" || v == null || typeof v === "object" ? 0 : shape.get(String(v).trim()) ?? 0; }, legend: order.map(([k, n], i) => ({ label: k, shape: i, count: n })) };
}

// TASKS.csv #3340 — the text fields too varied to colour by (more than MAX_GROUPED values), for the menu to name: [{ key, values }]. A field with
// a different value on every hole (an id, a date per hole) is not listed: it is not a grouping.
// TASKS.csv #3351 (Galore Creek review) — STARTDATE / ENDDATE, kept by the import as the text of Excel serials, were offered as numbers and
// classed '45,079 – 45,109'. A field named for a date whose values are whole numbers of 20000-60000 (1954-2064) is left out of the menu.
export const looksLikeDateSerials = (key, vals) => /date|dt$|time/i.test(String(key)) && vals.length > 0 && vals.every((v) => { const n = num(v); return Number.isInteger(n) && n >= 20000 && n <= 60000; });
export function collarFieldsLeftOut(collars) {
  const cs = (collars || []).filter((c) => c && typeof c === "object");
  const out = [];
  for (const k of fieldKeys(cs)) {
    const vals = fieldValues(cs, k);
    if (vals.length < 2 || vals.every((v) => Number.isFinite(num(v)))) continue;
    const distinct = new Set(vals.map((v) => String(v).trim())).size;
    if (distinct > MAX_GROUPED && distinct < vals.length) out.push({ key: k, values: distinct });
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
// TASKS.csv #3050 — "50, 55, 60" (commas, semicolons or spaces; a decimal comma is not read: use a point) -> [50, 55, 60] ascending and distinct, or [] when
// there is nothing usable; at most 12 breaks
export const parseBreaks = (text) => [...new Set(String(text ?? "").split(/[;\s,]+/).map((t) => t.trim()).filter(Boolean).map(Number).filter(Number.isFinite))].sort((a, b) => a - b).slice(0, 12);
export function collarColouring(collars, { field = null, values = null, breaks: typed = null } = {}) {
  const valueOf = values ? (c) => values.get(c.hole_id) : (c) => collarFieldValue(c, field); // #2984 — attrs too
  const vals = (collars || []).map(valueOf).filter((v) => v !== "" && v != null);
  if (!vals.length) return null;
  const numeric = values || vals.every((v) => Number.isFinite(num(v))) && new Set(vals.map(String)).size > MAX_CATEGORIES;
  if (numeric) {
    const s = vals.map(num).filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return null;
    // #3050 — class breaks typed by the geologist (50, 55, 60 % Fe) instead of the quintiles
    const breaks = typed?.length ? typed.filter((b, i, a) => i === 0 || b > a[i - 1]) : [0.2, 0.4, 0.6, 0.8].map((p) => qSorted(s, p)).filter((b, i, a) => i === 0 || b > a[i - 1]);
    const k = breaks.length + 1, colours = Array.from({ length: k }, (_, i) => viridis(k === 1 ? 0.5 : i / (k - 1)));
    const cls = (v) => { let i = 0; while (i < breaks.length && v > breaks[i]) i++; return i; };
    const edges = [s[0], ...breaks, s[s.length - 1]];
    // TASKS.csv #3351 — the holes in each class, and those with no value (the grey rings)
    const counts = new Array(k).fill(0);
    for (const v of s) counts[cls(v)]++;
    const noValue = (collars || []).filter((c) => !Number.isFinite(num(valueOf(c)))).length;
    return {
      kind: "number", noValue,
      classOf: (c) => { const v = num(valueOf(c)); return Number.isFinite(v) ? cls(v) : -1; }, // #3457 — the class a hole's value falls in (size by value)
      classes: k,
      colourOf: (c) => { const v = num(valueOf(c)); return Number.isFinite(v) ? colours[cls(v)] : null; },
      legend: colours.map((colour, i) => ({ colour, label: `${fmt(edges[i])} – ${fmt(edges[i + 1])} (${counts[i].toLocaleString()})` })),
    };
  }
  const counts = new Map();
  for (const v of vals) { const k = String(v).trim(); counts.set(k, (counts.get(k) || 0) + 1); }
  const order = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  // #3340 — over 16 values: the commonest 15 keep a colour each, the rest share one grey-brown 'other' class (counted in the legend)
  const grouped = order.length > MAX_CATEGORIES, kept = grouped ? order.slice(0, TOP_GROUPED) : order, OTHER = "#9c8f80";
  const colourFor = new Map(kept.map((k, i) => [k, CATEGORICAL_SAFE_COLORS[i % CATEGORICAL_SAFE_COLORS.length]]));
  const legend = kept.map((k) => ({ colour: colourFor.get(k), label: `${k} (${counts.get(k).toLocaleString()})` }));
  if (grouped) {
    const rest = order.slice(TOP_GROUPED);
    let n = 0; for (const k of rest) n += counts.get(k);
    legend.push({ colour: OTHER, label: `other: ${rest.length} values (${n.toLocaleString()})`, other: rest, holes: n }); // the plan words it through tr()
  }
  return { kind: "category", grouped, colourOf: (c) => { const v = valueOf(c); return v === "" || v == null ? null : colourFor.get(String(v).trim()) || (grouped ? OTHER : null); }, legend };
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
