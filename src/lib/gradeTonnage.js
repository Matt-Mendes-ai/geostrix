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

// cutoffs from the values themselves: 0 and the 25th / 50th / 75th / 90th / 95th percentiles, rounded to 2 significant digits
export function autoCutoffs(cells) {
  const v = cells.map((c) => c.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const r2 = (x) => (x === 0 ? 0 : Number(x.toPrecision(2)));
  return [...new Set([0, ...[0.25, 0.5, 0.75, 0.9, 0.95].map((p) => r2(q(p)))])].sort((a, b) => a - b);
}

// -> [{ cutoff, blocks, volumeM3, meanGrade, tonnes, metal }] (tonnes / metal null without a density); mean grade is
// volume-weighted, over the blocks with value >= cutoff
export function gradeTonnageTable(cells, { cutoffs, density = null, unit = null } = {}) {
  const m = metalOf(unit), rho = Number(density) > 0 ? Number(density) : null;
  const blocks = cells.filter((c) => Number.isFinite(c.value) && c.dx > 0 && c.dy > 0 && c.dz > 0).map((c) => ({ v: c.value, vol: blockVolume(c) }));
  return [...cutoffs].sort((a, b) => a - b).map((cutoff) => {
    let n = 0, vol = 0, gv = 0;
    for (const b of blocks) if (b.v >= cutoff) { n++; vol += b.vol; gv += b.v * b.vol; }
    const meanGrade = vol > 0 ? gv / vol : null, tonnes = rho && vol > 0 ? vol * rho : null;
    return { cutoff, blocks: n, volumeM3: vol, meanGrade, tonnes, metal: m && tonnes != null && meanGrade != null ? tonnes * meanGrade * m.factor : null };
  });
}

// the cautionary statement NI 43-101 2.3(2) asks to accompany an exploration target (in substance), shown beside the table
export const EXPLORATION_TARGET_CAUTION = "Any tonnage and grade from this table are conceptual: they describe an exploration target, not a Mineral Resource. There has been insufficient exploration to define a Mineral Resource, and it is uncertain whether further exploration will result in the target being delineated as one. State them as ranges, with the basis (this model, its method and the density used).";

// TASKS.csv #1017 — the grade-tonnage CSV rows (was inline in GradeTonnageModal.jsx). vname: the value column's name;
// density: t/m3 or null (then no tonnes / metal columns); metal: { unit } when a metal column is wanted
export function gradeTonnageRows(rows, { vname, density = null, metal = null }) {
  return rows.map((r) => ({ cutoff: r.cutoff, blocks: r.blocks, volume_m3: Math.round(r.volumeM3), [`mean_${vname}`]: r.meanGrade == null ? "" : Number(r.meanGrade.toPrecision(5)),
    ...(density ? { tonnes: Math.round(r.tonnes || 0) } : {}), ...(density && metal ? { [`metal_${metal.unit}`]: r.metal == null ? "" : Math.round(r.metal) } : {}) }));
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
