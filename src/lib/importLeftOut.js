// TASKS.csv #2493 (review #2486, WA lithium) — what an import left out of a built-in layer, kept with the project so Data QC can say it later
// (the import notice said it once, then it was gone; a custom layer keeps its own `notes`, #2432). Saved in the project object:
// project.importLeftOut = { [layerKey]: { [file]: { n, total, why: { [reason]: count } } } }; a re-import of the same file replaces its entry,
// one with nothing left out removes it. Reasons are the import's English keys (lib/viewer/importHelpers.js SKIP_REASONS). Pure.

export function withImportLeftOut(project, layerKey, file, dropped, total) {
  if (!project || !layerKey || !file) return project;
  const had = project.importLeftOut?.[layerKey]?.[file];
  if (!dropped?.length && !had) return project;
  const layer = { ...(project.importLeftOut?.[layerKey] || {}) };
  if (dropped?.length) {
    const why = {};
    for (const d of dropped) why[d.reason] = (why[d.reason] || 0) + 1;
    layer[file] = { n: dropped.length, total: total ?? null, why };
  } else delete layer[file];
  const all = { ...(project.importLeftOut || {}) };
  if (Object.keys(layer).length) all[layerKey] = layer; else delete all[layerKey];
  const next = { ...project };
  if (Object.keys(all).length) next.importLeftOut = all; else delete next.importLeftOut;
  return next;
}

// The entries as a list: [{ layerKey, file, n, total, why: [[reason, count]] }], largest first
export function importLeftOutList(project) {
  const out = [];
  for (const [layerKey, files] of Object.entries(project?.importLeftOut || {}))
    for (const [file, e] of Object.entries(files || {})) out.push({ layerKey, file, n: e.n, total: e.total, why: Object.entries(e.why || {}).sort((a, b) => b[1] - a[1]) });
  return out.sort((a, b) => b.n - a.n);
}
