// TASKS.csv #1986 step 1 — multi-channel TEM line data (airborne or ground time-domain EM: SkyTEM / Aarhus Workbench *_dat.xyz, a Geosoft
// .xyz with array channels such as dBdt_Z[0] … dBdt_Z[29], or a CSV with one column per gate): the channels read as decays, a station's
// decay with its late-time decay constant (tau), and tau at every station for a map. No forward model or inversion here (step 2).
// Lazy: imported by components/TemPane.jsx only.
import { isWorkbenchXyz, parseWorkbenchXyz } from "./fdem.js";
import { parseXYZ } from "./geosoft.js";
import { guessGeophysColumns } from "./geophysColumns.js";
import Papa from "papaparse";
import { arrMax } from "./arrayStats.js";

// A column that ends in a number (dBdt_Z[12], DBDT_CH1GT12, Z_HM_ch05, CH12, Gate_12): its prefix and index. Groups of at least four
// with one prefix are the channels of one decay; the uncertainty / in-use companions (DBDT_STD_CH1GT…, *_INUSE_*) are named so and
// never offered first.
const CH_RE = /^(.*?)(\d+)\]?$/;
const AUX_RE = /std|_sd\b|^sd_|err|unc|inuse|in_use|noise|weight/i;
const NOT_CH = /^(x|y|z|e|n|line|line_no|fid|fiducial|time|date|lat|lon|long|utmx|utmy|elev|elevation|topo|dem|height|alt|record|station|stn)$/i;
export function temChannelGroups(columns) {
  const by = new Map();
  for (const c of columns || []) {
    const m = String(c).match(CH_RE);
    if (!m) continue;
    const prefix = m[1].replace(/\[$/, ""), idx = Number(m[2]);
    if (!prefix || NOT_CH.test(prefix.replace(/[_\-. ]+$/, ""))) continue;
    (by.get(prefix) || by.set(prefix, []).get(prefix)).push({ col: c, idx });
  }
  const out = [];
  for (const [prefix, list] of by) {
    if (list.length < 4) continue;
    list.sort((a, b) => a.idx - b.idx);
    out.push({ prefix, cols: list.map((x) => x.col), idx: list.map((x) => x.idx), aux: AUX_RE.test(prefix) });
  }
  // the data first (not an uncertainty), then the one with the most gates
  return out.sort((a, b) => Number(a.aux) - Number(b.aux) || b.cols.length - a.cols.length);
}

// Numbers in a string: "1.0e-05 2.2e-05, 3.5e-05" -> [..]
export const numbersIn = (s) => (String(s || "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number).filter(Number.isFinite);
// gate times as typed or read, to milliseconds: all under 0.1 are taken as seconds (SkyTEM / Workbench write 1.0e-05 s), else as ms
export function toMs(times) {
  const t = (times || []).filter(Number.isFinite);
  if (!t.length) return [];
  return arrMax(t) < 0.1 ? t.map((v) => +(v * 1000).toPrecision(6)) : t.map((v) => +v.toPrecision(6));
}
// The gate times a file states: a Workbench header key or a "/" comment line naming gates, with at least n increasing positive numbers.
// -> ms, or null
export function gateTimesFromText(text, n, header = null) {
  const pick = (nums) => {
    const pos = nums.filter((v) => v > 0);
    for (let s = 0; s + n <= pos.length; s++) { const w = pos.slice(s, s + n); if (w.every((v, i) => !i || v > w[i - 1])) return toMs(w); }
    return null;
  };
  if (header) for (const [k, v] of Object.entries(header)) if (/GATE/i.test(k)) { const t = pick(numbersIn(v)); if (t) return t; }
  const lines = String(text || "").split(/\r?\n/, 400);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!/^[/#]/.test(l) || !/gate|time.?gates?|window/i.test(l)) continue;
    let nums = numbersIn(l.replace(/^[/#]+/, "").replace(/ch(annel)?\s*\d+|gate\s*\d+|\b\d+\s*gates\b/gi, " "));
    for (let j = i + 1; nums.length < n && j < lines.length && /^[/#]/.test(lines[j].trim()); j++) nums = nums.concat(numbersIn(lines[j].replace(/^[/#\s]+/, "")));
    const t = pick(nums);
    if (t) return t;
  }
  return null;
}

// Read a file's text -> { name, source, n, columns, get(col) -> Float64Array, line: string[], groups, epsg, header, gateTimes(group) }
export function readTemText(text, name = "TEM") {
  let source, columns, get, line, epsg = null, header = null;
  if (isWorkbenchXyz(text)) {
    const w = parseWorkbenchXyz(text);
    source = "Aarhus Workbench / SkyTEM .xyz"; columns = w.cols; header = w.header; epsg = w.epsg;
    get = (c) => w.col[c];
    const L = w.col.LINE_NO || w.col.LINE;
    line = Array.from({ length: w.n }, (_, i) => (L && Number.isFinite(L[i]) ? String(L[i]) : "1"));
  } else if (/^\s*[^/\s][^\n]*,/.test(text) && !/^\s*\//.test(text)) {
    const p = Papa.parse(String(text).trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
    source = "CSV"; columns = p.meta.fields || [];
    const cache = new Map();
    get = (c) => cache.get(c) || cache.set(c, Float64Array.from(p.data, (r) => (typeof r[c] === "number" ? r[c] : NaN))).get(c);
    const lc = guessGeophysColumns(columns).line;
    line = p.data.map((r) => (lc && r[lc] != null ? String(r[lc]) : "1"));
  } else {
    const g = parseXYZ(text);
    source = "Geosoft .xyz"; columns = g.columns;
    const cache = new Map();
    get = (c) => cache.get(c) || cache.set(c, Float64Array.from(g.rows, (r) => (Number.isFinite(r[c]) ? r[c] : NaN))).get(c);
    const lc = guessGeophysColumns(columns).line;
    line = g.rows.map((r) => (r._line != null ? String(r._line) : lc && r[lc] != null ? String(r[lc]) : "1"));
  }
  const n = line.length;
  const groups = temChannelGroups(columns);
  if (!groups.length) throw new Error(`No TEM channels in ${name}: expected four or more columns that share a name and end in a gate number (dBdt_Z[0] …, DBDT_CH1GT1 …, CH01 …).`);
  const cg = guessGeophysColumns(columns);
  const pickCol = (re) => columns.find((c) => re.test(c));
  const xCol = pickCol(/^(utmx|x|easting|east|e)$/i) || cg.x, yCol = pickCol(/^(utmy|y|northing|north|n)$/i) || cg.y;
  const zCol = pickCol(/^(topo|topography|elevation|elev|dem|ground|z)$/i) || null;
  if (!xCol || !yCol) throw new Error(`No X / Y columns in ${name}.`);
  return {
    name, source, n, columns, groups, epsg, header, line,
    x: get(xCol), y: get(yCol), z: zCol ? get(zCol) : null, xCol, yCol, zCol,
    get,
    gateTimes: (g) => gateTimesFromText(text, g.cols.length, header),
  };
}

// One group's values as a station x gate matrix (row-major Float64Array), and each line's stations in order with the distance along it.
export function channelMatrix(data, group) {
  const m = group.cols.length, n = data.n, v = new Float64Array(n * m);
  group.cols.forEach((c, k) => { const a = data.get(c); for (let i = 0; i < n; i++) v[i * m + k] = a[i]; });
  return { m, n, v };
}
export function linesOf(data) {
  const by = new Map();
  for (let i = 0; i < data.n; i++) { if (!Number.isFinite(data.x[i]) || !Number.isFinite(data.y[i])) continue; const k = data.line[i]; (by.get(k) || by.set(k, []).get(k)).push(i); }
  const out = [];
  for (const [key, idx] of by) {
    const d = new Float64Array(idx.length);
    for (let j = 1; j < idx.length; j++) d[j] = d[j - 1] + Math.hypot(data.x[idx[j]] - data.x[idx[j - 1]], data.y[idx[j]] - data.y[idx[j - 1]]);
    out.push({ key, idx, d });
  }
  return out.sort((a, b) => (Number(a.key) - Number(b.key)) || String(a.key).localeCompare(String(b.key)));
}

// The late-time decay constant: ln V = a - t / tau fitted by least squares to the positive readings of the later half of the decay
// (the gates at or after the median time of the positive ones, at least `min` of them). tau in the units of `times` (ms).
// -> { tau, a, from, to, n, r2 } (from / to: the first and last gate index used), or null (too few readings, or no decay)
export function decayTau(times, values, { min = 3 } = {}) {
  const pos = [];
  for (let k = 0; k < Math.min(times.length, values.length); k++) if (values[k] > 0 && Number.isFinite(values[k]) && Number.isFinite(times[k])) pos.push(k);
  if (pos.length < min) return null;
  const tMed = times[pos[Math.floor((pos.length - 1) / 2)]];
  let use = pos.filter((k) => times[k] >= tMed);
  if (use.length < min) use = pos.slice(-min);
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  const N = use.length;
  for (const k of use) { const x = times[k], y = Math.log(values[k]); sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
  const den = N * sxx - sx * sx;
  if (!(den > 0)) return null;
  const b = (N * sxy - sx * sy) / den, a = (sy - b * sx) / N;
  if (!(b < 0)) return null;
  const ssTot = syy - (sy * sy) / N, ssRes = syy - a * sy - b * sxy;
  return { tau: -1 / b, a, from: use[0], to: use[N - 1], n: N, r2: ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1 };
}

// tau at every station -> { tau: Float64Array (NaN where no decay could be fitted), fitted }
export function tauAll(mat, times, opts) {
  const tau = new Float64Array(mat.n).fill(NaN);
  let fitted = 0;
  const row = new Float64Array(mat.m);
  for (let i = 0; i < mat.n; i++) {
    for (let k = 0; k < mat.m; k++) row[k] = mat.v[i * mat.m + k];
    const r = decayTau(times, row, opts);
    if (r && Number.isFinite(r.tau)) { tau[i] = r.tau; fitted++; }
  }
  return { tau, fitted };
}
