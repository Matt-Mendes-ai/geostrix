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

// TASKS.csv #3079 (from #3011) — the downhole range as the flat search's vertical reach: the next Estimation dialog opens with a flat search of
// `radiusM` across and `reachM` up and down (the dialog's Search radius and Vertical reach). Never applied by itself: this is the geologist's click.
export function sendFlatSearchToEstimation(project, { radiusM, reachM }) {
  const key = estimateSettingsKey(project), prev = lastEstimateSettings.get(key) || {};
  const next = { ...prev, searchRadius: +Number(radiusM).toPrecision(4), flatReach: +Number(reachM).toPrecision(4) };
  lastEstimateSettings.set(key, next);
  return next;
}
// the continuity down the holes against the continuity between them, from two fits (each { range }): the ratio and a flat search that follows it
// TASKS.csv #3786 (Scottie Gold) — 'A flat search fits: 60 m across and 6 m up and down' came from a between-holes fit of r² 0.04 (the dialog called it unconstrained two lines below), on holes
// dipping 41-67 degrees through a steep zone. No conclusion from a fit under minR2 (weak), and a flat search only where the holes are near-vertical (vertical: verticalShare >= 0.5, the test
// 'Compute both' uses); on inclined holes 'down the holes' is not 'up and down'.
export const ANISOTROPY_MIN_R2 = 0.3;
export function anisotropyFromFits(downhole, across, { minR2 = ANISOTROPY_MIN_R2, vertical = true } = {}) {
  const a = Number(downhole?.range), b = Number(across?.range);
  if (!(a > 0) || !(b > 0)) return null;
  const weakOf = (f) => f?.rSquared != null && Number.isFinite(f.rSquared) && f.rSquared < minR2;
  const weak = weakOf(downhole) || weakOf(across);
  return { downholeM: a, acrossM: b, ratio: b / a, weak, weakFit: weak ? (weakOf(across) ? "across" : "downhole") : null, inclined: !vertical, flat: !weak && vertical && b / a >= 2 };
}

// TASKS.csv #3499 (from #3079) — the Variogram tool's last anisotropy (downhole and across ranges) per project and element, for the Grade shell
// pane's offer of the flat search. Session only, like the rest of this module.
const anisotropyMemory = new Map();
export function rememberAnisotropy(project, symbol, an) { if (an && symbol) anisotropyMemory.set(`${estimateSettingsKey(project)}|${symbol}`, an); }
export const anisotropyFor = (project, symbol) => anisotropyMemory.get(`${estimateSettingsKey(project)}|${symbol}`) || null;

// TASKS.csv #3508 (from #3499) - the block height that goes with a flat search from the downhole range: a quarter of it (four cells down a range),
// to the half metre, at least half a metre. A suggestion the geologist applies with the flat search; never by itself.
export const cellHeightFromRange = (downholeM) => (Number(downholeM) > 0 ? Math.max(0.5, Math.round((Number(downholeM) / 4) * 2) / 2) : null);
