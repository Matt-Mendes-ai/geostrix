// TASKS.csv #411 — block model as CSV for estimation / mine-planning software (Datamine, Vulcan, Surpac
// and Leapfrog all import "centroid + block size + attributes" CSV): XC, YC, ZC, XINC, YINC, ZINC and the
// value, plus the estimation's per-block support fields when present. Coordinates are the project CRS.
import { SUPPORT_CODES } from "./estimation.js";
import { capAuditText } from "./geochem.js"; // TASKS.csv #674

// TASKS.csv #529 — the value column / array name carries the unit when the model recorded one: "Au_ppm", not "Au"
// (ppm or ppb? the file couldn't say). g/t and % become "gpt" / "pct" so the name stays a plain identifier.
export function valueColumnName(model) {
  const base = String(model.property || model.params?.element || "value");
  const u = model.params?.unit;
  const unit = u ? String(u).replace(/^g\/t$/i, "gpt").replace(/^%$/, "pct") : "";
  return (unit && !model.property ? `${base}_${unit}` : base).replace(/[^\w]+/g, "_") || "value";
}
export function blockModelRows(model) {
  const valueName = valueColumnName(model);
  return (model.cells || []).map((c) => {
    const row = { XC: +c.x.toFixed(3), YC: +c.y.toFixed(3), ZC: +c.z.toFixed(3), XINC: c.dx, YINC: c.dy, ZINC: c.dz, [valueName]: c.value };
    if (c.nSamples != null) row.N_SAMPLES = c.nSamples;
    if (c.nHoles != null) row.N_HOLES = c.nHoles;
    if (c.support != null) row.SUPPORT = typeof c.support === "number" ? +c.support.toFixed(4) : c.support;
    // #529 — the support class as a number too (software that only reads numeric columns dropped it), and the index
    if (typeof c.support === "string" && SUPPORT_CODES[c.support] != null) row.SUPPORT_CODE = SUPPORT_CODES[c.support];
    if (Number.isFinite(c.supportIndex)) row.SUPPORT_INDEX = +c.supportIndex.toFixed(4);
    return row;
  });
}

// Parameter lines for the file header (provenance stamp, #404): whatever the model recorded.
export function blockModelParamLines(model) {
  const p = model.params || {};
  const lines = [`Block model: ${model.name} (${(model.cells || []).length} blocks, source ${model.source || "import"})`];
  if (p.unit) lines.push(`Values: ${valueColumnName(model)} in ${p.unit}${p.capValue != null ? `; cap ${p.capValue} ${p.capUnit || p.unit}` : ""}`); // #529
  if ((model.cells || []).some((c) => typeof c.support === "string")) lines.push(`SUPPORT_CODE: ${Object.entries(SUPPORT_CODES).map(([k, v]) => `${v} = ${k}`).join(", ")}`);
  Object.entries(p).forEach(([k, v]) => {
    if (v == null || typeof v === "object") return;
    lines.push(`${k}: ${v}`);
  });
  // TASKS.csv #674 — the object-valued params were dropped, so a trended estimate's header gave a 150 m sphere and
  // 16 samples with no ellipsoid, no per-hole limit and no cap audit: not reproducible elsewhere.
  if (p.minHoles > 1 && p.maxSamples > 0) lines.push(`maxSamplesPerHole: ${Math.max(1, Math.ceil(p.maxSamples / p.minHoles))} (max samples / min holes, #642)`);
  const t = p.searchTrend;
  if (t) lines.push(`searchTrend: "${t.name}" dip ${t.dip} towards ${t.dipAzimuth}, pitch ${t.pitch}, ratios ${t.ratios?.max} : ${t.ratios?.int} : ${t.ratios?.min}${t.ellipsoidM ? `; search ellipsoid ${t.ellipsoidM.join(" x ")} m` : ""}`);
  if (p.capAudit) lines.push(`capAudit: ${capAuditText(p.capAudit, p.unit || "")}`);
  if (p.mlsBlocks) lines.push(`mlsBlocks: ${Object.entries(p.mlsBlocks).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  return lines;
}
