// TASKS.csv #321 — renderer-side helpers for SimPEG potential-field modelling. Pure (no React, no
// three.js), Node-verified. The physics runs in the sidecar (python-sidecar/app/geophys/potential.py);
// this file prepares honest inputs for it and turns its output into a GeoStrix voxel model.
import { reprojectXY, isMetricProjectedEpsg } from "./reproject.js";
import { hexToRgb, rgbToHex, rgbToLab, labToRgb } from "./colorRamp.js";

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
// are underground an invented flat margin is worse than an explicit "not covered" (GIS review, #321).
export function terrainElevationAt(terrain, x, y) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  if (x < xmin || x > xmax || y < ymin || y > ymax) return NaN;
  const { gridW, gridH, elevations } = terrain;
  const fx = ((x - xmin) / (xmax - xmin)) * (gridW - 1);
  const fy = ((ymax - y) / (ymax - ymin)) * (gridH - 1);
  const x0 = Math.min(gridW - 2, Math.floor(fx)), y0 = Math.min(gridH - 2, Math.floor(fy));
  const tx = fx - x0, ty = fy - y0;
  const at = (i, j) => elevations[j * gridW + i];
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bot * ty;
}

// Terrain grid nodes (x, y, z) inside a box, thinned to at most maxPoints — the sidecar's active-cell
// test needs the ground surface over the whole mesh, padding included.
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
  for (let j = j0; j <= j1; j += step) {
    for (let i = i0; i <= i1; i += step) {
      out.push([xmin + (i / (gridW - 1)) * (xmax - xmin), ymax - (j / (gridH - 1)) * (ymax - ymin), elevations[j * gridW + i]]);
    }
  }
  return { points: out, spacing: Math.max((xmax - xmin) / (gridW - 1), (ymax - ymin) / (gridH - 1)) * step, covers: box[0] >= xmin && box[2] <= xmax && box[1] >= ymin && box[3] <= ymax };
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
  if (chi < 0.5) return { chi, level: "over", text: `Fits more closely than the stated uncertainty (misfit ${chi.toFixed(2)}x the target) — likely fitting noise; the uncertainty may be set too large.` };
  return { chi, level: "ok", text: `Reached the target fit (misfit ${chi.toFixed(2)}x the target) in ${result.iterations} iteration${result.iterations === 1 ? "" : "s"}.` };
}

// Sidecar result -> a GeoStrix voxel model (only core, below-ground cells are ever sent). `supportCutoff`
// marks cells the data can barely see (normalised sensitivity below it) — kept, but flagged, so the view
// can dim or hide them rather than colour them as if they were resolved.
export function resultToVoxelModel(result, meta) {
  const c = result.cells;
  const cells = c.value.map((v, i) => ({ x: c.x[i], y: c.y[i], z: c.z[i], dx: c.dx[i], dy: c.dy[i], dz: c.dz[i], value: v, support: c.support[i] }));
  const property = result.method === "mag" ? "Recovered susceptibility (SI)" : "Recovered density contrast (g/cc)";
  return { name: `${property} — smooth inversion of ${meta.surveyName}`, cells, source: "simpeg", property, method: result.method };
}

// Base64 <-> Float32Array for compact project-file storage of model values (database review, #321):
// ~4 bytes per cell instead of a ~70-byte JSON object per cell.
export function f32ToB64(arr) {
  const bytes = new Uint8Array(new Float32Array(arr).buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
}
export function b64ToF32(b64) {
  const s = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
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
