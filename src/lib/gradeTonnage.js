// TASKS.csv #1052 (review #1016, resource geologist / QP) — the grade-tonnage table of a block model. The only tonnage in
// the app was a shell's volume x one density; an estimated or imported block model showed a cell count and nothing
// else, although an exploration target (NI 43-101 2.3(2): ranges of tonnage and grade, with the cautionary statement)
// is exactly this table at several cutoffs. Pure: no React.
//
// cells: [{ value, dx, dy, dz, coverage? }] — a block merged on import counts only the share it holds (#943, coverage).
// density: t/m3, required (no default, as #264: a tonnage at an assumed density reads as measured).
// unit: the value's unit ("ppm", "g/t", "ppb", "%", ...) — decides the metal column, or none for anything else.

export const blockVolume = (c) => (Number.isFinite(c.coverage) ? c.coverage : 1) * c.dx * c.dy * c.dz;

// metal contained: grams for ppm / g/t (1 ppm = 1 g/t) and ppb (mg/t), tonnes for %. -> { factor, unit } or null
export function metalOf(unit) {
  const u = String(unit || "").trim().toLowerCase();
  if (u === "ppm" || u === "g/t" || u === "gpt") return { factor: 1, unit: "g" };
  if (u === "ppb") return { factor: 0.001, unit: "g" };
  if (u === "%" || u === "pct" || u === "wt%") return { factor: 0.01, unit: "t" };
  return null;
}

// TASKS.csv #1577 (review #1497, Lawyers) — a precious metal's cutoffs are the round grades a geologist quotes (0.3, 0.5, 1, 2, 5 g/t),
// not percentiles (Lawyers' Au estimate opened on 0.005 / 0.023 / 0.094 ppm); its metal is in kilograms and troy ounces, not grams
// (152,623,885 g). A base metal in ppm is in tonnes of metal. A support index or a kriging variance is not a grade: no table.
const PRECIOUS = new Set(["Au", "Ag", "Pt", "Pd"]);
const TROY_OZ_G = 31.1034768;
const ROUND_GPT = [0.1, 0.3, 0.5, 1, 2, 5, 10, 20];
export const NOT_GRADE_SOURCE = /^support-index-|^kriging-variance$/;
export const isGradeTonnageModel = (model) => !NOT_GRADE_SOURCE.test(String(model?.source || ""));
// TASKS.csv #1592 (review #1497, Lawyers) — the block-model card's grade-tonnage icon: an OMF or UBC import whose values are 'Not stated'
// is a geophysics model (Lawyers' MVI amplitude gave '81,156,250,000 m3 at mean grade 0.005'), so it gets a table only once the user
// states its values as something other than a geophysical property ('Other…', e.g. 'Au g/t'). Estimates, geoML and other imports
// (block-model CSVs, usually grades) keep it; geophysical properties, SimPEG, categorical models, indices and variances never had it.
// geophysProperty: the card's list of physical properties (conductivity, susceptibility...).
export function offersGradeTonnage(model, { categorical = false, geophysProperty = () => false } = {}) {
  if (!model || categorical || !isGradeTonnageModel(model)) return false;
  const src = String(model.source || "");
  if (src === "simpeg" || geophysProperty(model.property)) return false;
  if ((src === "omf" || src.startsWith("ubc")) && !model.property) return false;
  return true;
}
const isPrecious = (element) => PRECIOUS.has(String(element || "").trim());
// the metal columns to show / export: [{ key, label, factor }] applied to metalOf's amount (grams or tonnes); [] without a metal
export function metalColumns(metal, element) {
  if (!metal) return [];
  if (metal.unit === "t") return [{ key: "metal_t", label: "Metal (t)", factor: 1 }];
  if (isPrecious(element)) return [{ key: "metal_kg", label: "Metal (kg)", factor: 1e-3 }, { key: "metal_oz", label: "Metal (troy oz)", factor: 1 / TROY_OZ_G }];
  return [{ key: "metal_t", label: "Metal (t)", factor: 1e-6 }];
}

// cutoffs from the values themselves: 0 and the 25th / 50th / 75th / 90th / 95th percentiles, rounded to 2 significant digits; for a
// precious metal in g/t, ppm or ppb (#1577) 0 and the round grades up to the highest value, when at least two of them are reached
export function autoCutoffs(cells, { element = null, unit = null } = {}) {
  const v = cells.map((c) => c.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  const u = String(unit || "").trim().toLowerCase(), scale = u === "ppb" ? 1000 : u === "g/t" || u === "ppm" || u === "gpt" ? 1 : null;
  if (isPrecious(element) && scale) {
    const top = v[v.length - 1], round = ROUND_GPT.map((g) => g * scale).filter((c) => c <= top);
    if (round.length >= 2) return [0, ...round];
  }
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const r2 = (x) => (x === 0 ? 0 : Number(x.toPrecision(2)));
  return [...new Set([0, ...[0.25, 0.5, 0.75, 0.9, 0.95].map((p) => r2(q(p)))])].sort((a, b) => a - b);
}

// -> [{ cutoff, blocks, volumeM3, meanGrade, tonnes, metal, interpolatedShare, singleHoleShare }] (tonnes / metal null without a
// density); mean grade is volume-weighted, over the blocks with value >= cutoff. TASKS.csv #1409 (review #1352, Silvertip) — the
// table gave 110 Mt @ 0.73 % Zn from a model 98 % extrapolated, up to 300 m from nine fan holes, and never said so: the volume shares
// in blocks the estimate classed "interpolated" and informed by one hole are in each row (null when the model carries no support).
// interpolatedOnly: count only the blocks classed interpolated.
// TASKS.csv #2417 / #2542 — beyondKnown (the model's estimate flagged its blocks, params.beyondFlagged): beyondShare, the share of the
// metal (grade x volume) in blocks above or below every sample that informs them
export function gradeTonnageTable(cells, { cutoffs, density = null, unit = null, interpolatedOnly = false, beyondKnown = false } = {}) {
  const m = metalOf(unit), rho = Number(density) > 0 ? Number(density) : null;
  const hasSupport = cells.some((c) => typeof c.support === "string"), hasHoles = cells.some((c) => Number.isFinite(c.nHoles));
  const blocks = cells.filter((c) => Number.isFinite(c.value) && c.dx > 0 && c.dy > 0 && c.dz > 0 && (!interpolatedOnly || c.support === "interpolated"))
    .map((c) => ({ v: c.value, vol: blockVolume(c), interp: c.support === "interpolated", one: c.nHoles === 1, out: !!c.beyond }));
  return [...cutoffs].sort((a, b) => a - b).map((cutoff) => {
    let n = 0, vol = 0, gv = 0, vi = 0, v1 = 0, gvo = 0;
    for (const b of blocks) if (b.v >= cutoff) { n++; vol += b.vol; gv += b.v * b.vol; if (b.interp) vi += b.vol; if (b.one) v1 += b.vol; if (b.out) gvo += b.v * b.vol; }
    const meanGrade = vol > 0 ? gv / vol : null, tonnes = rho && vol > 0 ? vol * rho : null;
    return { cutoff, blocks: n, volumeM3: vol, meanGrade, tonnes, metal: m && tonnes != null && meanGrade != null ? tonnes * meanGrade * m.factor : null,
      interpolatedShare: hasSupport && vol > 0 ? vi / vol : null, singleHoleShare: hasHoles && vol > 0 ? v1 / vol : null,
      ...(beyondKnown ? { beyondShare: gv > 0 ? gvo / gv : null } : {}) };
  });
}

// TASKS.csv #1949 (Vulcan review) — the blocks of a model INSIDE a closed solid (a lofted, linked, vein, modelled or imported body):
// by block centre (whole blocks, as the Strings tool reports), or by the SHARE of each block inside, sampled on a lattice of
// `samples` points per axis (2 -> the eight sub-block centres). A kept block carries its share as `coverage` (times any coverage it
// had), which blockVolume already honours, so the grade-tonnage sums need no other change. -> { cells, inside, partial, outside }
import { buildMeshQuery, isPointInsideMesh } from "./meshQuery.js";
export function blocksInsideSolid(cells, positions, indices, { mode = "centre", samples = 2 } = {}) {
  const q = buildMeshQuery(positions, indices);
  if (!q) return { cells: [], inside: 0, partial: 0, outside: cells.length };
  const out = [];
  let inside = 0, partial = 0, outside = 0;
  const n = Math.max(1, Math.min(4, Math.round(samples))), offs = Array.from({ length: n }, (_, i) => (i + 0.5) / n - 0.5);
  for (const c of cells || []) {
    if (!(c.dx > 0 && c.dy > 0 && c.dz > 0)) { outside++; continue; }
    if (mode !== "share") {
      if (isPointInsideMesh(q, { x: c.x, y: c.y, z: c.z })) { inside++; out.push(c); } else outside++;
      continue;
    }
    let hit = 0, total = 0;
    for (const a of offs) for (const b of offs) for (const d of offs) { total++; if (isPointInsideMesh(q, { x: c.x + a * c.dx, y: c.y + b * c.dy, z: c.z + d * c.dz })) hit++; }
    if (!hit) { outside++; continue; }
    const share = hit / total;
    if (share >= 1) inside++; else partial++;
    out.push(share >= 1 ? c : { ...c, coverage: (Number.isFinite(c.coverage) ? c.coverage : 1) * share });
  }
  return { cells: out, inside, partial, outside };
}

// TASKS.csv #1957 (Vulcan review) — the same sums bench by bench at one cutoff: bench height and datum typed by the user (floors at
// datum + k x benchH); a block spanning two benches splits by its vertical overlap. -> [{ floorRL, blocks, volumeM3, meanGrade,
// tonnes, metal, interpolatedShare }] from the top bench down; a bench with nothing at the cutoff is not listed.
export function gradeTonnageByBench(cells, { cutoff, benchH, datum = 0, density = null, unit = null, interpolatedOnly = false } = {}) {
  const m = metalOf(unit), rho = Number(density) > 0 ? Number(density) : null, h = Number(benchH);
  if (!(h > 0)) return [];
  const hasSupport = cells.some((c) => typeof c.support === "string");
  const benches = new Map();
  for (const c of cells || []) {
    if (!Number.isFinite(c.value) || !(c.dx > 0 && c.dy > 0 && c.dz > 0) || c.value < cutoff || (interpolatedOnly && c.support !== "interpolated")) continue;
    const vol = blockVolume(c), zlo = c.z - c.dz / 2, zhi = c.z + c.dz / 2;
    const k0 = Math.floor((zlo - datum) / h + 1e-9), k1 = Math.ceil((zhi - datum) / h - 1e-9) - 1;
    for (let k = k0; k <= Math.max(k0, k1); k++) {
      const lo = datum + k * h, hi = lo + h, overlap = Math.min(zhi, hi) - Math.max(zlo, lo);
      if (!(overlap > 1e-9)) continue;
      const share = Math.min(1, overlap / c.dz), v = vol * share;
      let b = benches.get(k); if (!b) benches.set(k, (b = { floorRL: lo, blocks: 0, vol: 0, gv: 0, vi: 0 }));
      b.blocks += share; b.vol += v; b.gv += v * c.value; if (c.support === "interpolated") b.vi += v;
    }
  }
  return [...benches.values()].sort((a, b) => b.floorRL - a.floorRL).map((b) => {
    const meanGrade = b.vol > 0 ? b.gv / b.vol : null, tonnes = rho && b.vol > 0 ? b.vol * rho : null;
    return { floorRL: b.floorRL, blocks: +b.blocks.toFixed(2), volumeM3: b.vol, meanGrade, tonnes, metal: m && tonnes != null && meanGrade != null ? tonnes * meanGrade * m.factor : null, interpolatedShare: hasSupport && b.vol > 0 ? b.vi / b.vol : null };
  });
}

// the cautionary statement NI 43-101 2.3(2) asks to accompany an exploration target (in substance), shown beside the table
export const EXPLORATION_TARGET_CAUTION = "Any tonnage and grade from this table are conceptual: they describe an exploration target, not a Mineral Resource. There has been insufficient exploration to define a Mineral Resource, and it is uncertain whether further exploration will result in the target being delineated as one. State them as ranges, with the basis (this model, its method and the density used).";

// TASKS.csv #1017 — the grade-tonnage CSV rows (was inline in GradeTonnageModal.jsx). vname: the value column's name;
// density: t/m3 or null (then no tonnes / metal columns); metal: { unit } when a metal column is wanted
// columns (#1577): metalColumns(...) to write the metal as kg / troy oz / t instead of metalOf's own unit
export function gradeTonnageRows(rows, { vname, density = null, metal = null, columns = null }) {
  const mcol = (r) => (columns ? Object.fromEntries(columns.map((c) => [c.key, r.metal == null ? "" : Number((r.metal * c.factor).toPrecision(6))])) : { [`metal_${metal.unit}`]: r.metal == null ? "" : Math.round(r.metal) });
  return rows.map((r) => ({ cutoff: r.cutoff, blocks: r.blocks, volume_m3: Math.round(r.volumeM3), [`mean_${vname}`]: r.meanGrade == null ? "" : Number(r.meanGrade.toPrecision(5)),
    ...(density ? { tonnes: Math.round(r.tonnes || 0) } : {}), ...(density && metal ? mcol(r) : {}),
    ...(r.interpolatedShare != null ? { interpolated_pct: Math.round(r.interpolatedShare * 100) } : {}), ...(r.singleHoleShare != null ? { one_hole_pct: Math.round(r.singleHoleShare * 100) } : {}), ...(r.beyondShare != null ? { beyond_samples_metal_pct: Math.round(r.beyondShare * 100) } : {}) })); // #1409; #2417
}

// TASKS.csv #1216 — the project's measured specific gravity as one density: the length-weighted mean, with what it rests on. A value outside 1-8 t/m3 is
// left out and counted (a percent, or a missing-data code). One figure for every block: it says nothing of density varying with the rock. -> null with no usable row.
export function sgSummary(rows) {
  let sum = 0, len = 0, n = 0, left = 0, min = Infinity, max = -Infinity;
  for (const r of rows || []) {
    const v = Number(r.value), l = Number(r.to) - Number(r.from);
    if (!(l > 0) || r.value == null || r.value === "" || !Number.isFinite(v)) continue;
    if (v < 1 || v > 8) { left++; continue; }
    sum += v * l; len += l; n++; min = Math.min(min, v); max = Math.max(max, v);
  }
  return n ? { mean: +(sum / len).toFixed(3), n, left, min, max } : null;
}
