// TASKS.csv #1986 — ground loop-loop FDEM (frequency-domain EM) soundings for the 1D inversion (python-sidecar/app/geophys/em1d.py):
// what a file holds, laid out as soundings with one value per coil pair.
//   - DUALEM CSV (the DUALEM app, raw or combined): H<s>mS_m / P<s>mS_m apparent conductivity per coil pair; H = horizontal
//     coplanar at s m, P = perpendicular at s + 0.1 m (DUALEM-421: 1, 2, 4 m), 9 kHz.
//   - GEM-2 CSV (Geophex EMExport): I_<f>Hz / Q_<f>Hz in-phase and quadrature (ppm) per frequency, one coil pair 1.66 m apart.
//     The in-phase carries instrument offsets and the magnetic-susceptibility response: off by default (Aarhus Workbench did the same
//     with the USGS Indiana data), quadrature only.
//   - Aarhus Workbench XYZ exports: *_dat.xyz (the processed data an inversion used: RhoA_<i> apparent resistivity, or ImagPPM_<i> /
//     RealPPM_<i>) and *_inv.xyz (its models: RHO_<i> per layer, DEP_TOP / DEP_BOT, DOI). An inversion result read as a result.
// Pure: no React. Readings are averaged into soundings every `spacing` metres along the path (the raw files log several a second).
const num = (v) => { const t = String(v ?? "").trim().replace(/^\+/, ""); if (t === "") return NaN; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

// ---- Aarhus Workbench XYZ -----------------------------------------------------------------------------------------------
// "/KEY" then "/value" pairs, then "/ LINE_NO UTMX ..." and whitespace-separated rows; DUMMY marks a missing value
export function isWorkbenchXyz(text) {
  return /^\s*\/INFO\s*[\r\n]+\s*\/[^\n]*Workbench/i.test(String(text).slice(0, 400));
}
export function parseWorkbenchXyz(text) {
  const lines = String(text).split(/\r?\n/);
  const header = {};
  let cols = null, key = null;
  const rows = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith("/")) {
      const t = l.slice(1).trim();
      if (/^LINE_NO\b/i.test(t)) cols = t.split(/\s+/);
      else if (cols) continue;
      else if (key === null) key = t.toUpperCase();
      else { header[key] = t; key = null; }
      continue;
    }
    if (!cols) continue;
    rows.push(l.split(/\s+/).map(Number));
  }
  if (!cols) throw new Error("No column header (a line starting \"/ LINE_NO\") in this Workbench export.");
  const dummy = num(header.DUMMY);
  const col = {};
  cols.forEach((c, i) => { col[c] = Float64Array.from(rows, (r) => (r[i] === dummy || !Number.isFinite(r[i]) ? NaN : r[i])); });
  const epsg = Number((String(header["COORDINATE SYSTEM"] || "").match(/epsg:?\s*(\d{4,5})/i) || [])[1]) || null;
  return { header, cols, col, n: rows.length, epsg };
}
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
// Workbench's coil list: "VMD, VMD  VMD, HMD-x ..." (transmitter, receiver per channel)
function workbenchCoils(h) {
  const freqs = words(h.FREQUENCIES).map(Number), seps = words(h["COIL SEPARATIONS"]).map(Number);
  const pairs = String(h["COIL CONFIGURATIONS"] || "").split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  return freqs.map((f, i) => {
    const p = (pairs[i] || "VMD, VMD").toUpperCase().replace(/\s+/g, "");
    const geom = p === "VMD,VMD" ? "HCP" : p === "VMD,HMD-X" ? "PRP" : p === "HMD,HMD" || p === "HMD-Y,HMD-Y" ? "VCP" : null;
    return { geom, sep: seps[i], freq: f, use: !!geom };
  });
}
const stationsOf = (w) => ({
  line: Array.from(w.col.LINE_NO || new Float64Array(w.n)), x: Array.from(w.col.UTMX || []), y: Array.from(w.col.UTMY || []),
  z: Array.from(w.col.ELEVATION || new Float64Array(w.n).fill(NaN)),
});
// a *_dat.xyz: the processed data -> a survey ready to invert
export function fdemFromWorkbenchDat(w, name = "") {
  const coils = workbenchCoils(w.header), C = coils.length;
  const rhoa = w.cols.includes("RhoA_1"), ppm = w.cols.includes("ImagPPM_1");
  if (!rhoa && !ppm) throw new Error("This Workbench export has no data columns (RhoA_1 or ImagPPM_1): an *_inv.xyz holds models, read it as an inversion result.");
  const data = [];
  for (let k = 0; k < w.n; k++) {
    const row = [];
    for (let i = 1; i <= C; i++) {
      if (rhoa) { const r = w.col[`RhoA_${i}`][k]; row.push(r > 0 ? 1000 / r : null); } // apparent resistivity (Ohm m) -> conductivity (mS/m)
      else { const re = w.col[`RealPPM_${i}`]?.[k], im = w.col[`ImagPPM_${i}`][k]; row.push(Number.isFinite(re) ? re : null, Number.isFinite(im) ? im : null); }
    }
    data.push(row);
  }
  if (!rhoa) { // a channel whose in-phase is missing everywhere (Workbench left it out) is quadrature only
    coils.forEach((c, i) => { c.inphase = data.some((r) => r[2 * i] != null); });
  }
  return { name, source: "Aarhus Workbench data", kind: rhoa ? "eca" : "ppm", coils, stations: stationsOf(w), data, epsg: w.epsg, height: null, resampled: true };
}
// a *_inv.xyz: Workbench's models, in the shape of an inversion result
export function fdemFromWorkbenchInv(w, name = "") {
  const N = Number(w.header["NUMBER OF LAYERS"]) || w.cols.filter((c) => /^RHO_\d+$/.test(c)).length;
  if (!N || !w.cols.includes("RHO_1")) throw new Error("This Workbench export has no models (RHO_1 ...): a *_dat.xyz holds data, read it to invert.");
  const bot = []; for (let i = 1; i < N; i++) bot.push(w.col[`DEP_BOT_${i}`]?.find(Number.isFinite));
  const thick = bot.map((b, i) => b - (i ? bot[i - 1] : 0));
  const condMs = [], doi = [], chi = [];
  for (let k = 0; k < w.n; k++) {
    const row = [];
    for (let i = 1; i <= N; i++) { const r = w.col[`RHO_${i}`][k]; row.push(r > 0 ? 1000 / r : null); }
    condMs.push(row);
    doi.push(Number.isFinite(w.col.DOI_STANDARD?.[k]) ? w.col.DOI_STANDARD[k] : null);
    chi.push(Number.isFinite(w.col.RESDATA?.[k]) ? w.col.RESDATA[k] : null);
  }
  return { name, source: "Aarhus Workbench models", stations: stationsOf(w), epsg: w.epsg, result: { thick, condMs, doi, chi, pred: null, from: "workbench" } };
}

// ---- instrument CSVs -----------------------------------------------------------------------------------------------------
function splitCsv(text) {
  const lines = String(text).split(/\r?\n/);
  // the header: the first line naming coil channels (a citation or notes above it are skipped)
  const hi = lines.findIndex((l, i) => i < 200 && /(^|,)\/?([HP]\d+(\.\d+)?mS_m|I_\d+Hz)\s*(,|$)/i.test(l));
  if (hi < 0) return null;
  const headers = lines[hi].split(",").map((h) => h.trim().replace(/^\//, ""));
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) { const l = lines[i]; if (l.trim()) rows.push(l.split(",")); }
  return { headers, rows, skipped: hi };
}
export function isFdemCsv(text) { return !!splitCsv(String(text).slice(0, 200000)); }

// -> { name, source, instrument, kind, coils, readings: { x?, y?, lon?, lat?, z, line, t }, data } (one row per reading)
export function fdemFromCsv(text, name = "") {
  const t = splitCsv(text);
  if (!t) throw new Error("No DUALEM (H1mS_m, P1mS_m ...) or GEM-2 (I_1530Hz, Q_1530Hz ...) columns in this file.");
  const { headers, rows } = t;
  const ix = (re) => headers.findIndex((h) => re.test(h));
  const col = (i) => (i < 0 ? null : rows.map((r) => num(r[i])));
  let coils = [], data, kind, instrument;
  const hp = headers.map((h, i) => { const m = h.match(/^([HP])(\d+(?:\.\d+)?)mS_m$/i); return m ? { i, geom: m[1].toUpperCase() === "H" ? "HCP" : "PRP", s: Number(m[2]) } : null; }).filter(Boolean);
  if (hp.length) {
    instrument = "DUALEM"; kind = "eca";
    hp.sort((a, b) => a.s - b.s || (a.geom === "HCP" ? -1 : 1));
    coils = hp.map((c) => ({ geom: c.geom, sep: c.geom === "PRP" ? +(c.s + 0.1).toFixed(2) : c.s, freq: 9000, use: true }));
    const cs = hp.map((c) => col(c.i));
    data = rows.map((_, k) => cs.map((a) => (Number.isFinite(a[k]) ? a[k] : null)));
  } else {
    const fq = headers.map((h, i) => { const m = h.match(/^Q_(\d+(?:\.\d+)?)Hz$/i); return m ? { qi: i, ii: headers.findIndex((g) => g.toLowerCase() === `i_${m[1]}hz`), f: Number(m[1]) } : null; }).filter(Boolean).sort((a, b) => a.f - b.f);
    if (!fq.length) throw new Error("No DUALEM (H1mS_m ...) or GEM-2 (Q_1530Hz ...) columns in this file.");
    instrument = "GEM-2"; kind = "ppm";
    coils = fq.map((c) => ({ geom: "HCP", sep: 1.66, freq: c.f, use: true, inphase: false }));
    const qs = fq.map((c) => col(c.qi)), is = fq.map((c) => col(c.ii));
    data = rows.map((_, k) => fq.flatMap((c, j) => [is[j] && Number.isFinite(is[j][k]) ? is[j][k] : null, Number.isFinite(qs[j][k]) ? qs[j][k] : null]));
  }
  const lat = col(ix(/^LAT(d|itude)?$/i)), lon = col(ix(/^LON(d|g|gitude)?$/i));
  const x = col(ix(/^(X|UTMX|Easting|E)$/i)), y = col(ix(/^(Y|UTMY|Northing|N)$/i));
  const zi = [ix(/^dem_elevation_m$/i), ix(/^(ELEVATION|Elev|Z)$/i), ix(/^(ALTm|GPSalt)$/i)].find((i) => i >= 0) ?? -1;
  const line = col(ix(/^Line$/i));
  return {
    name, source: `${instrument} CSV`, instrument, kind, coils, data,
    readings: { x, y, lat, lon, z: col(zi), zFrom: zi >= 0 ? headers[zi] : null, line, n: rows.length },
  };
}

// readings -> soundings: consecutive readings averaged per `spacing` m of path (NaN-aware), a new line or a jump over `gapM`
// starting a new segment. xy: [[x, y]] in the project CRS. -> { stations: { line, x, y, z, n }, data }
export function resampleAlongPath(xy, z, line, data, { spacing = 1, gapM = 25 } = {}) {
  const out = { line: [], x: [], y: [], z: [], n: [] }, outData = [];
  const W = data[0]?.length || 0;
  let acc = null, dist = 0, seg = 0;
  const flush = () => {
    if (!acc || !acc.n) return;
    out.line.push(acc.line); out.x.push(acc.x / acc.n); out.y.push(acc.y / acc.n); out.z.push(acc.zn ? acc.z / acc.zn : null); out.n.push(acc.n);
    outData.push(acc.s.map((s, j) => (acc.c[j] ? s / acc.c[j] : null)));
  };
  for (let k = 0; k < xy.length; k++) {
    const [px, py] = xy[k];
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const ln = line ? line[k] : 0;
    if (k && acc) {
      const step = Math.hypot(px - acc.lx, py - acc.ly);
      if (ln !== acc.ln || step > gapM) { flush(); acc = null; dist = 0; seg++; } // acc.ln: the file's line; acc.line: the stretch's label
      else dist += step;
    }
    const bin = Math.floor(dist / spacing);
    if (!acc || acc.bin !== bin) { flush(); acc = { bin, ln, line: line ? ln : seg, x: 0, y: 0, z: 0, zn: 0, n: 0, s: new Array(W).fill(0), c: new Array(W).fill(0) }; }
    acc.x += px; acc.y += py; acc.n++; acc.lx = px; acc.ly = py;
    if (Number.isFinite(z?.[k])) { acc.z += z[k]; acc.zn++; }
    const r = data[k];
    for (let j = 0; j < W; j++) if (r[j] != null && Number.isFinite(r[j])) { acc.s[j] += r[j]; acc.c[j]++; }
  }
  flush();
  return { stations: out, data: outData };
}

// distance along each line (m), restarting at each line
export function alongLine(st) {
  const d = new Array(st.x.length).fill(0);
  for (let k = 1; k < d.length; k++) d[k] = st.line[k] === st.line[k - 1] ? d[k - 1] + Math.hypot(st.x[k] - st.x[k - 1], st.y[k] - st.y[k - 1]) : 0;
  return d;
}

// the request the sidecar's em1d job takes: the coils in use (GEM-2 in-phase only where switched on), every `every`-th sounding
export function em1dRequest(survey, { height, errRel, errAbs, layers, lateral = 0, every = 1, gapM = 25 }) {
  const used = survey.coils.map((c, i) => ({ c, i })).filter(({ c }) => c.use);
  const pick = [];
  for (let k = 0; k < survey.data.length; k += Math.max(1, every)) pick.push(k);
  const data = pick.map((k) => {
    const r = survey.data[k];
    return survey.kind === "eca" ? used.map(({ i }) => r[i]) : used.flatMap(({ c, i }) => [c.inphase ? r[2 * i] : null, r[2 * i + 1]]);
  });
  const st = survey.stations;
  return {
    pick, request: {
      coils: used.map(({ c }) => ({ geom: c.geom, sep: Number(c.sep), freq: Number(c.freq) })), height: Number(height), kind: survey.kind, data,
      errRel, errAbs, layers, lateral, gapM, window: 3,
      line: pick.map((k) => st.line[k]), x: pick.map((k) => st.x[k]), y: pick.map((k) => st.y[k]),
    },
  };
}

// the models as points at depth for the 3D View: one per layer above the depth of investigation (or all), at the layer's middle,
// z = ground elevation - depth; value log10 conductivity (mS/m). Soundings with no elevation are skipped (counted). Past maxPoints
// every `every`-th sounding is drawn (all its layers): 16,979 GEM-2 soundings made 216,000 points, 15 MB in the project file.
export const MAX_MODEL_POINTS = 100000;
export function modelPoints(stations, result, { pick = null, src = "FDEM 1D", aboveDoi = true, maxPoints = MAX_MODEL_POINTS } = {}) {
  const all = modelPointsAll(stations, result, { pick, src, aboveDoi });
  if (all.rows.length <= maxPoints) return { ...all, every: 1 };
  const every = Math.ceil(all.rows.length / maxPoints);
  const rows = all.rows.filter((r) => r._j % every === 0);
  return { rows, noZ: all.noZ, every };
}
function modelPointsAll(stations, result, { pick, src, aboveDoi }) {
  const tops = [0]; for (const t of result.thick) tops.push(tops[tops.length - 1] + t);
  const N = result.thick.length + 1, last = tops[N - 1] + (result.thick[N - 2] || 1);
  const rows = [];
  let noZ = 0;
  result.condMs.forEach((c, j) => {
    const k = pick ? pick[j] : j, z0 = stations.z[k];
    if (!Number.isFinite(z0)) { if (c.some((v) => v != null)) noZ++; return; }
    const doi = result.doi?.[j];
    for (let i = 0; i < N; i++) {
      const v = c[i];
      if (v == null || !(v > 0)) continue;
      const mid = i < N - 1 ? (tops[i] + tops[i + 1]) / 2 : (tops[i] + last) / 2;
      if (aboveDoi && Number.isFinite(doi) && mid > doi) break;
      rows.push({ x: stations.x[k], y: stations.y[k], z: +(z0 - mid).toFixed(2), value: +Math.log10(v).toFixed(4), depth: +mid.toFixed(2), _src: src });
      Object.defineProperty(rows[rows.length - 1], "_j", { value: j, enumerable: false }); // the sounding, for thinning (not saved)
    }
  });
  return { rows, noZ };
}
