// TASKS.csv #284 (Micromine-specialist review) — comma-decimal (European-locale) CSV values silently
// became NaN and their whole row was dropped, with nothing telling the user why the row count came
// back short.
//
// Root cause: every CSV import here runs Papa Parse with `dynamicTyping: true`. Papa converts a value
// to a number only when it parses as one in the C/US convention, so "1,5" is left as the literal
// STRING "1,5" — and `Number("1,5")` is NaN, so every numeric-import filter downstream
// (`!isNaN(r.x)`, `!isNaN(r.from)`, …) quietly threw that row away. GeoStrix's own Golden
// Triangle/VMS audience routinely receives files from overseas labs, JV partners and contractors on a
// comma-decimal locale (an Excel export on a European Windows locale produces exactly this), which
// makes it one of the most common "why did half my rows disappear" failures in exploration-database
// tooling generally.
//
// This module does the detection and the conversion as pure, column-wise logic so it can be
// hand-verified in plain Node (see the repo's verification discipline) before any UI wiring.
//
// THE AMBIGUITY, and why it's handled the way it is: "1,234" is 1234 in the US convention and 1.234
// in the European one, and nothing about that single value can tell you which. So a column is only
// converted when it contains at least one comma value whose fractional part is NOT exactly 3 digits
// long ("1,5", "12,45", "0,8123") — that pattern is impossible to read as a thousands separator, and
// it PROVES the file's convention for the whole column. A column whose comma values are ALL
// exactly-3-digit ("1,234", "12,500") stays untouched and is reported as ambiguous instead, so the
// user is told rather than having a number silently scaled by 1000 — which would be a far worse bug
// than the one being fixed.

// "1,5" / "-0,84" / "1.234,56" / "12.345.678,9" — a decimal comma, optionally with dot thousands
// separators in front of it.
const COMMA_DECIMAL = /^[+-]?\d{1,3}(?:\.\d{3})*,\d+$|^[+-]?\d+,\d+$/;

// Splits out the fractional digits after the comma, for the 3-digit ambiguity test above.
function fractionDigits(s) {
  const i = s.indexOf(",");
  return i < 0 ? 0 : s.length - i - 1;
}

// "1.234,56" -> 1234.56 ; "1,5" -> 1.5. Only ever called on a value that already matched
// COMMA_DECIMAL, so the dot-stripping can't eat a genuine decimal point.
export function parseCommaDecimal(s) {
  return Number(String(s).replace(/\./g, "").replace(",", "."));
}

// Inspects a flat array of Papa-Parse row objects and reports, per column, whether it looks like a
// comma-decimal numeric column. Pure: does not modify `rows`.
// Returns { convert: [{column, count, sample}], ambiguous: [{column, count, sample}] }.
export function detectCommaDecimalColumns(rows) {
  const convert = [], ambiguous = [];
  if (!rows || !rows.length) return { convert, ambiguous };
  // Papa with header:true gives every row the same keys, but a ragged file can still vary — union the
  // keys over a bounded sample rather than trusting row 0 alone.
  const keys = new Set();
  for (let i = 0; i < Math.min(rows.length, 50); i++) Object.keys(rows[i] || {}).forEach((k) => keys.add(k));

  for (const key of keys) {
    let commaCount = 0, realNumberCount = 0, unambiguous = 0, sample = null;
    for (const r of rows) {
      const v = r?.[key];
      if (v == null || v === "") continue;
      if (typeof v === "number") { realNumberCount++; continue; }
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!COMMA_DECIMAL.test(t)) continue;
      commaCount++;
      if (sample === null) sample = t;
      if (fractionDigits(t) !== 3) unambiguous++;
    }
    if (!commaCount) continue;
    // "near-zero matching plain decimal": if Papa already turned most of this column into real
    // numbers, the commas are far more likely to be thousands separators in an otherwise-US file
    // than a locale convention, so leave it alone.
    if (commaCount < realNumberCount) continue;
    if (unambiguous > 0) convert.push({ column: key, count: commaCount, sample });
    else ambiguous.push({ column: key, count: commaCount, sample });
  }
  return { convert, ambiguous };
}

// The wiring point every CSV import calls right after Papa Parse. Converts the columns that are
// provably comma-decimal, in place on freshly-parsed rows (they're never shared at this point), and
// returns a human-readable note for the importer's existing notice/toast channel — the other half of
// the finding was that the user got NO explanation at all, so a silent auto-fix would only be half
// the job.
export function normalizeCommaDecimals(rows) {
  const { convert, ambiguous } = detectCommaDecimalColumns(rows);
  if (!convert.length && !ambiguous.length) return { rows, note: "", converted: [], ambiguous: [] };

  let changed = 0;
  for (const { column } of convert) {
    for (const r of rows) {
      const v = r?.[column];
      if (typeof v === "string" && COMMA_DECIMAL.test(v.trim())) { r[column] = parseCommaDecimal(v.trim()); changed++; }
    }
  }

  let note = "";
  if (convert.length) {
    note += ` Comma decimals detected (European number format, e.g. "${convert[0].sample}") — ${changed} value(s) across ${convert.length} column(s) (${convert.map((c) => c.column).join(", ")}) were converted to ${convert.length === 1 ? "a decimal point" : "decimal points"} so those rows import instead of being dropped as non-numeric.`;
  }
  if (ambiguous.length) {
    note += ` Heads-up: ${ambiguous.map((c) => `"${c.column}"`).join(", ")} contain${ambiguous.length === 1 ? "s" : ""} values like "${ambiguous[0].sample}" that could be either a decimal comma (${parseCommaDecimal(ambiguous[0].sample)}) or a thousands separator (${Number(ambiguous[0].sample.replace(/[.,]/g, ""))}). They were left exactly as-is — re-export that column with a decimal point if it should be numeric.`;
  }
  return { rows, note, converted: convert, ambiguous };
}
