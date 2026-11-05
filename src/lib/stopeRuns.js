// TASKS.csv #1968 — the stope solids in a project, grouped by the run that made them, so they can be managed together (Stope
// outlines pane: show / hide all, remove all, a run, a level) and shown as one row per run in 3D Modelling's surface list. Matt
// (Treaty Creek): "we need a way to delete all stopes at once. Also, I want it to live in the stopes section not at the 3d
// modelling". Found by type "stope" in the generated surfaces, not by what the pane remembers, so it works after a reopen.
// A run made since this change carries params.runId; earlier ones group by what made them (model, cut-off, width, skin, density).

export const isStopeString = (s) => typeof s?.id === "string" && s.id.startsWith("string_stope_"); // the outline strings the pane sends
export function stopeRunKey(s) {
  const p = s?.params || {};
  return p.runId || ["earlier", p.blockModel ?? "", p.cutoff ?? "", p.minWidthM ?? "", p.skinM ?? "", p.density ?? ""].join("|");
}
// -> [{ key, model, cutoff, unit, ids, count, levels [rl...], tonnes, visible (count shown), when (ISO) }] newest first
export function stopeRuns(surfaces) {
  const runs = new Map();
  for (const s of surfaces || []) {
    if (s?.type !== "stope") continue;
    const k = stopeRunKey(s), p = s.params || {};
    let r = runs.get(k);
    if (!r) { r = { key: k, model: p.blockModel || "", cutoff: p.cutoff, unit: p.gradeUnit || "", ids: [], levels: new Set(), tonnes: 0, visible: 0, when: p.generatedAt || "" }; runs.set(k, r); }
    r.ids.push(s.id);
    if (Number.isFinite(p.levelRL)) r.levels.add(Math.round(p.levelRL));
    r.tonnes += Number(p.tonnes) || 0;
    if (s.visible !== false) r.visible++;
    if (p.generatedAt && (!r.when || p.generatedAt < r.when)) r.when = p.generatedAt;
  }
  return [...runs.values()].map((r) => ({ ...r, levels: [...r.levels].sort((a, b) => a - b), count: r.ids.length })).sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
}
// the ids of one run's stopes on one level
export function stopeIdsOnLevel(surfaces, key, rl) {
  return (surfaces || []).filter((s) => s?.type === "stope" && stopeRunKey(s) === key && Math.round(s.params?.levelRL) === rl).map((s) => s.id);
}
// the outline strings of a run (tagged since this change), or every stope outline string (run null)
export function stopeStringIds(strings, runKey = null) {
  return (strings || []).filter((s) => isStopeString(s) && (runKey == null || s.stopeRun === runKey)).map((s) => s.id);
}
