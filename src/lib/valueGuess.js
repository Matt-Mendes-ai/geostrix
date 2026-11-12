// TASKS.csv #2889 (review #2876, WA bedded iron) — the WA iron material-type log (Hole_id, Depth From, Depth To, Projectcode, PRIORITY,
// Logged_Strand, 43 Met_*_pct columns, Pyrite_Found) opened as Lithology with Value '— none —' and Import disabled: Logged_Strand, its only
// code column (34 codes), matched no alias, and the 43 percentages could only be added one Add click at a time. Pure: no UI.

// the code-log layers (a Value of codes, not numbers)
const CODE_TARGETS = new Set(["litho", "alt", "vein", "weath", "breccia", "structzone", "mnlgy"]);
// columns that hold codes but never the log's value: ids, project / company / people, dates, free text
// (whole words of the header, "_" read as a space: 'Logged_Strand' is a code column, 'Logged_By' is not)
const NOT_A_CODE_WORD = /\b(hole|holeid|hole id|bhid|dhid|sample|sampleid|sample id|project|projectcode|company|tenement|lease|prospect|priority|date|time|logged by|logger|geologist|comments?|cmnts?|remarks?|description|desc|notes?|source|batch|lab|method)\b/i;
const notACode = (h) => NOT_A_CODE_WORD.test(String(h).replace(/[_.]+/g, " "));
const YES_NO = /^(y|n|yes|no|true|false|t|f|0|1|-1)$/i;
const isNumber = (v) => v !== "" && Number.isFinite(Number(String(v).replace(",", ".")));

// the one column that can be the layer's Value when no name matched: text codes (2..max distinct, not all numbers, not a yes / no flag),
// not mapped, not an id / project / date / comment column. -> { col, codes } | null (none, or more than one: no guess)
export function codeColumnGuess(target, headers, rows, mapping = {}, { max = 200, sample = 200000 } = {}) { // sample: every row of a log up to 200,000, so the count said is the file's
  if (!CODE_TARGETS.has(target) || mapping.value) return null;
  const used = new Set(Object.values(mapping).filter(Boolean));
  const list = rows || [], step = Math.max(1, Math.floor(list.length / sample));
  const found = [];
  for (const h of headers || []) {
    if (used.has(h) || notACode(h)) continue;
    const codes = new Set();
    let text = false, over = false;
    for (let i = 0; i < list.length; i += step) {
      const v = String(list[i]?.[h] ?? "").trim();
      if (!v) continue;
      if (!isNumber(v)) text = true;
      codes.add(v);
      if (codes.size > max) { over = true; break; }
    }
    if (!text || over || codes.size < 2 || [...codes].every((v) => YES_NO.test(v))) continue;
    found.push({ col: h, codes: codes.size });
  }
  return found.length === 1 ? found[0] : null;
}

// the number columns not mapped and not already extra fields (for 'Add every number column'): most rows hold a number
export function numberColumnsLeft(headers, rows, mapping = {}, customFields = [], { sample = 2000 } = {}) {
  const used = new Set([...Object.values(mapping).filter(Boolean), ...(customFields || []).map((f) => f.column)]);
  const list = rows || [], step = Math.max(1, Math.floor(list.length / sample));
  const out = [];
  for (const h of headers || []) {
    if (!h || used.has(h)) continue;
    let seen = 0, nums = 0;
    for (let i = 0; i < list.length; i += step) { const v = String(list[i]?.[h] ?? "").trim(); if (!v) continue; seen++; if (isNumber(v)) nums++; }
    if (seen && nums / seen >= 0.95) out.push(h);
  }
  return out;
}
