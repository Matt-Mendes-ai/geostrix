// TASKS.csv #1184 — the columns that make QAQC work: guessed from their header, shown in the import dialog, and changeable. A file with SAMPLE and PARENT
// used to import with 0 standards grouped, because the names were not on a hidden list and nothing said so.
import { sampleTypeClass } from "./qaqc.js";

const ALIASES = {
  sample_id: ["sample_id", "sampleid", "sample_no", "sample_number", "sample", "samp_id", "sample_num", "samp_num"], // samp_num: #1510 (40958Z's drill assays; the surface import knew it)
  sample_type: ["sample_type", "samp_type", "sampletype", "qc_type", "qctype", "qaqc_type", "qaqc", "sample_class", "sample_category", "qc_category", "qccategory", "qc_class", "check_type", "type"], // qc_category…: #2340 (WAMEX's link table)
  parent_id: ["parent_id", "parent", "parent_sample", "parent_sample_id", "original_id", "original", "orig_sample_id", "primary_id", "original_sample", "parent_sample_number", "parent_sample_no", "parent_number", "orig_sampleid", "orig_sample", "orig_id", "original_sampleid", "original_sample_id", "parentid", "parent_sampleid"], // parent_sample_number: #1661 (Kodiak's Appendix B); orig_sampleid…: #2340
  qc_code: ["standard_id", "std_id", "standard", "crm", "crm_id", "crm_name", "standard_name", "qc_code", "qc_id", "qc_name", "reference_material", "standard_type", "std_type", "crm_type", "control_type", "reference_material_id"], // standard_type: #1661
  // TASKS.csv #2764 — the lab certificate (or lab job) a sample was reported on, so the Lab certificates review can name the sheet's
  // certificates that no given file is (VA23186444 in the sheet, VA24189659.csv in the folder)
  certificate: ["certificate", "cert", "cert_no", "cert_num", "cert_number", "cert_id", "certificate_no", "certificate_num", "certificate_number", "certificate_id", "lab_certificate", "lab_cert", "assay_certificate", "lab_job", "lab_job_no", "lab_job_number", "labjob", "labjobno", "job_no", "job_number", "lab_batch", "lab_batch_no", "batch_no", "batch_number"],
};
export const QC_COLUMN_KEYS = Object.keys(ALIASES);

// rows (TASKS.csv #2340, optional): a header the file has twice ('Sample_Type' blank, then 'Sample_Type_1' as the parser renames the second) — the
// copy with values is taken, not the first one (the pXRF file's readings lost their WCORE / ORIG type)
export function qcColumns(headers, rows = null) {
  const norm = (h) => String(h).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const filled = (h) => !rows?.length || rows.some((r) => r?.[h] != null && String(r[h]).trim() !== "");
  const pick = (k) => {
    const hits = (headers || []).filter((h) => ALIASES[k].includes(norm(h)) || ALIASES[k].includes(norm(h).replace(/_\d+$/, "")));
    return hits.find((h) => ALIASES[k].includes(norm(h)) && filled(h)) || hits.find(filled) || hits.find((h) => ALIASES[k].includes(norm(h))) || "";
  };
  const out = Object.fromEntries(QC_COLUMN_KEYS.map((k) => [k, pick(k)]));
  // #2764 — a drillhole database with a certificate per element ('Cu certificate', 'Au_Cert_No'): the first of them
  if (!out.certificate) out.certificate = (headers || []).find((h) => /^[a-z]{1,2}_(cert|certificate)(_?(no|num|number|id))?$/.test(norm(h))) || "";
  return out;
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
