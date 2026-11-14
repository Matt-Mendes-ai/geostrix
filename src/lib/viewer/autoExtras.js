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

// TASKS.csv #2187 (review #2174, WA gold) — a survey's method / instrument / surveyor column (SURVTYPE GYRO / REFLEX / COLLAR, SurveyBy)
// has no field and was dropped: it is kept as an extra field (Identify lists it) by default, the dialog's custom fields.
const SURVEY_METHOD = /^(surv(ey)?[\s_-]*(type|method|tool|by|instrument|company|contractor)|instrument|method|tool|survey[\s_-]*instrument)$/i;
export function surveyMethodFields(headers, rows) {
  return (headers || []).filter((h) => SURVEY_METHOD.test(String(h).trim()) && (rows || []).some((r) => String(r?.[h] ?? "").trim() !== ""))
    .map((h) => ({ column: h, name: String(h), type: "category" }));
}

// A second layer the same file fills: a Geotech (RQD %) table's recovery percentage column -> Recovery %. -> { target, column } or null
export function companionLayer(target, headers) {
  if (target !== "geotech") return null;
  const col = (headers || []).find((h) => /recover/i.test(h) && /%|pct|percent/i.test(h));
  return col ? { target: "recovery", column: col } : null;
}

// TASKS.csv #2341 (review #2325) — through the dialog, the columns no field took and no extra field added were dropped without a word
// (Lith1_Strat, Lith1_Oxidation, AMG_Grid_ID): the ones that carry values, named in the notice. used: the column names the import read
export function columnsLeftOut(headers, rows, used) {
  const u = new Set((used || []).filter(Boolean));
  return (headers || []).filter((h) => h && !u.has(h) && !String(h).startsWith("_") && (rows || []).some((r) => String(r?.[h] ?? "").trim() !== ""));
}

// TASKS.csv #2668 (follow-up of #1713) — a mag-susc log's instrument column (MagSus_Instrument = KT-10 on every row) or unit column was dropped
// in the import dialog, so the inversion asked 'Log units: Choose…' with nothing to go on. Kept as an extra field by default, as a survey's
// instrument is (#2187): by its header (instrument / meter / device / unit) or by values naming a meter (KT-10, SM-30, MS2…).
const SUSC_INSTR_HEADER = /(instrument|instr|meter|device|(^|[\s_-])unit(s)?$)/i;
const SUSC_METER = /^(kt|sm|ms|tk|gmk)[\s-]*\d/i;
export function suscInstrumentFields(headers, rows) {
  const sample = (rows || []).slice(0, 300);
  return (headers || []).filter((h) => {
    const vals = sample.map((r) => String(r?.[h] ?? "").trim()).filter(Boolean);
    if (!vals.length) return false;
    return SUSC_INSTR_HEADER.test(String(h).trim()) || vals.filter((v) => SUSC_METER.test(v)).length >= vals.length * 0.9;
  }).map((h) => ({ column: h, name: String(h), type: "category" }));
}

