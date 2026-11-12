// TASKS.csv #2886 (review #2876, WA bedded iron) — bores.csv (98 water bores, Dip = 90 on every row) was imported with 'Negative = down'
// pre-selected: the 98 holes were stored pointing up and drawn 40-166 m above the ground, and only Data QC said so, per hole. The dialog
// now reads the file's dips: every one positive and steep (45° or more) -> 'Positive = down' is pre-selected and the dialog says why;
// the import notice counts the holes left pointing up. Pure: no UI.

const STEEP = 45;
const toNum = (v) => (typeof v === "number" ? v : v == null || v === "" ? NaN : Number(String(v).replace(",", ".")));

// rows: the file's rows; dipCol: the mapped Dip column (null: the table has no dip). -> { convention, n, positive, negative, steep }
// convention "pos_down" only when no dip is negative and at least 90 % of the positive ones are steep; else the industry standard.
export function guessDipConvention(rows, dipCol) {
  let n = 0, positive = 0, negative = 0, steep = 0;
  if (dipCol) for (const r of rows || []) {
    const d = toNum(r?.[dipCol]);
    if (!Number.isFinite(d) || d === 0) continue;
    n++;
    if (d < 0) negative++; else { positive++; if (d >= STEEP) steep++; }
  }
  const convention = !negative && positive > 0 && steep >= 0.9 * positive ? "pos_down" : "neg_down";
  return { convention, n, positive, negative, steep };
}
// the modal fields for a table with a dip: the convention and, when the file decided it, the counts the dialog states
export function dipConventionFields(rows, dipCol) {
  const g = guessDipConvention(rows, dipCol);
  return { dipConvention: g.convention, ...(g.convention === "pos_down" ? { dipGuess: { n: g.positive } } : {}) };
}
// the holes left pointing up after the sign is applied (stored dips are degrees below horizontal: a negative one points up, #339)
export function upwardHoles(rows) {
  const up = new Set();
  for (const r of rows || []) if (Number.isFinite(r?.dip) && r.dip < 0 && r.hole_id) up.add(r.hole_id);
  return [...up];
}
