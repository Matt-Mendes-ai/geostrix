// TASKS.csv #1184 — the columns that make QAQC work: guessed from their header, shown in the import dialog, and changeable. A file with SAMPLE and PARENT
// used to import with 0 standards grouped, because the names were not on a hidden list and nothing said so.
import { sampleTypeClass } from "./qaqc.js";

const ALIASES = {
  sample_id: ["sample_id", "sampleid", "sample_no", "sample_number", "sample", "samp_id", "sample_num", "samp_num"], // samp_num: #1510 (40958Z's drill assays; the surface import knew it)
  sample_type: ["sample_type", "samp_type", "sampletype", "qc_type", "qctype", "qaqc_type", "qaqc", "sample_class", "sample_category", "type"],
  parent_id: ["parent_id", "parent", "parent_sample", "parent_sample_id", "original_id", "original", "orig_sample_id", "primary_id", "original_sample", "parent_sample_number", "parent_sample_no", "parent_number"], // parent_sample_number: #1661 (Kodiak's Appendix B)
  qc_code: ["standard_id", "std_id", "standard", "crm", "crm_id", "crm_name", "standard_name", "qc_code", "qc_id", "qc_name", "reference_material", "standard_type", "std_type", "crm_type", "control_type", "reference_material_id"], // standard_type: #1661
};
export const QC_COLUMN_KEYS = Object.keys(ALIASES);

export function qcColumns(headers) {
  const norm = (h) => String(h).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return Object.fromEntries(QC_COLUMN_KEYS.map((k) => [k, (headers || []).find((h) => ALIASES[k].includes(norm(h))) || ""]));
}

// One row's QC fields. A file with one PARENT column holds the parent sample for a duplicate and the CRM name for a standard: without a column of CRM
// names, a standard's "parent" is its CRM, so that repeated insertions group.
export function qcFields(row, cols) {
  const get = (k) => { const c = cols?.[k]; return c && row[c] != null && row[c] !== "" ? String(row[c]).trim() : null; };
  const out = {};
  for (const k of QC_COLUMN_KEYS) { const v = get(k); if (v != null) out[k] = v; }
  if (!out.qc_code && out.parent_id && sampleTypeClass(out.sample_type) === "standard") out.qc_code = out.parent_id;
  // TASKS.csv #1661 (review #1646, Kodiak) — a type the rules do not know ("Control") with a CRM name beside it is a standard,
  // or a blank when the name says so (BLK-SiO2): 396 such rows were dropped as 'no from / to' and QAQC showed 0 standards
  if (out.sample_type && !sampleTypeClass(out.sample_type) && out.qc_code) { out.sample_type_src = out.sample_type; out.sample_type = /\b(blk|blank)\b|^blk|blank/i.test(out.qc_code) ? "blank" : "standard"; }
  return out;
}
