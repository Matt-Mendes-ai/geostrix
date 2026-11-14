// TASKS.csv #3440 (step 3 of 3) — what TEM line data's 1D inversion needs from the pane, in pure functions: the two things a file rarely says
// and that change the answer (when the gate times start, and the data's unit), each guessed with its reason; the system's waveform from a
// preset (approximate: the real numbers are in the survey's logistics report); the job request (lib: python-sidecar/app/geophys/tem1d.py
// run_job); and the finished stations gathered from the progress events, so a cancelled run keeps them.
import { channelMatrix } from "./temLines.js";

// The current waveform per moment: a long on-time (a sharp switch-on, then flat), a linear ramp-off ending at t = 0. Approximate shapes for a
// first model, NOT a system's real waveform (SkyTEM / VTEM / a ground transmitter each have their own; the report gives them).
export const WAVEFORM_PRESETS = {
  step: { label: "Ideal step-off", onMs: null, rampUs: 0 },
  airLow: { label: "Airborne, low moment (approximate)", onMs: 0.8, rampUs: 5 },
  airHigh: { label: "Airborne, high moment (approximate)", onMs: 4, rampUs: 40 },
  ground: { label: "Ground loop (approximate)", onMs: 10, rampUs: 50 },
};
// -> [[t (s), I], …] ending at t = 0 with the current off, or null for an ideal step-off
export function waveformFrom(onMs, rampUs) {
  if (!(onMs > 0)) return null;
  const r = Math.max(0, Number(rampUs) || 0) * 1e-6, on = onMs * 1e-3;
  if (!(r > 0)) return [[-on - 1e-6, 0], [-on, 1], [-1e-7, 1], [0, 0]];
  return [[-(on + r) - 1e-6, 0], [-(on + r), 1], [-r, 1], [0, 0]];
}

// When the file's gate times start. Aarhus-processed exports (Workbench .xyz, and CSVs with time columns such as the USGS SkyTEM releases)
// measure them from the START of the ramp-down; times typed or read from a comment are taken as from the end of the turn-off.
// data: readTemText's result; group: the channel set. -> { zero: "rampStart" | "rampEnd", reason }
export function timeZeroGuess(data, group) {
  const timeCols = (data?.groups || []).some((g) => g.role === "time" && g.cols.length === group?.cols?.length);
  if (timeCols) return { zero: "rampStart", reason: "The gate times are columns of an Aarhus-processed export (as the USGS SkyTEM releases), which measure them from the start of the ramp-down." };
  if (/Workbench/i.test(data?.source || "")) return { zero: "rampStart", reason: "Aarhus Workbench measures gate times from the start of the ramp-down." };
  return { zero: "rampEnd", reason: "The times were typed or read from a comment: taken as from the end of the turn-off." };
}

// The data's unit: dB/dt per unit moment and receiver area is about 1e-6 to 1e-15 V / (A m^4) in SI, the same x 1e12 in pV. The median of
// the earliest gate with readings decides. -> { unit: "SI" | "pV", reason, early }
export function unitGuess(mat) {
  const m = mat?.m || 0, n = mat?.n || 0;
  for (let k = 0; k < m; k++) {
    const v = [];
    for (let i = 0; i < n; i++) { const x = Math.abs(mat.v[i * m + k]); if (x > 0 && Number.isFinite(x)) v.push(x); }
    if (v.length >= Math.max(3, n / 10)) {
      v.sort((a, b) => a - b);
      const med = v[Math.floor(v.length / 2)];
      return med < 1e-3
        ? { unit: "SI", reason: "The earliest gate reads about {v}: SI, V/(A·m⁴) (in pV it would be over 1).", early: med }
        : { unit: "pV", reason: "The earliest gate reads about {v}: pV/(A·m⁴) (in SI it would be under 0.001).", early: med };
    }
  }
  return { unit: "pV", reason: "No early readings to judge by: taken as pV/(A·m⁴).", early: null };
}

// A column of the system's height above the ground at each station (SkyTEM: TX_ALTITUDE, ALT, INVALT), else null
export function heightColumn(columns) {
  const cs = columns || [];
  for (const re of [/^tx_?alt(itude)?$/i, /^alt(itude)?$/i, /^(height|agl|radar_?alt(imeter)?|laser_?alt(imeter)?)$/i, /^inv_?alt$/i]) { const c = cs.find((x) => re.test(String(x))); if (c) return c; }
  return null;
}

// The job request. moments: [{ group, times (ms, the file's), waveform, rampUs }] (one, or two joined); timeZero: "rampStart" | "rampEnd";
// unit: "SI" | "pV"; noise: { use, kind ("absolute" | "relative") } with the moments' uncertainty matrices (or null); every: 1, 2, 5 …;
// heightsCol; system { geom, r | a, h }; layers; errRel. -> { request, pick (the stations sent), dropped (gates at or before t = 0) }
export function buildTemRequest(data, { moments, timeZero = "rampEnd", unit = "pV", noise = null, every = 1, heightsCol = null, system, layers, errRel = 0.05, lateral = 0 }) {
  const scale = unit === "SI" ? 1e12 : 1;
  const ms = moments.map((mo) => {
    const shift = timeZero === "rampStart" ? (Number(mo.rampUs) || 0) * 1e-6 : 0;
    const keep = [], gates = [];
    mo.times.forEach((t, k) => { const g = t / 1000 - shift; if (g > 1e-7) { keep.push(k); gates.push(+g.toPrecision(8)); } });
    return { ...mo, keep, gates, mat: channelMatrix(data, mo.group) };
  });
  const dropped = ms.reduce((s, mo) => s + (mo.times.length - mo.keep.length), 0);
  // stations: every Nth along each line, in file order
  const pick = [], count = new Map();
  for (let i = 0; i < data.n; i++) {
    if (!Number.isFinite(data.x[i]) || !Number.isFinite(data.y[i])) continue;
    const k = count.get(data.line[i]) || 0;
    count.set(data.line[i], k + 1);
    if (k % Math.max(1, every) === 0) pick.push(i);
  }
  const row = (i) => ms.flatMap((mo) => mo.keep.map((k) => { const v = mo.mat.v[i * mo.mat.m + k]; return Number.isFinite(v) ? +(v * scale).toPrecision(7) : null; }));
  const dataRows = pick.map(row);
  let std = null;
  if (noise?.use && noise.mats?.length === ms.length && noise.mats.every(Boolean)) {
    std = pick.map((i) => ms.flatMap((mo, j) => mo.keep.map((k) => {
      const sd = noise.mats[j].v[i * noise.mats[j].m + k], v = mo.mat.v[i * mo.mat.m + k];
      if (!Number.isFinite(sd) || !Number.isFinite(v) || v === 0) return null;
      return +(noise.kind === "absolute" ? Math.abs(sd / v) : Math.abs(sd)).toPrecision(5); // the job takes relative uncertainties
    })));
  }
  const hcol = heightsCol ? data.get(heightsCol) : null;
  const request = {
    system, moments: ms.map((mo) => ({ gates: mo.gates, waveform: mo.waveform || null })),
    data: dataRows, ...(std ? { std } : {}), errRel, layers, lateral,
    heights: hcol ? pick.map((i) => (Number.isFinite(hcol[i]) && hcol[i] >= 0 && hcol[i] <= 300 ? +hcol[i].toFixed(2) : null)) : undefined,
    line: pick.map((i) => String(data.line[i])), x: pick.map((i) => data.x[i]), y: pick.map((i) => data.y[i]),
  };
  if (!request.heights) delete request.heights;
  return { request, pick, dropped, gatesPerMoment: ms.map((mo) => mo.gates.length), scale };
}

// The finished stations from the progress events (each carries the last few batches; a later pass replaces an earlier one).
// state: { condMs: Map, chi: Map, doi: Map, pred: Map, pass: Map } (or null) -> the same, updated
export function mergePartials(state, partials) {
  const s = state || { condMs: new Map(), chi: new Map(), doi: new Map(), pred: new Map(), pass: new Map() };
  for (const p of partials || []) {
    p.idx.forEach((j, k) => {
      if ((s.pass.get(j) ?? -1) > (p.pass ?? 0)) return;
      s.pass.set(j, p.pass ?? 0); s.condMs.set(j, p.condMs[k]); s.chi.set(j, p.chi[k]); s.doi.set(j, p.doi[k]); s.pred.set(j, p.pred[k]);
    });
  }
  return s;
}
// gathered partials as a result shaped like the job's (stations not finished: null rows)
export function partialResult(state, n, thick) {
  const at = (m, j) => (m.has(j) ? m.get(j) : null);
  return { thick, condMs: Array.from({ length: n }, (_, j) => at(state.condMs, j)), chi: Array.from({ length: n }, (_, j) => at(state.chi, j)), doi: Array.from({ length: n }, (_, j) => at(state.doi, j)), pred: Array.from({ length: n }, (_, j) => at(state.pred, j)), partial: true, finished: state.condMs.size };
}

// the engine's layer_thicknesses (python-sidecar/app/geophys/em1d.py), here so partial results can be drawn before the job returns its own:
// n - 1 layers from `first` thick down to `bottom`, growing geometrically, then the half-space
export function layerThicknesses(n = 20, first = 3, bottom = 300) {
  if (n < 2) return [];
  const k = n - 1;
  if (first * k >= bottom) return Array(k).fill(bottom / k);
  let lo = 1 + 1e-12, hi = 4, q = 2;
  for (let it = 0; it < 200; it++) { q = 0.5 * (lo + hi); const s = first * (q ** k - 1) / (q - 1); if (s < bottom) lo = q; else hi = q; }
  return Array.from({ length: k }, (_, i) => first * q ** i);
}
