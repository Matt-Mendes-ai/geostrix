// TASKS.csv #1580 — the Estimation dialog's settings per project, so it reopens as it was left (was inside GradeEstimationModal.jsx).
// TASKS.csv #3273 (Galore Creek review) — moved here so the Variogram tool can hand the dialog a fitted model ("Use this model in
// Estimation") without loading the dialog: three fits of one variogram, and the numbers had to be retyped by hand.
export const lastEstimateSettings = new Map(); // project key -> settings
export const estimateSettingsKey = (project) => String(project?.id ?? project?.name ?? "");

// the next Estimation dialog of the project opens on ordinary kriging for `symbol` with this model. A cap (and per-domain caps) kept for
// another element is dropped, as the dialog itself does when the element changes (#1736). `from` says where the model came from.
export function sendVariogramToEstimation(project, { symbol, model, nugget, sill, range, from = "" }) {
  const key = estimateSettingsKey(project), prev = lastEstimateSettings.get(key) || {};
  const next = { ...prev, sourceKey: "assay", symbol, method: "ok", vgModel: model || "spherical",
    vgNugget: String(+Number(nugget).toPrecision(4)), vgSill: String(+Number(sill).toPrecision(4)), vgRange: String(+Number(range).toPrecision(4)), vgFrom: from };
  if (prev.symbol !== symbol) { delete next.capValue; delete next.capByDomain; }
  lastEstimateSettings.set(key, next);
  return next;
}
