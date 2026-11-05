// TASKS.csv #1501 (review #1497, Lawyers) — a log table committed without the mapping dialog (a folder drop) kept only the one column
// its layer takes: Recovery % of the Geotech table, Mag Max, a structure's Width (cm) and Description, a vein's Dist %, Texture and
// Average Width were dropped, and the notice said nothing. The columns the layer does not take now travel as extra fields (the
// dialog's custom fields, which Identify lists), and a Geotech table with a Recovery % column fills the Recovery % layer too.

const RESERVED = new Set(["hole_id", "from", "to", "depth", "value", "extra", "values", "id", "tip", "color", "dip", "azimuth", "alpha", "beta", "type", "x", "y", "z"]);
const FREE_TEXT = /desc|comment|note|remark|observ/i;
const num = (v) => Number(String(v).trim().replace(",", "."));

// -> [{ column, name, type: "number" | "category" }] for every column the mapping leaves out that carries values: numbers when 90 %
// of the filled cells are numbers, else categories (up to maxDistinct values, or a description / comment column of any length).
export function autoExtraFields(headers, rows, mapping, { maxDistinct = 100, exclude = [] } = {}) {
  const used = new Set([...Object.values(mapping || {}).filter(Boolean), ...exclude]);
  const out = [];
  for (const h of headers || []) {
    if (!h || used.has(h) || String(h).startsWith("_")) continue;
    let filled = 0, numeric = 0;
    const distinct = new Set();
    for (const r of rows || []) {
      const v = r[h];
      if (v == null || String(v).trim() === "") continue;
      filled++;
      if (Number.isFinite(num(v))) numeric++;
      if (distinct.size <= maxDistinct) distinct.add(String(v).trim());
    }
    if (!filled) continue;
    const name = RESERVED.has(String(h).trim().toLowerCase()) ? `${h} (file)` : String(h);
    if (numeric >= filled * 0.9) out.push({ column: h, name, type: "number" });
    else if (distinct.size <= maxDistinct || FREE_TEXT.test(h)) out.push({ column: h, name, type: "category" });
  }
  return out;
}

// A second layer the same file fills: a Geotech (RQD %) table's recovery percentage column -> Recovery %. -> { target, column } or null
export function companionLayer(target, headers) {
  if (target !== "geotech") return null;
  const col = (headers || []).find((h) => /recover/i.test(h) && /%|pct|percent/i.test(h));
  return col ? { target: "recovery", column: col } : null;
}
