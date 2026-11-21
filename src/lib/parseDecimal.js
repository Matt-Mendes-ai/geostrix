// TASKS.csv #3926 (Matt found a '0,05' typed into 'Ignore below' silently dropped) — a number typed by a person: '.' or ',' as the decimal mark.
// Pure. parseDecimal(text) -> { ok: true, value } | { ok: true, empty: true } | { ok: false, error: "invalid" | "ambiguous" }.
// '1.234,5' and '1,234.5' are refused ('ambiguous'): both marks at once, or one mark repeated ('1,234,567'), could be a thousands separator
// or a decimal mark, and a guess would change the number. No thousands separators are read.
export function parseDecimal(text) {
  const s = String(text ?? "").trim().replace(/^\+/, "");
  if (s === "") return { ok: true, empty: true };
  const m = /^(-?)(\d*)(?:([.,])(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (m) {
    const [, sign, int, , frac = "", exp] = m;
    if (int === "" && frac === "") return { ok: false, error: "invalid" };
    const v = Number(`${sign}${int || "0"}${frac ? "." + frac : ""}${exp ? "e" + exp : ""}`);
    return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, error: "invalid" };
  }
  // digits with more than one mark: '1.234,5', '1,234.5', '1,234,567', '1.234.567' - never guessed
  if (/^-?[\d.,]+$/.test(s) && /[.,]/.test(s) && /\d[.,]\d/.test(s)) return { ok: false, error: "ambiguous" };
  return { ok: false, error: "invalid" };
}

// the text shown for a number: no exponent for ordinary sizes, the number's own digits
export const decimalText = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "" : String(Number(v)));
