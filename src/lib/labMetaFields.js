// TASKS.csv #1828 (review #1646, Kodiak) / #2089 (review #2013, Woodjam) — a lab's export carries bookkeeping columns per element (the
// certificate, its completion, the laboratory, the workflow, the status, the analysis code, the LDL flag), instrument sequences, QC
// weights, uuids, timestamps and display colours. They flooded the surface samples' Populations and Colour by lists (about 60 on
// Kodiak, about 160 on Woodjam) and buried the field descriptors (horizon, texture, target, lithology, loc_meth...). Such a column is
// kept (Identify lists it) but offered last, under its own heading. A column called just 'lab' or 'batch' is not one of them: a
// population by laboratory or batch is a real question (levelling).
const LAB_META = new RegExp([
  "cert(ificate)?", "_?cert_?num", "analysis[_\\s]?code", "workflow", "laborator", "instr(ument)?[_\\s]?seq", "digest[_\\s]?run",
  "rec(v|ei?ve)?d[_\\s]?wt", "pass\\s?2\\s?mm", "rmnd\\s?75", "(^|_)flag$", "_ldl($|_)", "(^|_)ldl_", "uuid", "tstamp", "timestamp",
  "colou?r_?rgb", "_lev_basis",
  "[A-Za-z]{2,}-[A-Za-z]{2,}\\d+", // a lab method code in the name: AuME-ST43, ME-ICP61, Pb-OG62
  "\\b[A-Z]{3}-(QC|\\d{2})\\b", // CRU-QC, PUL-QC, WEI-21
].join("|"), "i");
export const isLabMetaField = (name) => LAB_META.test(String(name ?? ""));
// a column name as shown: Excel headers with line breaks ('Digest_Run NA \r\nPb-OG62') on one line
export const fieldLabel = (name) => String(name ?? "").replace(/\s+/g, " ").trim();
