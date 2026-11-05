// TASKS.csv #1600 (review #1497, Lawyers) — a numeric map-layer field coloured in graduated classes. 'Colour by au_ppm' on
// 1,278 rock stations made 295 'units' in file order, each value its own random colour. A layer with styleBreaks
// [b0, b1, ...] has one category per class (value "g0" .. "gN", labels "< b0", "b0 – b1", ..., "≥ bN-1"), sorted, in a
// ramp; layerCategoryValue (mapLayers.js) puts each feature in its class. Breaks are typed on the layer card.
// Viridis, as layers.js PALETTES.viridis (not imported: layers.js imports mapLayers.js, which imports this file)
const VIRIDIS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function rampColours(n, anchors = VIRIDIS) {
  return Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 1 : i / (n - 1), s = t * (anchors.length - 1), j = Math.min(anchors.length - 2, Math.floor(s)), f = s - j;
    const a = hex2(anchors[j]), b = hex2(anchors[j + 1]);
    return "#" + a.map((v, c) => Math.round(v + (b[c] - v) * f).toString(16).padStart(2, "0")).join("");
  });
}

const num = (v) => (v == null || v === "" ? NaN : typeof v === "number" ? v : Number(String(v).trim().replace(/^</, "")));

// Numeric when 90 % of the filled values read as numbers and there are more than 12 distinct ones (a coded unit
// field such as 1 / 2 / 3 stays categorical).
export function isNumericField(features, field) {
  let filled = 0, numeric = 0;
  const distinct = new Set();
  for (const f of features || []) {
    const v = f.attributes?.[field];
    if (v == null || v === "") continue;
    filled++;
    const n = num(v);
    if (Number.isFinite(n)) { numeric++; if (distinct.size <= 12) distinct.add(n); }
  }
  return filled > 0 && numeric >= filled * 0.9 && distinct.size > 12;
}

// An identifier: text, filled and different on every one of more than 20 features (a sample number). Colouring by it
// makes one 'unit' per feature, so the layer's first colour field skips it (#1600).
export function isIdField(features, field) {
  const fs = features || [];
  if (fs.length <= 20) return false;
  const seen = new Set();
  for (const f of fs) { const v = f.attributes?.[field]; if (v == null || v === "" || typeof v === "number" || seen.has(v)) return false; seen.add(v); }
  return !isNumericField(fs, field);
}

const nice = (x) => (x === 0 ? 0 : +x.toPrecision(2));

// Starting breaks from the data: its 50th, 75th, 90th, 95th and 98th percentiles to two significant figures, so the
// top classes hold the few high values (as an anomaly map wants). Typed breaks replace them.
export function suggestedBreaks(features, field) {
  const vals = [];
  for (const f of features || []) { const n = num(f.attributes?.[field]); if (Number.isFinite(n)) vals.push(n); }
  if (!vals.length) return [];
  vals.sort((a, b) => a - b);
  const at = (p) => vals[Math.min(vals.length - 1, Math.round(p * (vals.length - 1)))];
  return [...new Set([0.5, 0.75, 0.9, 0.95, 0.98].map((p) => nice(at(p))))].filter((b) => b > vals[0]).sort((a, b) => a - b);
}

// "0.1, 0.5 1 / 5" -> [0.1, 0.5, 1, 5]: sorted, unique, numbers only.
export function parseBreaks(text) {
  return [...new Set(String(text || "").split(/[\s,;/]+/).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

export function graduatedClassKey(value, breaks) {
  const n = num(value);
  if (!Number.isFinite(n)) return null;
  let i = 0;
  while (i < breaks.length && n >= breaks[i]) i++;
  return `g${i}`;
}

export function graduatedCategories(features, field, breaks) {
  const k = breaks.length;
  const counts = new Array(k + 1).fill(0);
  let none = 0;
  for (const f of features || []) {
    const key = graduatedClassKey(f.attributes?.[field], breaks);
    if (key == null) none++; else counts[+key.slice(1)]++;
  }
  const colours = rampColours(k + 1);
  const label = (i) => (i === 0 ? `< ${breaks[0]}` : i === k ? `≥ ${breaks[k - 1]}` : `${breaks[i - 1]} – ${breaks[i]}`);
  const cats = counts.map((count, i) => ({ value: `g${i}`, label: k ? label(i) : field, color: colours[i], outline: null, visible: true, count }));
  if (none) cats.push({ value: null, label: "(no value)", color: "#9a9a9a", outline: null, visible: true, count: none });
  return cats;
}

// The style a field gets when chosen: graduated for a numeric one, else the caller's categories.
export function graduatedStyle(features, field) {
  if (!field || !isNumericField(features, field)) return null;
  const styleBreaks = suggestedBreaks(features, field);
  return styleBreaks.length ? { styleBreaks, categories: graduatedCategories(features, field, styleBreaks) } : null;
}
