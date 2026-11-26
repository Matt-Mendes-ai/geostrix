// TASKS.csv #1986 step 1 — multi-channel TEM line data (airborne or ground time-domain EM: SkyTEM / Aarhus Workbench *_dat.xyz, a Geosoft
// .xyz with array channels such as dBdt_Z[0] … dBdt_Z[29], or a CSV with one column per gate): the channels read as decays, a station's
// decay with its late-time decay constant (tau), and tau at every station for a map. No forward model or inversion here (step 2).
// Lazy: imported by components/TemPane.jsx only.
import { isWorkbenchXyz, parseWorkbenchXyz } from "./fdem.js";
import { parseXYZ } from "./geosoft.js";
import { guessGeophysColumns } from "./geophysColumns.js";
import Papa from "papaparse";
import { arrMax } from "./arrayStats.js";
import { boreholeEmRefusal, boreholeHeaderRefusal } from "./boreholeEm.js"; // TASKS.csv #3804
import { isCronePemSurface, parseCronePemSurface, loopSpan } from "./cronePem.js"; // TASKS.csv #4079 — Crone surface PEM and STP
import { isReceiverTem, parseTemReceiver, isSmartemTipText } from "./maxwellTem.js"; // TASKS.csv #4058 — Maxwell ground TEM, one row per component; #4063 — the other receiver layouts (Crone, SMARTem V / export, EMBASE)
import { t as tr } from "./i18n.js";
import { smallGridCoordinates } from "./crsFromColumns.js"; // #4058 — a file on a local grid asks for its tie to the map

// A column that ends in a number (dBdt_Z[12], DBDT_CH1GT12, Z_HM_ch05, CH12, Gate_12): its prefix and index. Groups of at least four
// with one prefix are the channels of one decay; the uncertainty / in-use companions (DBDT_STD_CH1GT…, *_INUSE_*) are named so and
// never offered first.
const CH_RE = /^(.*?)(\d+)\]?$/;
const AUX_RE = /std|_sd\b|^sd_|err|unc|inuse|in_use|noise|weight/i;
// TASKS.csv #3440 (the first real TEM file read: USGS Yellowstone 2016 SkyTEM, doi:10.5066/P9LVAU7W) — an Aarhus-processed CSV carries, beside the
// decays (LM_Data[i], HM_Data[i]), their gate times (LM_Time[i]) and the inversion's model (RHO_I[i], THK[i], DEP_TOP[i], FWD_*): the decays
// are offered first, and the times read as the gate times
const TIME_RE = /time|gate_?t|^t_?gate/i, MODEL_RE = /^(rho|res|resistivity|thk|thick|dep|depth|cond|sigma|fwd|inv|mod)|fwd|_inv\b|model/i;
const roleOf = (prefix) => (AUX_RE.test(prefix) ? "aux" : TIME_RE.test(prefix) ? "time" : MODEL_RE.test(prefix) ? "model" : "data");
const ROLE_ORDER = { data: 0, aux: 1, time: 2, model: 3 };
// no-data values written as numbers (-9999 in the USGS file, -10000 beside it, Geosoft's *: already null)
export const isNoData = (v) => v === -9999 || v === -99999 || v === -10000 || v === -999999 || Math.abs(v) >= 1e30;
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
    const role = roleOf(prefix);
    out.push({ prefix, cols: list.map((x) => x.col), idx: list.map((x) => x.idx), aux: role === "aux", role });
  }
  // the data first (not an uncertainty), then the one with the most gates
  return out.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.cols.length - a.cols.length);
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
export function gateTimesFromText(text, n, header = null, channel = null) {
  const pick = (nums) => {
    const pos = nums.filter((v) => v > 0);
    for (let s = 0; s + n <= pos.length; s++) { const w = pos.slice(s, s + n); if (w.every((v, i) => !i || v > w[i - 1])) return toMs(w); }
    return null;
  };
  // TASKS.csv #3441 — a two-moment file states a gate list for each channel ('GATE TIMES CHANNEL 1', '… CHANNEL 2'): the group's own, by its channel number
  if (header) {
    const entries = Object.entries(header).filter(([k]) => /GATE/i.test(k));
    const mine = channel != null ? entries.filter(([k]) => new RegExp("(?:CHANNEL|CH)\\s*0*" + channel + "\\b", "i").test(k)) : [];
    for (const [, v] of mine.length ? mine : entries) { const t = pick(numbersIn(v)); if (t) return t; }
  }
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
  try { return readTemTextCore(text, name); } catch (e) { // TASKS.csv #4063 — a hole's file the reader cannot read says why it is not read
    const bh = /is borehole EM/.test(e?.message || "") ? null : boreholeHeaderRefusal(name, String(text || "").slice(0, 6000)); // the reader's own borehole refusal says more (its decay channels)
    throw bh ? new Error(bh, { cause: e }) : e;
  }
}
function readTemTextCore(text, name) {
  // TASKS.csv #4077 — a SMARTem24 TIP file is induced polarisation, not TEM: said, with where to open it (it used to be read as TEM, its IP decay as channels)
  if (isSmartemTipText(text)) throw new Error(tr("\"{name}\" is a SMARTem IP (TIP) file, not TEM: open it in the DC / IP line pane.", { name }) /* #4081 — shorter */);
  let source, columns, get, line, epsg = null, header = null, maxwell = null;
  if (isCronePemSurface(text) || isReceiverTem(text)) { // TASKS.csv #4058 — a station's Z, X and Y rows become the channel sets Z_CH, X_CH, Y_CH of one station row (Z first: the decay and the 1D inversion read it)
    maxwell = isCronePemSurface(text) ? parseCronePemSurface(text, name) : parseTemReceiver(text); // #4079 — a Crone surface PEM / STP profile: its stations at their <Pnn> positions, its loop
    const st = maxwell.stations, fns = new Map([["EAST", (s) => s.x], ["NORTH", (s) => s.y], ["ELEV", (s) => s.elev], ["STATION", (s) => s.station]]);
    columns = ["EAST", "NORTH", "ELEV", "STATION"];
    for (const c of maxwell.components) maxwell.gates.forEach((g, k) => { const col = `${c}_${g}`; columns.push(col); fns.set(col, (s) => (s.comps[c] ? s.comps[c][k] : NaN)); });
    source = maxwell.sourceLabel || `${maxwell.family === "Maxwell" ? "Maxwell .tem" : maxwell.family === "TEM" ? "TEM text" : `${maxwell.family} TEM text`}${maxwell.config ? ` (${maxwell.config.toLowerCase()})` : ""}`; header = maxwell.header;
    const cache = new Map();
    get = (c) => cache.get(c) || cache.set(c, Float64Array.from(st, fns.get(c) || (() => NaN))).get(c);
    line = st.map((s) => s.line);
  } else if (isWorkbenchXyz(text)) {
    const w = parseWorkbenchXyz(text);
    source = "Aarhus Workbench / SkyTEM .xyz"; columns = w.cols; header = w.header; epsg = w.epsg;
    get = (c) => w.col[c];
    const L = w.col.LINE_NO || w.col.LINE;
    line = Array.from({ length: w.n }, (_, i) => (L && Number.isFinite(L[i]) ? String(L[i]) : "1"));
  } else if (/^\s*[^/\s][^\n]*,/.test(text) && !/^\s*\//.test(text)) {
    const p = Papa.parse(String(text).trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
    source = "CSV"; columns = p.meta.fields || [];
    const cache = new Map();
    get = (c) => cache.get(c) || cache.set(c, Float64Array.from(p.data, (r) => (typeof r[c] === "number" && !isNoData(r[c]) ? r[c] : NaN))).get(c);
    const lc = guessGeophysColumns(columns).line;
    line = p.data.map((r) => (lc && r[lc] != null ? String(r[lc]) : "1"));
  } else {
    const g = parseXYZ(text);
    source = "Geosoft .xyz"; columns = g.columns;
    const cache = new Map();
    get = (c) => cache.get(c) || cache.set(c, Float64Array.from(g.rows, (r) => (Number.isFinite(r[c]) && !isNoData(r[c]) ? r[c] : NaN))).get(c);
    const lc = guessGeophysColumns(columns).line;
    line = g.rows.map((r) => (r._line != null ? String(r._line) : lc && r[lc] != null ? String(r[lc]) : "1"));
  }
  const n = line.length;
  const groups = temChannelGroups(columns);
  if (maxwell) for (const g of groups) { const m = /^([XYZ])_CH$/.exec(g.prefix); if (m) g.component = m[1]; } // #4058
  if (!groups.length) throw new Error(`No TEM channels in ${name}: expected four or more columns that share a name and end in a gate number (dBdt_Z[0] …, DBDT_CH1GT1 …, CH01 …).`);
  const cg = guessGeophysColumns(columns);
  const pickCol = (re) => columns.find((c) => re.test(c));
  // a map-grid name first ('E_UTM12N', 'X_MGA'), never a tilt, angle or uncertainty column (the USGS file's TILT_X was taken as X)
  const notXY = (c) => !c || /tilt|angle|pitch|roll|std|err|yaw/i.test(c) ? null : c;
  const xCol = pickCol(/^(utmx|x|easting|east|e)$/i) || pickCol(/^(e|x|east(ing)?)[_ -]?(utm|mga|nad|wgs|gda|grid)[_ -]?\d*[a-z]?$/i) || notXY(cg.x);
  const yCol = pickCol(/^(utmy|y|northing|north|n)$/i) || pickCol(/^(n|y|north(ing)?)[_ -]?(utm|mga|nad|wgs|gda|grid)[_ -]?\d*[a-z]?$/i) || notXY(cg.y);
  const zCol = pickCol(/^(topo|topography|elevation|elev|dem|ground|z)$/i) || pickCol(/^y?top(o|bath)|^dem[_\d]|elevation|^ground_?el/i) || null; // #3440: the USGS file's Ytopbathv2
  if (!xCol || !yCol) throw new Error(`No X / Y columns in ${name}.`);
  { // TASKS.csv #3804 — borehole EM (components per station, a hole column, a header that says borehole) is not a line survey: refused, as the other imports refuse it
    // #4058 — only borehole evidence refuses it (a hole / depth column, a borehole header or CONFIG, readings down one X Y): the elevation goes in too
    const xs = get(xCol), ys = get(yCol), zs = zCol ? get(zCol) : null, m = Math.min(n, 4000), rows = Array.from({ length: m }, (_, i) => ({ [xCol]: xs[i], [yCol]: ys[i], ...(zs ? { [zCol]: zs[i] } : {}) }));
    const bh = boreholeEmRefusal(name, maxwell ? maxwell.columns : columns, rows, String(text || "").slice(0, 6000));
    if (bh) throw new Error(bh);
  }
  const x = get(xCol), y = get(yCol);
  let z = zCol ? get(zCol) : null;
  if (maxwell && z && !z.some((v) => Number.isFinite(v) && v !== 0)) z = null; // Maxwell writes ELEV 0.000 when the surveyor gave none
  // #4058 — eastings no UTM / MGA zone has: a local grid. The pane asks for its tie to the map instead of plotting it at the wrong place.
  const pts = []; for (let i = 0; i < n && pts.length < 5000; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) pts.push({ x: x[i], y: y[i] });
  const localGrid = epsg ? null : smallGridCoordinates(pts);
  return {
    name, source, n, columns, groups, epsg, header, line,
    x, y, z, xCol, yCol, zCol: z ? zCol : null, localGrid,
    components: maxwell ? maxwell.components : null, units: maxwell?.units || null, loop: maxwell?.loop || null, stepResponse: !!maxwell?.stepResponse /* #4079 */,
    notes: maxwell ? receiverNotes(maxwell) : [],
    get,
    gateTimes: (g) => (maxwell && g.component && maxwell.times) || gateTimesFromText(text, g.cols.length, header, channelNumber(g.prefix)) || gateTimesFromColumns(groups, g, get),
  };
}

// TASKS.csv #4063 — what a receiver-text file did not give, said: no coordinates (placed on the line), no named component, a second ADC left out, no gate times
function receiverNotes(m) {
  const out = [];
  if (m.positions === "line" && m.positionNote) out.push(tr("No coordinates: placed along their line."));
  if (m.assumedComponent) out.push(tr("Component unnamed: Z assumed."));
  if (m.adcLeftOut) out.push(tr("{n} second-ADC reading(s) left out.", { n: m.adcLeftOut.toLocaleString() }));
  const sp = loopSpan(m.loop); // #4079 — a surface PEM file's transmitter loop
  if (sp) out.push(tr("Loop: {n} corners.", { n: m.loop.length }));
  return out;
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
    const r = decayTau(times, opts?.prepare ? opts.prepare(i, row) : row, opts); // prepare: #3441 — the readings in the noise left out
    if (r && Number.isFinite(r.tau)) { tau[i] = r.tau; fitted++; }
  }
  return { tau, fitted };
}

// the channel number in a group's prefix ('DBDT_CH2GT' -> 2, 'Z_HM_ch05_' -> 5), else null
export const channelNumber = (prefix) => { const m = String(prefix).match(/ch(?:annel)?_?0*(\d+)/i); return m ? Number(m[1]) : null; };

// TASKS.csv #3441 — a two-moment system (SkyTEM low and high moment) joined into one decay: the gates of both groups sorted by time (a stable sort, so
// where the moments overlap in time the low moment's reading comes first). a, b: { mat, times, cols } -> { mat, times, cols, from: [0 | 1, gate] each }
export function joinMatrices(a, b) {
  const items = [];
  a.times.forEach((t, k) => items.push({ t, s: 0, k })); b.times.forEach((t, k) => items.push({ t, s: 1, k }));
  items.sort((x, y) => x.t - y.t || x.s - y.s);
  const n = a.mat.n, m = items.length, v = new Float64Array(n * m);
  items.forEach((it, j) => { const src = it.s ? b.mat : a.mat; for (let i = 0; i < n; i++) v[i * m + j] = src.v[i * src.m + it.k]; });
  return { mat: { m, n, v }, times: items.map((x) => x.t), cols: items.map((x) => (it0(x, a, b))), from: items.map((x) => [x.s, x.k]) };
}
const it0 = (x, a, b) => (x.s ? b.cols[x.k] : a.cols[x.k]);

// The uncertainty columns of a data group: the aux group with the same prefix once STD / SD / error words are taken out ('DBDT_STD_CH1GT' for 'DBDT_CH1GT'), the same count
export function noiseGroupFor(groups, group) {
  const strip = (p) => String(p).toLowerCase().replace(/_?(std|sd|err|error|unc|uncertainty|noise)_?/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""); // 'LM_DataSTD' -> 'lm_data' (#3440)
  return (groups || []).find((g) => g.aux && g !== group && g.cols.length === group.cols.length && strip(g.prefix) === strip(group.prefix)) || null;
}

// A reading is left out of the fit when it is under the noise floor (data units), or its uncertainty is over `maxUnc` of it
// (stdKind 'relative': the STD column is a fraction of the reading; 'absolute': in the data's units, so the ratio is STD / |reading|).
// -> a copy of values with the rejected readings as NaN, and how many went
export function maskNoisy(values, noise, { floor = null, maxUnc = null, stdKind = "relative" } = {}) {
  const out = Float64Array.from(values);
  let dropped = 0;
  for (let k = 0; k < out.length; k++) {
    const v = out[k];
    if (!Number.isFinite(v)) continue;
    let bad = false;
    if (floor != null && Math.abs(v) < floor) bad = true;
    if (!bad && maxUnc != null && noise) { const sd = Math.abs(noise[k]); if (Number.isFinite(sd)) bad = (stdKind === "relative" ? sd : sd / Math.max(Math.abs(v), 1e-300)) > maxUnc; }
    if (bad) { out[k] = NaN; dropped++; }
  }
  return { values: out, dropped };
}

// TASKS.csv #3440 — gate times kept as columns (the USGS / Aarhus CSV: LM_Time[i] beside LM_Data[i]): the time set of the same moment (the
// same first word: LM, HM), else the only time set of that size; the first station where every time is a number. -> ms, or null
export function gateTimesFromColumns(groups, g, get) {
  const times = (groups || []).filter((t) => t.role === "time" && t.cols.length === g.cols.length);
  if (!times.length) return null;
  const word = (pfx) => String(pfx).split(/[_\s]/)[0].toLowerCase();
  const t = times.find((x) => word(x.prefix) === word(g.prefix)) || (times.length === 1 ? times[0] : null);
  if (!t) return null;
  const cols = t.cols.map((c) => get(c));
  const n = cols[0]?.length || 0;
  for (let i = 0; i < n; i++) {
    const row = cols.map((a) => a[i]);
    if (row.every((v) => Number.isFinite(v) && v > 0) && row.every((v, k) => !k || v > row[k - 1])) return toMs(row);
  }
  return null;
}
// TASKS.csv #3440 — what a set of uncertainty columns holds. The real USGS / Aarhus export gives dB/dt's standard deviation in the data's own
// unit, and in SI (1e-9 to 1e-12 V / (A m^4), though its dictionary says pV): every value is under 1, so size alone cannot tell it from a
// fraction. An absolute uncertainty falls with the decay (by decades over a station's gates); a relative one stays near a few per cent.
// noise: { m, n, v } (the STD matrix; a plain array is read as values only), any value over 1.5 is absolute.
// -> "absolute" | "relative"
export function stdKindGuess(noise) {
  const v = noise?.v || noise || [];
  for (const x of v) if (Number.isFinite(x) && Math.abs(x) > 1.5) return "absolute";
  if (!noise?.m || !noise?.n) return "relative";
  const spans = [];
  const step = Math.max(1, Math.floor(noise.n / 200));
  for (let i = 0; i < noise.n; i += step) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < noise.m; k++) { const x = Math.abs(v[i * noise.m + k]); if (x > 0 && Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } }
    if (hi > lo) spans.push(Math.log10(hi / lo));
  }
  if (!spans.length) return "relative";
  spans.sort((a, b) => a - b);
  return spans[Math.floor(spans.length / 2)] > 1 ? "absolute" : "relative"; // a station's uncertainties spanning a decade or more
}
