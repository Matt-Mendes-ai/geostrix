// TASKS.csv #374 — geophysics point surveys stored compactly in the project file and the 60 s autosave.
// geophys_pts used to be one JSON object per point (~80 bytes each: a 200,000-point airborne survey added
// ~16 MB to every autosave on the machines GeoStrix targets). Now: numeric fields as base64 Float32 columns
// (x / y as offsets from the first point — Float32 alone would lose ~0.5 m at UTM northings), text fields
// dictionary-encoded (a survey name or line number repeats thousands of times). Missing values survive
// (null / absent stays null / absent). Float32 keeps ~7 significant digits: 56,123.46 nT, 1,234.567 m.
import { f32ToB64, b64ToF32 } from "./inversion.js";

export const COMPACT_MIN_ROWS = 2000; // below this the plain JSON is small and easier to read
const NUMERIC = ["x", "y", "z", "value", "zAgl", "fid"];
const TEXT = ["_src", "label", "line", "fid"];

const cache = new WeakMap(); // rows array -> compact form (autosave re-encodes nothing that did not change)

export function compactPointRows(rows) {
  if (!Array.isArray(rows) || rows.length < COMPACT_MIN_ROWS) return rows;
  const hit = cache.get(rows);
  if (hit) return hit;
  const n = rows.length;
  const base = [rows[0].x || 0, rows[0].y || 0];
  const cols = {}, text = {};
  for (const k of NUMERIC) {
    let any = false;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = rows[i][k];
      if (typeof v === "number" && Number.isFinite(v)) { a[i] = k === "x" ? v - base[0] : k === "y" ? v - base[1] : v; any = true; } else a[i] = NaN;
    }
    if (any) cols[k] = f32ToB64(a);
  }
  for (const k of TEXT) {
    const dict = [], index = new Map(), codes = new Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const v = rows[i][k];
      if (typeof v !== "string") { codes[i] = -1; continue; }
      any = true;
      if (!index.has(v)) { index.set(v, dict.length); dict.push(v); }
      codes[i] = index.get(v);
    }
    if (any) text[k] = { dict, codes };
  }
  // anything else on a row (a rare extra column) is kept verbatim, keyed by row index
  const known = new Set([...NUMERIC, ...TEXT]);
  const extras = {};
  rows.forEach((r, i) => { const e = {}; let has = false; for (const k in r) if (!known.has(k)) { e[k] = r[k]; has = true; } if (has) extras[i] = e; });
  const out = { __compactRows: 1, n, base, cols, text, ...(Object.keys(extras).length ? { extras } : {}) };
  cache.set(rows, out);
  return out;
}

export function expandPointRows(stored) {
  if (!stored || !stored.__compactRows) return stored;
  const { n, base, cols, text, extras = {} } = stored;
  const num = Object.fromEntries(Object.entries(cols).map(([k, b]) => [k, b64ToF32(b)]));
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const [k, a] of Object.entries(num)) {
      const v = a[i];
      if (Number.isNaN(v)) { if (k === "z") r.z = null; continue; }
      r[k] = k === "x" ? v + base[0] : k === "y" ? v + base[1] : v;
    }
    for (const [k, t] of Object.entries(text)) if (t.codes[i] >= 0) r[k] = t.dict[t.codes[i]];
    if (extras[i]) Object.assign(r, extras[i]);
    rows[i] = r;
  }
  return rows;
}

// the whole `layers` object: only geophys_pts is point-cloud sized
export const compactLayers = (layers) => (layers && Array.isArray(layers.geophys_pts) && layers.geophys_pts.length >= COMPACT_MIN_ROWS ? { ...layers, geophys_pts: compactPointRows(layers.geophys_pts) } : layers);
export const expandLayers = (layers) => (layers && layers.geophys_pts && layers.geophys_pts.__compactRows ? { ...layers, geophys_pts: expandPointRows(layers.geophys_pts) } : layers);
