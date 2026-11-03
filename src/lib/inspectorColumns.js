// TASKS.csv #1402 (review #1352, Silvertip) — the layer table showed "from/depth | to | value | extra" for every interval layer:
// 238 lithology rows from 9 holes with no hole, "—" in extra on every row, and the logged descriptions hidden although the search
// matched them. The columns now follow the data: Hole for any hole-based layer (#1233 gave it to structures only), the
// description, a structural zone's intensity and alpha, a mineral's percent, and "extra" only when a row has one.
// -> [{ key, label (English key for tr), get: (row) => value | null, wide?: true }]
const has = (rows, k) => (rows || []).some((r) => r?.[k] != null && r[k] !== "");

export function inspectorColumns(layerKey, rows) {
  const isStructure = layerKey === "structure";
  const cols = [];
  if (has(rows, "hole_id")) cols.push({ key: "hole_id", label: "Hole", get: (r) => r.hole_id });
  cols.push({ key: "from", label: "from/depth", get: (r) => r.from ?? r.depth, num: true });
  if (!isStructure && has(rows, "to")) cols.push({ key: "to", label: "to", get: (r) => r.to, num: true });
  cols.push({ key: "value", label: "value", get: (r) => (r.value == null ? null : String(r.value)) });
  if (isStructure) {
    cols.push({ key: "dip", label: "Dip", get: (r) => r.dip }, { key: "azimuth", label: "Dip dir.", get: (r) => r.azimuth }, { key: "alpha", label: "α", get: (r) => r.alpha }, { key: "beta", label: "β", get: (r) => r.beta });
  } else {
    if (has(rows, "intensity")) cols.push({ key: "intensity", label: "Intensity", get: (r) => r.intensity });
    if (has(rows, "alpha")) cols.push({ key: "alpha", label: "α", get: (r) => r.alpha });
    if (has(rows, "extra")) cols.push({ key: "extra", label: layerKey === "mnlgy" ? "%" : "extra", get: (r) => r.extra });
  }
  if (has(rows, "description")) cols.push({ key: "description", label: "Description", get: (r) => r.description, wide: true });
  return cols;
}

// a cell's text: depths to 2 decimals, blanks as a dash
export function inspectorCell(col, row) {
  const v = col.get(row);
  if (v == null || v === "") return "—";
  return col.num && typeof v === "number" ? v.toFixed(2) : String(v);
}
