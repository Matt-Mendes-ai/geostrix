// TASKS.csv #1257 — a text column mapped to a field that needs numbers: said in the dialog, not as "Loaded 0 collars" afterwards. A warning, not a block: only a preview is
// read, and only a column with no number at all in it is named.
const NUMERIC_KEYS = new Set(["x", "y", "z", "from", "to", "depth", "azimuth", "dip", "length"]);
export const fieldNeedsNumber = (f) => NUMERIC_KEYS.has(f.key) || f.numeric === true;
export function columnHasNoNumbers(rows, column) {
  let seen = 0;
  for (const r of rows || []) {
    const v = r?.[column];
    if (v == null || String(v).trim() === "") continue;
    seen++;
    if (Number.isFinite(Number(String(v).trim().replace(",", ".")))) return false;
  }
  return seen > 0;
}
