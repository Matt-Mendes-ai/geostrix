// TASKS.csv #411 — block model as CSV for estimation / mine-planning software (Datamine, Vulcan, Surpac
// and Leapfrog all import "centroid + block size + attributes" CSV): XC, YC, ZC, XINC, YINC, ZINC and the
// value, plus the estimation's per-block support fields when present. Coordinates are the project CRS.
import { SUPPORT_CODES, perHoleCap } from "./estimation.js"; // perHoleCap: #1049
import { capAuditText } from "./geochem.js"; // TASKS.csv #674
import { FORMULA_LEAD } from "./tabular.js"; // TASKS.csv #1041

// TASKS.csv #529 — the value column / array name carries the unit when the model recorded one: "Au_ppm", not "Au"
// (ppm or ppb? the file couldn't say). g/t and % become "gpt" / "pct" so the name stays a plain identifier.
// TASKS.csv #1026 (review #1016) — the Data Support Index and kriging-variance models copy the estimate's params, so
// they went out as "Au_ppm ... in ppm" holding 0-1 indices or ppm-squared variances. Their value is named and unitized
// from their source (which also covers models saved before this): SUPPORT_INDEX (no unit), KV_Au_ppm2 (ppm squared).
export function derivedValue(model) {
  const src = String(model?.source || ""), el = model?.params?.element, u = model?.params?.unit;
  if (/^support-index-/.test(src)) return { property: "SUPPORT_INDEX", unit: null };
  if (src === "kriging-variance") {
    const tag = u ? String(u).replace(/^g\/t$/i, "gpt").replace(/^%$/, "pct") : "";
    return { property: `KV${el ? `_${el}` : ""}${tag ? `_${tag}2` : ""}`, unit: u ? `${u} squared` : null };
  }
  return null;
}
export function valueUnit(model) { const d = derivedValue(model); return d ? d.unit : model?.params?.unit || null; }
export const NOT_A_RESOURCE_SOURCE = /^(estimate|support-index)-|^geoml$|^kriging-variance$/; // #1026 — kriging variance too
export function valueColumnName(model) {
  const d = !model.property && derivedValue(model);
  if (d) return d.property.replace(/[^\w]+/g, "_");
  const base = String(model.property || model.params?.element || "value");
  const u = model.params?.unit;
  const unit = u ? String(u).replace(/^g\/t$/i, "gpt").replace(/^%$/, "pct") : "";
  return (unit && !model.property ? `${base}_${unit}` : base).replace(/[^\w]+/g, "_") || "value";
}
// TASKS.csv #1050 (review #1016, resource geologist) — the numeric per-block fields beside the value, for the writers that
// carry arrays rather than CSV columns (VTK CELL_DATA, OMF data). VTK wrote only the value (named "value", with no
// element or unit) and OMF value + support, so COVERAGE (#943: a merged block's real share), KV and the sample counts
// never left the app except in the CSV. Names as the CSV's columns. -> [{ name, get }] for the fields some cell carries
const num = (v) => (Number.isFinite(v) ? v : null);
const CELL_FIELDS = [
  ["N_SAMPLES", (c) => num(c.nSamples)], ["N_HOLES", (c) => num(c.nHoles)],
  ["SUPPORT", (c) => (typeof c.support === "number" ? num(c.support) : null)],
  ["SUPPORT_CODE", (c) => (typeof c.support === "string" && SUPPORT_CODES[c.support] != null ? SUPPORT_CODES[c.support] : null)],
  ["SUPPORT_INDEX", (c) => num(c.supportIndex)], ["COVERAGE", (c) => num(c.coverage)], ["KV", (c) => num(c.kv)], ["NEAREST_M", (c) => num(c.nearestSampleM)],
  // TASKS.csv #1044 — a vector (MVI) inversion's magnetization direction per cell: inclination positive down, declination
  // clockwise from GRID north (potential.py _inc_dec); the direction is the point of choosing MVI, and no writer kept it
  ["INC_DEG", (c) => num(c.inc)], ["DEC_GRID_DEG", (c) => num(c.dec)],
];
export function numericCellFields(cells) {
  return CELL_FIELDS.filter(([, get]) => (cells || []).some((c) => get(c) != null)).map(([name, get]) => ({ name, get }));
}

// TASKS.csv #979 — the centroid and size column names: Datamine's (also read by Vulcan, Surpac and Leapfrog) or
// Micromine's, which the block-model import already recognizes (#659), so a Micromine user does not map six fields
export const BLOCK_COLUMN_NAMES = {
  datamine: ["XC", "YC", "ZC", "XINC", "YINC", "ZINC"],
  micromine: ["EAST", "NORTH", "RL", "_EAST", "_NORTH", "_RL"],
};
export function blockModelRows(model, names = "datamine") {
  const valueName = valueColumnName(model);
  const [X, Y, Z, DX, DY, DZ] = BLOCK_COLUMN_NAMES[names] || BLOCK_COLUMN_NAMES.datamine;
  return (model.cells || []).map((c) => {
    const row = { [X]: +c.x.toFixed(3), [Y]: +c.y.toFixed(3), [Z]: +c.z.toFixed(3), [DX]: +Number(c.dx).toFixed(4), [DY]: +Number(c.dy).toFixed(4), [DZ]: +Number(c.dz).toFixed(4), /* #978 — sizes saved as Float32 read back as 3.3329999446868896 */ [valueName]: c.value };
    if (c.nSamples != null) row.N_SAMPLES = c.nSamples;
    if (c.nHoles != null) row.N_HOLES = c.nHoles;
    if (c.support != null) row.SUPPORT = typeof c.support === "number" ? +c.support.toFixed(4) : c.support;
    // #529 — the support class as a number too (software that only reads numeric columns dropped it), and the index
    if (typeof c.support === "string" && SUPPORT_CODES[c.support] != null) row.SUPPORT_CODE = SUPPORT_CODES[c.support];
    if (Number.isFinite(c.supportIndex)) row.SUPPORT_INDEX = +c.supportIndex.toFixed(4);
    // TASKS.csv #943 — a block merged on import (over the cell budget) is a full coarse cell; the share of it the source
    // model's blocks filled, and that real volume, so tonnage is not taken from the block size
    if (Number.isFinite(c.coverage)) { row.COVERAGE = +c.coverage.toFixed(4); row.VOLUME_M3 = +(c.coverage * c.dx * c.dy * c.dz).toFixed(3); }
    // TASKS.csv #1049 (review #1016, resource geologist) — every kriged block carries its kriging variance and every
    // estimated one its nearest-sample distance; neither reached the CSV
    if (Number.isFinite(c.kv)) row.KV = +c.kv.toPrecision(6);
    if (Number.isFinite(c.nearestSampleM)) row.NEAREST_M = +c.nearestSampleM.toFixed(2);
    if (Number.isFinite(c.inc)) row.INC_DEG = +c.inc.toFixed(1); // #1044
    if (Number.isFinite(c.dec)) row.DEC_GRID_DEG = +c.dec.toFixed(1);
    return row;
  });
}

// TASKS.csv #1041 (review #1016, performance #4) — blockModelRows + Papa.unparse took 33 s and +0.8 GB of heap for 1M
// blocks (49 s / +1.55 GB for 2M) on the UI thread: an object per block, then every value back to a string and regex-
// checked. This writes the same text (same columns in the same first-seen order, the same number formatting, Papa's
// quoting and CRLF line ends, no trailing newline: test/blockModelCsv1041.test.mjs compares the two) straight from the
// cells, in chunks of `chunk` lines; blockModelCsvText awaits between chunks so the window repaints.
const csvCell = (v) => {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  let s = String(v), q = false;
  if (typeof v === "string" && FORMULA_LEAD.test(s)) { s = "'" + s; q = true; }
  const e = s.replace(/"/g, '""');
  if (q || /[\r\n",\uFEFF]/.test(e) || e[0] === " " || e[e.length - 1] === " ") return `"${e}"`;
  return e;
};
export function* blockModelCsvChunks(model, names = "datamine", chunk = 50000) {
  const cells = model.cells || [];
  if (!cells.length) return;
  const valueName = valueColumnName(model);
  const OPT = ["N_SAMPLES", "N_HOLES", "SUPPORT", "SUPPORT_CODE", "SUPPORT_INDEX", "COVERAGE", "VOLUME_M3", "KV", "NEAREST_M", "INC_DEG", "DEC_GRID_DEG"]; // KV / NEAREST_M: #1049; INC / DEC: #1044
  const has = (c) => [c.nSamples != null, c.nHoles != null, c.support != null, typeof c.support === "string" && SUPPORT_CODES[c.support] != null, Number.isFinite(c.supportIndex), Number.isFinite(c.coverage), Number.isFinite(c.coverage), Number.isFinite(c.kv), Number.isFinite(c.nearestSampleM), Number.isFinite(c.inc), Number.isFinite(c.dec)];
  // the columns in the order toExportCsv's union of row keys gives: the base seven, then each optional one where it first appears
  const fields = [...(BLOCK_COLUMN_NAMES[names] || BLOCK_COLUMN_NAMES.datamine), valueName], seen = new Set();
  for (let i = 0; i < cells.length && seen.size < OPT.length; i++) has(cells[i]).forEach((h, k) => { if (h && !seen.has(k)) { seen.add(k); fields.push(OPT[k]); } });
  const col = Object.fromEntries(OPT.map((k) => [k, fields.indexOf(k)]));
  const width = fields.length;
  let lines = [fields.map(csvCell).join(",")];
  const row = new Array(width);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    row.fill("");
    row[0] = String(+c.x.toFixed(3)); row[1] = String(+c.y.toFixed(3)); row[2] = String(+c.z.toFixed(3));
    row[3] = String(+Number(c.dx).toFixed(4)); row[4] = String(+Number(c.dy).toFixed(4)); row[5] = String(+Number(c.dz).toFixed(4));
    row[6] = csvCell(c.value);
    if (c.nSamples != null) row[col.N_SAMPLES] = csvCell(c.nSamples);
    if (c.nHoles != null) row[col.N_HOLES] = csvCell(c.nHoles);
    if (c.support != null) row[col.SUPPORT] = typeof c.support === "number" ? String(+c.support.toFixed(4)) : csvCell(c.support);
    if (typeof c.support === "string" && SUPPORT_CODES[c.support] != null) row[col.SUPPORT_CODE] = csvCell(SUPPORT_CODES[c.support]);
    if (Number.isFinite(c.supportIndex)) row[col.SUPPORT_INDEX] = String(+c.supportIndex.toFixed(4));
    if (Number.isFinite(c.coverage)) { row[col.COVERAGE] = String(+c.coverage.toFixed(4)); row[col.VOLUME_M3] = String(+(c.coverage * c.dx * c.dy * c.dz).toFixed(3)); }
    if (Number.isFinite(c.kv)) row[col.KV] = String(+c.kv.toPrecision(6));
    if (Number.isFinite(c.nearestSampleM)) row[col.NEAREST_M] = String(+c.nearestSampleM.toFixed(2));
    if (Number.isFinite(c.inc)) row[col.INC_DEG] = String(+c.inc.toFixed(1));
    if (Number.isFinite(c.dec)) row[col.DEC_GRID_DEG] = String(+c.dec.toFixed(1));
    lines.push(row.join(","));
    if (lines.length >= chunk) { yield lines.join("\r\n"); lines = []; }
  }
  if (lines.length) yield lines.join("\r\n");
}
export const blockModelCsvTextSync = (model, names) => [...blockModelCsvChunks(model, names)].join("\r\n");
export async function blockModelCsvText(model, names = "datamine", onProgress = null) {
  const out = [], n = (model.cells || []).length;
  let done = 0;
  for (const part of blockModelCsvChunks(model, names)) {
    out.push(part);
    done = Math.min(n, done + 50000);
    if (onProgress) onProgress(done, n);
    if (n > 200000) await new Promise((r) => setTimeout(r, 0)); // let the window repaint
  }
  return out.join("\r\n");
}

// Parameter lines for the file header (provenance stamp, #404): whatever the model recorded.
export function blockModelParamLines(model) {
  const p = model.params || {};
  const lines = [`Block model: ${model.name} (${(model.cells || []).length} blocks, source ${model.source || "import"})`];
  if (derivedValue(model)) lines.push(`Values: ${valueColumnName(model)}${valueUnit(model) ? ` in ${valueUnit(model)}` : " (no unit)"}`); // #1026
  else if (p.unit) lines.push(`Values: ${valueColumnName(model)} in ${p.unit}${p.capValue != null ? `; cap ${p.capValue} ${p.capUnit || p.unit}` : ""}`); // #529
  if ((model.cells || []).some((c) => Number.isFinite(c.coverage))) lines.push("COVERAGE: the share of each block filled by the imported model's own blocks (blocks were merged on import to fit the cell budget); VOLUME_M3 = COVERAGE x the block size. Take volume and tonnage from VOLUME_M3, not from the block size."); // #943
  if ((model.cells || []).some((c) => typeof c.support === "string")) lines.push(`SUPPORT_CODE: ${Object.entries(SUPPORT_CODES).map(([k, v]) => `${v} = ${k}`).join(", ")}`);
  Object.entries(p).forEach(([k, v]) => {
    if (v == null || typeof v === "object" || k === "maxSamplesPerHole") return; // the per-hole cap: once, as applied (below)
    lines.push(`${k}: ${v}`);
  });
  // TASKS.csv #674 — the object-valued params were dropped, so a trended estimate's header gave a 150 m sphere and
  // 16 samples with no ellipsoid, no per-hole limit and no cap audit: not reproducible elsewhere.
  // #1049 — the cap the estimator applied (perHoleCap: the smaller of an entered max per hole and max / min holes); the
  // entered value and the implicit one were printed as two disagreeing "maxSamplesPerHole" lines (3, then 8)
  if (p.maxSamples > 0 && (p.minHoles > 1 || p.maxSamplesPerHole > 0)) {
    const cap = perHoleCap(p.maxSamples, p.minHoles || 1, p.maxSamplesPerHole || 0), implicit = p.minHoles > 1 ? Math.max(1, Math.ceil(p.maxSamples / p.minHoles)) : null;
    lines.push(`maxSamplesPerHole: ${cap} applied (${[p.maxSamplesPerHole > 0 ? `entered ${p.maxSamplesPerHole}` : null, implicit != null ? `max samples / min holes = ${implicit}` : null].filter(Boolean).join("; the smaller of: ")})`);
  }
  // #1049 — the variogram ordinary kriging used, and how the blocks were kriged: without them the estimate cannot be redone
  const vg = p.variogram;
  if (vg) lines.push(`variogram: ${vg.model}, nugget ${vg.nugget}, sill ${vg.sill}, range ${vg.range} m, ${vg.fitted ? `fitted to the composites at run time${vg.lagM ? ` (lag ${vg.lagM} m)` : ""}` : "entered"}${vg.frame ? `, ${vg.frame}` : ""}`);
  const kb = p.krigingBlocks;
  if (kb) lines.push(`krigingBlocks: ${Object.entries(kb).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if ((model.cells || []).some((c) => Number.isFinite(c.kv))) lines.push(`KV: the block's ordinary-kriging variance${p.unit ? ` (${p.unit} squared)` : ""}, from the data layout under the variogram: not a grade error`);
  if ((model.cells || []).some((c) => Number.isFinite(c.nearestSampleM))) lines.push("NEAREST_M: distance from the block centre to the nearest composite used, metres");
  if ((model.cells || []).some((c) => Number.isFinite(c.inc))) lines.push("INC_DEG / DEC_GRID_DEG: the cell's magnetization direction from the vector inversion: inclination in degrees, positive down; declination in degrees clockwise from GRID north (add the grid convergence's opposite for true north). An estimate, not a palaeomagnetic measurement."); // #1044
  const t = p.searchTrend;
  if (t) lines.push(`searchTrend: "${t.name}" dip ${t.dip} towards ${t.dipAzimuth}, pitch ${t.pitch}, ratios ${t.ratios?.max} : ${t.ratios?.int} : ${t.ratios?.min}${t.ellipsoidM ? `; search ellipsoid ${t.ellipsoidM.join(" x ")} m` : ""}`);
  if (p.capAudit) lines.push(`capAudit: ${capAuditText(p.capAudit, p.unit || "")}`);
  if (p.mlsBlocks) lines.push(`mlsBlocks: ${Object.entries(p.mlsBlocks).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  return lines;
}
