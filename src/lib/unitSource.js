// TASKS.csv #2378 (review #2325, WA uranium) — which field of the Lithology rows the modelling tools read as the unit. A sedimentary log
// carries the rock code and the stratigraphic unit on the same intervals (WA palaeochannel: lithology SST / SAN / LIG ... and strat QA /
// I / H ... E1); every tool read the Lithology value only, so modelling the stack meant re-importing with the unit as the value, after
// which the rock code (and the lignite body) could no longer be modelled in the same project. Pure: no React.

// row keys that are not extra fields of an interval row (normInterval / applyCustomFields put custom fields on the row by name)
const NOT_FIELDS = new Set(["hole_id", "from", "to", "value", "depth", "id", "tip", "color", "colour", "extra", "values", "description", "logged", "source", "dataset", "_src", "_file"]);
const FREE_TEXT = /desc|comment|note|remark|observ/i;

// -> [{ name, distinct, rows }]: the category extra fields of these rows (text values, up to maxDistinct of them), the most filled first.
// Reads at most `sample` rows spread over the layer (a 150,000-row log is not walked on every render).
export function unitSourceFields(rows, { maxDistinct = 300, sample = 6000 } = {}) {
  const list = rows || [];
  if (!list.length) return [];
  const step = Math.max(1, Math.floor(list.length / sample));
  const stats = new Map();
  for (let i = 0; i < list.length; i += step) {
    const r = list[i];
    for (const k in r) {
      if (NOT_FIELDS.has(k) || k.startsWith("_") || FREE_TEXT.test(k)) continue;
      const v = r[k];
      if (typeof v !== "string") { if (v != null && v !== "") { const s = stats.get(k) || { rows: 0, set: new Set(), numeric: 0 }; s.numeric++; stats.set(k, s); } continue; }
      const t = v.trim();
      if (!t) continue;
      const s = stats.get(k) || { rows: 0, set: new Set(), numeric: 0 };
      s.rows++;
      if (s.set.size <= maxDistinct) s.set.add(t);
      stats.set(k, s);
    }
  }
  return [...stats.entries()]
    .filter(([, s]) => s.rows > 0 && s.rows >= s.numeric && s.set.size <= maxDistinct)
    .map(([name, s]) => ({ name, distinct: s.set.size, rows: s.rows * step }))
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
}

// layers with the Lithology value taken from `field` (the rock code kept as `rock`); rows with no value in that field are left out, as
// an import leaves out a blank code. No field: the layers themselves.
export function applyUnitSource(layers, field) {
  if (!field || !layers?.litho) return layers;
  const litho = [];
  for (const r of layers.litho) {
    const v = r[field];
    const t = v == null ? "" : String(v).trim();
    if (t) litho.push({ ...r, value: t, rock: r.value });
  }
  return { ...layers, litho };
}
