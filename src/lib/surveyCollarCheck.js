// TASKS.csv #3202 (#3195, Galore Creek) — a survey file's ids with no collar (91 test-pit and hand-pit ids, one station each) were kept without a
// word, counted as holes in the survey-method sentence ('107 of 161 hole(s)'; 16 of the 70 holes is right) and raised by Data QC as 91 errors.
// Pure: the ids of a survey table with no collar among `collars`, and their station count.
// rows: raw rows (holeCol: the hole id column) or stations ({ hole_id }); -> { ids: [..first seen order], stations } or null (none, or no collars)
export function surveyIdsWithoutCollar(rows, collars, holeCol = "hole_id") {
  if (!(collars || []).length || !(rows || []).length) return null;
  const known = new Set(collars.map((c) => String(c.hole_id)));
  const m = new Map();
  for (const r of rows) { const id = String(r?.[holeCol] ?? "").trim(); if (id && !known.has(id)) m.set(id, (m.get(id) || 0) + 1); }
  return m.size ? { ids: [...m.keys()], stations: [...m.values()].reduce((a, b) => a + b, 0) } : null;
}
export const idList = (ids, max = 5) => ids.slice(0, max).join(", ") + (ids.length > max ? ", …" : "");
