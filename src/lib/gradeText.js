// TASKS.csv #2515 (review #2486, WA lithium) — a displayed assay value to the precision of an assay: the section labels, the 3D tooltip,
// Identify's 'Value' and the Style dialog's range printed the stored float ('3.3163004598875836 % Li', 'Data range: 0.0023226645607841317
// – 3.3163004598875836 %'), on every sample of a project whose values were converted at import. Four significant figures, never fewer
// than the whole-number digits (12,345 ppm stays 12345, 1234.5 stays 1234.5), a whole number as it is. Text only: the stored value and
// every calculation keep the full number.
export function gradeText(v, sf = 4) {
  if (typeof v !== "number") return String(v ?? "");
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  const whole = Math.abs(v) >= 1 ? Math.floor(Math.log10(Math.abs(v))) + 1 : 0;
  return String(Number(v.toPrecision(Math.min(15, Math.max(sf, whole + (Math.abs(v) >= 1000 ? 1 : 0))))));
}
