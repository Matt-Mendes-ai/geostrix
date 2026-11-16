// TASKS.csv #3821 — the small helpers the planned-hole checks need from the pit shell's file (an estimate block's support, a model's element, a grade's unit text). pitShell.js is
// 80 kB and reaches the Pit shell pane: plannedHoleChecks.js is imported by the 3D view's eager ViewerParts, so it took them into the startup chunk (+22 kB). They live here
// and pitShell.js re-exports them, so every existing import still works.
// TASKS.csv #1617 (review #1497, Lawyers) — a block the estimate itself called single-hole (one hole carrying at least this share of
// the weight, estimation.js DOMINANT_SHARE; test/oneHoleShare1617 keeps the two equal) counts as one hole's ore in the pit, as a
// block with nHoles 1 does: Lawyers' pit said 'Ore from one hole 0 %' while its estimate had called 160 blocks single-hole in effect
export const ONE_HOLE_SHARE = 0.95;
export const oneHoleBlock = (c) => c.nHoles === 1 || c.holeShare >= ONE_HOLE_SHARE;
const OXIDE_IN = /(?:^|[^A-Za-z0-9])(e?U3O8)(?![A-Za-z0-9])/i;
export const elementOfModel = (model) => {
  const el = model?.params?.element;
  const ox = OXIDE_IN.exec(String(el || "")) || (!el ? OXIDE_IN.exec(String(model?.name || "")) : null);
  if (ox) return /^e/i.test(ox[1]) ? "eU3O8" : "U3O8";
  return el || (/^([A-Z][a-z]?)\b/.exec(String(model?.name || "")) || [])[1] || null;
};
export const PRECIOUS = new Set(["Au", "Ag", "Pt", "Pd", "Rh", "Ir", "Os", "Ru"]);
export const gradeUnitText = (unit, element) => (/^ppm$/i.test(String(unit || "")) && PRECIOUS.has(element) ? "g/t" : unit || "");
