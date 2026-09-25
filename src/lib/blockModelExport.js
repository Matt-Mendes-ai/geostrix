// TASKS.csv #411 — block model as CSV for estimation / mine-planning software (Datamine, Vulcan, Surpac
// and Leapfrog all import "centroid + block size + attributes" CSV): XC, YC, ZC, XINC, YINC, ZINC and the
// value, plus the estimation's per-block support fields when present. Coordinates are the project CRS.
export function blockModelRows(model) {
  const valueName = String(model.property || model.params?.element || "value").replace(/[^\w]+/g, "_") || "value";
  return (model.cells || []).map((c) => {
    const row = { XC: +c.x.toFixed(3), YC: +c.y.toFixed(3), ZC: +c.z.toFixed(3), XINC: c.dx, YINC: c.dy, ZINC: c.dz, [valueName]: c.value };
    if (c.nSamples != null) row.N_SAMPLES = c.nSamples;
    if (c.nHoles != null) row.N_HOLES = c.nHoles;
    if (c.support != null) row.SUPPORT = typeof c.support === "number" ? +c.support.toFixed(4) : c.support;
    return row;
  });
}

// Parameter lines for the file header (provenance stamp, #404): whatever the model recorded.
export function blockModelParamLines(model) {
  const p = model.params || {};
  const lines = [`Block model: ${model.name} (${(model.cells || []).length} blocks, source ${model.source || "import"})`];
  Object.entries(p).forEach(([k, v]) => {
    if (v == null || typeof v === "object") return;
    lines.push(`${k}: ${v}`);
  });
  return lines;
}
