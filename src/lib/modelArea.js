// TASKS.csv #1546 (review #1497, Lawyers) — "Model area": the modelling tools can read only the holes checked in the Holes
// list. On a district with prospects 10 km apart one GemPy box spanned them all (239-282 m cells, 6-59 % of the logged
// metres reproduced); checking one prospect's holes gives that prospect its own box and cell size. Pure helpers.
const hidden = (visibleHoles, holeId) => !!visibleHoles && visibleHoles[holeId] === false;

// every drillhole layer restricted to the checked holes; rows without a hole id (geophys_pts) and non-array entries untouched
export function restrictLayersToHoles(layers, visibleHoles) {
  const out = {};
  for (const [k, rows] of Object.entries(layers || {})) out[k] = Array.isArray(rows) ? rows.filter((r) => r?.hole_id == null || !hidden(visibleHoles, r.hole_id)) : rows;
  return out;
}

// TASKS.csv #2059 (review #2013, Woodjam) — the same rule for a flat row list (assays, a log or a custom layer's rows): the grade
// shell read every hole's assays whatever the Model area said, and gridded a 5 x 4 km property for one prospect's 3 holes
export function restrictRowsToHoles(rows, visibleHoles) {
  return (rows || []).filter((r) => r?.hole_id == null || !hidden(visibleHoles, r.hole_id));
}

export function checkedHoleCount(collars, visibleHoles) {
  const all = (collars || []).length;
  return { checked: (collars || []).filter((c) => !hidden(visibleHoles, c.hole_id)).length, all };
}

// the fit notice's advice: a typical miss over half a mesh cell is a cell-size problem, and a smaller area is the cheaper cure
export const missOverHalfCell = (fit) => !!fit && Number.isFinite(fit.typical) && Number.isFinite(fit.cell) && fit.typical > fit.cell / 2;
