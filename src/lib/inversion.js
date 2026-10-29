// TASKS.csv #321 — renderer-side helpers for SimPEG potential-field modelling. Pure (no React, no
// three.js), Node-verified. The physics runs in the sidecar (python-sidecar/app/geophys/potential.py);
// this file prepares honest inputs for it and turns its output into a GeoStrix voxel model.
import { reprojectXY, isMetricProjectedEpsg } from "./reproject.js";
import { hexToRgb, rgbToHex, rgbToLab, labToRgb } from "./colorRamp.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
import { terrainNodeIsFill, terrainGroundAt } from "./viewer/geomath.js"; // TASKS.csv #927; terrainGroundAt: #1114

// ---------- grid convergence ----------
// SimPEG's x/y axes are the project grid's easting/northing, so the inducing field's declination has to
// be measured from GRID north, not true north (GIS review, #321). In UTM the two differ by the grid
// convergence — about 1-2.5 degrees across BC's zone 9. Computed numerically from the project's own
// projection: step 1 km due true-north from the survey centre and measure the bearing of that step in grid
// coordinates. That bearing is where true north points, clockwise from grid north; a declination (clockwise
// from true north) is therefore that much larger measured from grid north.
export function trueNorthBearingInGridDeg(x, y, epsg) {
  const ll = reprojectXY(x, y, epsg, 4326);
  if (!ll) return null;
  const n = reprojectXY(ll.x, ll.y + 0.009, 4326, epsg); // ~1 km north
  if (!n) return null;
  return (Math.atan2(n.x - x, n.y - y) * 180) / Math.PI;
}
export function gridDeclination(trueDeclinationDeg, x, y, epsg) {
  const b = trueNorthBearingInGridDeg(x, y, epsg);
  return b == null ? null : { grid: trueDeclinationDeg + b, convergence: b };
}

// ---------- terrain ----------
// Bilinear terrain elevation, same convention as ViewerModule's sampleTerrainElevation (row 0 = north
// edge). Returns NaN outside the terrain instead of clamping to the edge value: for deciding which cells
// are underground an invented flat margin is worse than an explicit "not covered" (GIS review, #321). TASKS.csv #927 —
// and over filled nodes (the mean elevation of a DEM void or outside a TIN), which are no ground either.
// TASKS.csv #1114 — one bilinear sampler: this was a second copy of geomath.js terrainGroundAt (same #927 fill rule) that
// read index -1 on a terrain one node wide or tall
export const terrainElevationAt = terrainGroundAt;

// Terrain grid nodes (x, y, z) inside a box, thinned to at most maxPoints — the sidecar's active-cell
// test needs the ground surface over the whole mesh, padding included. TASKS.csv #927 — filled nodes are left out
// (`skipped` counts them): the stations' own elevations and the real nodes around them define the ground there.
export function terrainPoints(terrain, box, maxPoints = 40000) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH, elevations } = terrain;
  const i0 = Math.max(0, Math.floor(((box[0] - xmin) / (xmax - xmin)) * (gridW - 1)));
  const i1 = Math.min(gridW - 1, Math.ceil(((box[2] - xmin) / (xmax - xmin)) * (gridW - 1)));
  const j0 = Math.max(0, Math.floor(((ymax - box[3]) / (ymax - ymin)) * (gridH - 1)));
  const j1 = Math.min(gridH - 1, Math.ceil(((ymax - box[1]) / (ymax - ymin)) * (gridH - 1)));
  const n = Math.max(1, (i1 - i0 + 1) * (j1 - j0 + 1));
  const step = Math.max(1, Math.ceil(Math.sqrt(n / maxPoints)));
  const out = [];
  let skipped = 0;
  for (let j = j0; j <= j1; j += step) {
    for (let i = i0; i <= i1; i += step) {
      if (terrainNodeIsFill(terrain, j * gridW + i)) { skipped++; continue; }
      out.push([xmin + (i / (gridW - 1)) * (xmax - xmin), ymax - (j / (gridH - 1)) * (ymax - ymin), elevations[j * gridW + i]]);
    }
  }
  return { points: out, skipped, spacing: Math.max((xmax - xmin) / (gridW - 1), (ymax - ymin) / (gridH - 1)) * step, covers: box[0] >= xmin && box[2] <= xmax && box[1] >= ymin && box[3] <= ymax };
}

// ---------- stations ----------
// Keep one station per cell of a `spacing` grid (the one nearest the cell centre). Airborne data sampled
// every few metres along lines carries far more rows than an inversion can use — each row costs a full
// row of the sensitivity matrix — and adjacent readings add almost no new information (GIS/Micromine
// review, #321). Returns the kept indices so observed values and any line/fid columns stay aligned.
export function thinStationIndices(xs, ys, spacing) {
  if (!(spacing > 0)) return xs.map((_, i) => i);
  const best = new Map();
  for (let i = 0; i < xs.length; i++) {
    const cx = Math.floor(xs[i] / spacing), cy = Math.floor(ys[i] / spacing);
    const k = `${cx},${cy}`;
    const dx = xs[i] - (cx + 0.5) * spacing, dy = ys[i] - (cy + 0.5) * spacing;
    const d = dx * dx + dy * dy;
    const cur = best.get(k);
    if (!cur || d < cur.d) best.set(k, { i, d });
  }
  return Array.from(best.values(), (v) => v.i).sort((a, b) => a - b);
}

// TASKS.csv #375 — the station cap the sidecar enforces (main.py MAX_STATIONS), and the smallest thinning
// spacing (rounded up to a friendly 1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 step) that brings a survey under it.
export const MAX_STATIONS = 20000;
export function suggestThinSpacing(xs, ys, cap = MAX_STATIONS) {
  if (xs.length <= cap) return null;
  let s = Math.max(0.1, medianNearestSpacing(xs, ys) || 1);
  for (let k = 0; k < 60 && thinStationIndices(xs, ys, s).length > cap; k++) s *= 1.15;
  const mag = 10 ** Math.floor(Math.log10(s)), nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((v) => v >= s) || s;
  return { spacing: nice, stations: thinStationIndices(xs, ys, nice).length };
}

export function medianNearestSpacing(xs, ys, sample = 400) {
  const n = xs.length;
  if (n < 2) return null;
  const idx = n <= sample ? xs.map((_, i) => i) : Array.from({ length: sample }, (_, k) => Math.floor((k * n) / sample));
  const d = idx.map((i) => {
    let best = Infinity;
    for (let j = 0; j < n; j++) if (j !== i) { const q = (xs[i] - xs[j]) ** 2 + (ys[i] - ys[j]) ** 2; if (q > 0 && q < best) best = q; }
    return Math.sqrt(best);
  }).filter(Number.isFinite).sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : null;
}

// ---------- pre-flight checks the renderer can do itself ----------
export function crsProblem(epsg) {
  const metric = isMetricProjectedEpsg(epsg);
  if (metric === true) return null;
  if (metric === false) return `The project CRS (EPSG:${epsg}) is geographic (degrees). Inversion needs a projected CRS in metres — set one in the status bar and reproject the survey on import.`;
  return `GeoStrix can't confirm EPSG:${epsg ?? "?"} is a projected CRS in metres, so it won't run an inversion on it.`;
}

export const formatBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.round(b / 1e3)} kB`);

// ---------- results ----------
// Fit verdict in plain words. chi = phi_d / N (N = number of data): ~1 means the model fits the data to
// the stated uncertainty; well above 1 is under-fit (the model misses real signal, or the uncertainties
// are too small); well below 1 is over-fit (the model is chasing noise, or the uncertainties are too large).
export function fitVerdict(result) {
  const chi = result.phi_d / result.target;
  if (chi > 1.5) return { chi, level: "under", text: `Did not reach the target fit (misfit ${chi.toFixed(2)}x the target) — the model does not explain the data to the uncertainty you entered. Treat it as unfinished.` };
  // TASKS.csv #536 — an overshoot by the solver's last step (beta halved past the target) is not the user's
  // uncertainty: the engine now returns an in-band iterate when it has one and says so in fitChoice.
  const fc = result.fitChoice;
  const picked = fc && (fc.how === "earlier" || fc.how === "refined") ? ` The final solver step overshot to ${(fc.lastPhi / result.target).toFixed(2)}x, so the ${fc.how === "refined" ? "step was redone with a smaller one" : `model from iteration ${fc.iteration} is used`} instead.` : "";
  if (chi < 0.5 && fc?.overshot) return { chi, level: "over", text: `Fits more closely than the stated uncertainty (misfit ${chi.toFixed(2)}x the target) because the solver's last step overshot the target — not necessarily a sign that the uncertainty is too large. The model is rougher than the data need; treat fine detail with caution.` };
  if (chi < 0.5) return { chi, level: "over", text: `Fits more closely than the stated uncertainty (misfit ${chi.toFixed(2)}x the target) — likely fitting noise; the uncertainty may be set too large.` };
  // TASKS.csv #507 — "Reached" only when the run did reach it: the sidecar's reachedTarget (phi_d <= 1.05 N);
  // results without the flag (older saved sections) use the same test. A run that stopped at its iteration
  // limit at 1.05-1.5x used to be reported — and stored in provenance — as converged.
  const reached = result.reachedTarget ?? chi <= 1.05;
  if (!reached) return { chi, level: "close", text: `Stopped after ${result.iterations} iteration${result.iterations === 1 ? "" : "s"} before reaching the target fit (misfit ${chi.toFixed(2)}x the target) — close, but not converged: run more iterations, or check the uncertainty you entered.` };
  return { chi, level: "ok", text: `Reached the target fit (misfit ${chi.toFixed(2)}x the target) in ${result.iterations} iteration${result.iterations === 1 ? "" : "s"}.${picked}` };
}

// TASKS.csv #682 — the IP verdict: chargeability is a linearization about the recovered conductivity, so when the
// resistivity model did not fit (under or close to the target), the IP fit is marked unfinished whatever its own misfit.
// TASKS.csv #970 — moved here from DcipPanel so the 3D panel applies the same rule.
export function ipFitOf(result) {
  const v = fitVerdict({ phi_d: result.ip.phi_d, target: result.target, reachedTarget: result.ip.reachedTarget, iterations: result.ip.iterations ?? result.ip.history?.length ?? 0, fitChoice: result.ip.fitChoice });
  const dc = fitVerdict(result);
  if (dc.level === "under" || dc.level === "close") { // not "over": an over-fitted resistivity model still explains the data
    return { level: "dc-unfitted", chi: +v.chi.toFixed(3), reachedTarget: false, dcUnfitted: true,
      verdict: `computed on a resistivity model that did not fit the data, so treat it as unfinished as well (its own misfit: ${v.chi.toFixed(2)}x the target).` };
  }
  return { level: v.level, chi: +v.chi.toFixed(3), reachedTarget: v.level === "ok", verdict: v.text };
}

// TASKS.csv #775 — SimPEG's magnetic tutorials: "a constant floor of 2 % of the maximum |TMI|, percent uncertainties
// avoided". Shown as a HINT beside the field, never filled in (#564: nothing physical is defaulted). The anomaly is
// measured about the mean, as the default base-level removal leaves it.
export function simpegMagFloorHint(values) {
  const v = (values || []).filter(Number.isFinite);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  let m = 0;
  for (const x of v) m = Math.max(m, Math.abs(x - mean));
  return m > 0 ? 0.02 * m : null;
}

// TASKS.csv #770 — the engine works in grid coordinates (the inducing field's declination was converted with
// gridDeclination: grid = true + convergence), so a recovered declination goes back to true north the same way.
export function trueDeclination(gridDeg, convergence) {
  return ((((gridDeg - (Number(convergence) || 0)) % 360) + 360) % 360);
}

// Plain words for the vector inversion's direction summary: where the strongest cells point, and whether that is
// far enough from today's field for remanence to matter. Thresholds are deliberately coarse: a direction from a
// potential-field inversion is an estimate, not a palaeomagnetic measurement.
export function remanenceText(direction, convergence) {
  if (!direction) return null;
  const dec = trueDeclination(direction.declinationGrid, convergence);
  const a = direction.angleToInducingField;
  // Found live on the Harry sample (magnetic LOWS from magnetite destruction on a regional gradient, base level
  // removed): the vector inversion fitted the lows with magnetisation pointing almost opposite the field
  // (inclination -75, 148 deg away). A deficit and a reversed source look the same to it; say so.
  const verdict = a >= 135 ? "nearly opposite today's field. That is what a magnetic LOW looks like to a vector inversion — rock less magnetic than its surroundings (magnetite destroyed by alteration, for example), once the base level is removed — as well as genuinely reversed remanence. Check against the geology and the logs before calling it remanence"
    : a >= 30 ? "far from today's field, so a remanent component is likely and a susceptibility inversion would misplace this body"
    : a >= 15 ? "somewhat off today's field: some remanence is possible"
      : "close to today's field: mostly induced magnetization, so the susceptibility inversion is a fair model too";
  const scatter = direction.consistency < 0.7 ? ` The cells' directions scatter (consistency ${direction.consistency.toFixed(2)} of 1), so treat the direction as rough.` : "";
  return tr("The {cells} strongest cells point at inclination {inclination}°, declination {dec}° (true north) — {a}° from the inducing field: {verdict}.{scatter}", { cells: direction.cells.toLocaleString(), inclination: direction.inclination.toFixed(0), dec: dec.toFixed(0), a: a.toFixed(0), verdict, scatter });
}

// Sidecar result -> a GeoStrix voxel model (only core, below-ground cells are ever sent). `supportCutoff`
// marks cells the data can barely see (normalised sensitivity below it) — kept, but flagged, so the view
// can dim or hide them rather than colour them as if they were resolved.
export function resultToVoxelModel(result, meta) {
  const c = result.cells;
  const cells = c.value.map((v, i) => ({ x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: v, support: c.support[i] }));
  const property = result.method === "mag" ? "Recovered susceptibility (SI)" : "Recovered density contrast (g/cc)";
  // TASKS.csv #770 — a vector (remanence) inversion: the value is the magnetisation AMPLITUDE (SI-equivalent),
  // and each cell carries its own inclination / declination (grid north)
  if (result.magModel === "vector") {
    if (c.inc && c.dec) cells.forEach((cell, i) => { cell.inc = c.inc[i]; cell.dec = c.dec[i]; });
    const p = "Magnetization amplitude (SI)";
    return { name: `${p} — vector inversion of ${meta.surveyName}`, cells, source: "simpeg", property: p, method: result.method, style: "vector" };
  }
  const style = result.style === "compact" ? "compact" : "smooth"; // TASKS.csv #769
  return { name: `${property} — ${style} inversion of ${meta.surveyName}`, cells, source: "simpeg", property, method: result.method, style };
}

// Base64 <-> Float32Array for compact project-file storage of model values (database review, #321):
// ~4 bytes per cell instead of a ~70-byte JSON object per cell.
export function f32ToB64(arr) {
  const bytes = new Uint8Array(new Float32Array(arr).buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : globalThis.Buffer.from(s, "binary").toString("base64"); // Node fallback (tests)
}
export function b64ToF32(b64) {
  const s = typeof atob === "function" ? atob(b64) : globalThis.Buffer.from(b64, "base64").toString("binary"); // Node fallback (tests)
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// ---------- colour ramps for recovered models (visual-design review, #321) ----------
// Interpolated in CIE Lab, 17 stops, because the voxel renderer lerps between stops in sRGB: dense stops
// keep that lerp from drifting off the perceptual path.
function labStops(anchors, values) {
  const labs = anchors.map((h) => rgbToLab(hexToRgb(h)));
  const n = values.length;
  return values.map((v, i) => {
    const t = (i / (n - 1)) * (labs.length - 1);
    const k = Math.min(labs.length - 2, Math.floor(t)), f = t - k;
    const lab = labs[k].map((c, j) => c + (labs[k + 1][j] - c) * f);
    return { value: v, color: rgbToHex(labToRgb(lab).rgb) };
  });
}
// Susceptibility (and other positive properties): pale -> saturated -> dark. Lightness FALLS with value so
// the strongest cells are the most salient on GeoStrix's light viewport, same logic as #306's grade ramp.
// TASKS.csv #322 — resistivity: log-spaced stops (it spans decades), conductive = warm / dark red, resistive =
// blue, the convention DC/IP sections are read in.
// TASKS.csv #535 — SEQUENTIAL, not diverging: the old dark red -> #f4f4f2 -> dark blue ramp put a near-white neutral
// (ΔE00 2.5 from the page) at the geometric middle of min..max, so mid-resistivity cells read as blank paper, the
// "neutral" moved with the data's extremes, and the low-support grey matched ~150-200 ohm·m. Now lightness rises
// monotonically with resistivity (L* 15 -> 83): conductive (the target) darkest and most salient, as the chargeability
// and susceptibility ramps do for their strong values; nowhere closer than ΔE00 11.5 to page white.
export const RESISTIVITY_ANCHORS = ["#4d0a12", "#a8262a", "#dd6a3a", "#e9b27c", "#b9d3e6"];
export function logStops(min, max, anchors = RESISTIVITY_ANCHORS, n = 17) {
  const lo = Math.log10(min > 0 ? min : 1), hi = Math.log10(max > min ? max : (min > 0 ? min : 1) * 10);
  return labStops(anchors, Array.from({ length: n }, (_, i) => 10 ** (lo + ((hi - lo) * i) / (n - 1))));
}
// TASKS.csv #702 — ONE ramp for grade models, whichever tool made them (IDW / nearest / geoML): viridis (the 3D
// view's default for a value with no stops, #382), log-spaced when the grades span two decades or more, so an
// IDW Au estimate and a geoML Au estimate of the same data read alike side by side. Geophysical properties keep
// their warm / log ramps below, so a grade model is never the same colours as a chargeability model.
export const GRADE_ANCHORS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
export function gradeStops(min, max, n = 17) {
  if (min > 0 && max / min >= 100) return logStops(min, max, GRADE_ANCHORS, n);
  const lo = Number.isFinite(min) ? min : 0, hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  return labStops(GRADE_ANCHORS, Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1)));
}
// TASKS.csv #702 — a ramp whose anchors sit at given values (not evenly spaced), densified in Lab like the others
export function labStopsAt(anchorStops, n = 17) {
  const a = [...anchorStops].sort((p, q) => p.value - q.value).map((s) => ({ value: s.value, lab: rgbToLab(hexToRgb(s.color)) }));
  const lo = a[0].value, hi = a[a.length - 1].value;
  return Array.from({ length: n }, (_, i) => {
    const v = lo + ((hi - lo) * i) / (n - 1);
    let k = 0; while (k < a.length - 2 && v > a[k + 1].value) k++;
    const f = a[k + 1].value > a[k].value ? (v - a[k].value) / (a[k + 1].value - a[k].value) : 0;
    const lab = a[k].lab.map((c, j) => c + (a[k + 1].lab[j] - c) * f);
    return { value: v, color: rgbToHex(labToRgb(lab).rgb) };
  });
}
export const SEQUENTIAL_ANCHORS = ["#fff7cc", "#f5b247", "#d9601a", "#8f1f3d", "#3d0d3a"];
export function sequentialStops(min, max, n = 17) {
  const lo = Number.isFinite(min) ? min : 0, hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  return labStops(SEQUENTIAL_ANCHORS, Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1)));
}
// Density contrast: diverging, anchored at ZERO with symmetric limits (+-max|value|), so 0 is always the
// neutral midpoint — the existing "diverging" palette spaces its stops between min and max, which puts
// the neutral colour at the mid-RANGE instead (an asymmetric -0.05..+0.30 range would show +0.12 as
// neutral and positive cells as negative).
export const DIVERGING_ANCHORS = ["#1d3f7a", "#5b8fc9", "#f4f4f2", "#e0885c", "#8a1d1d"];
export function divergingStops(absMax, n = 17) {
  const m = Number.isFinite(absMax) && absMax > 0 ? absMax : 1;
  return labStops(DIVERGING_ANCHORS, Array.from({ length: n }, (_, i) => -m + (2 * m * i) / (n - 1)));
}

// TASKS.csv #537 — what the forward-model maps show. The engine scores a forward run as obs − pred − b, with b the
// best-fit base level (#366), but the maps were given raw obs and pred: with an IGRF-removed level of ~150 nT the
// residual map was one flat colour, its RMS ≈ the base level (contradicting the "RMS left over" sentence above
// it), and the shared observed / predicted colour scale was stretched across both offsets. The predicted map is
// shown with b added (same level as the data), so residual = obs − (pred + b) and its RMS = the engine's.
export function forwardMapValues(observed, run) {
  const b = Number.isFinite(run?.baseLevel) ? run.baseLevel : 0;
  const predicted = (run?.predicted || []).map((p) => p + b);
  return { predicted, baseLevel: b };
}
// a symmetric colour range for a residual map without per-datum σ: the 98th percentile of |residual| (so one spike
// doesn't wash out the rest); with σ the residual is in σ units and ±3 is the scale
export function residualScale(resid, hasStd) {
  if (hasStd) return 3;
  const a = resid.map(Math.abs).filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? Math.max(a[Math.min(a.length - 1, Math.floor(0.98 * (a.length - 1)))], 1e-9) : 1;
}
