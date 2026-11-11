// TASKS.csv #2139 (review #2013) — a text '{date} · {scale} · {crs}' on a page with no scale printed '2026-11-08 ·  · NAD83 ...': an
// empty placeholder left its separators behind. Filled here, then a separator between two empty fills is dropped (and one at either end).
const SEP = "[·|•–—/,;-]";
export function fillPlaceholders(text, ctx, re) {
  if (!ctx || typeof text !== "string" || !text.includes("{")) return text;
  let empty = false;
  const out = text.replace(re, (m, k) => { if (ctx[k] == null) return m; if (ctx[k] === "") empty = true; return ctx[k]; });
  if (!empty) return out;
  return out
    .split("\n")
    .map((line) => line
      .replace(new RegExp(`\\s*(${SEP})\\s*(?:${SEP}\\s*)+`, "g"), (m, s) => ` ${s} `) // 'a ·  · b' -> 'a · b'
      .replace(new RegExp(`^\\s*${SEP}\\s*`), "") // a line that began with the empty fill
      .replace(new RegExp(`\\s*${SEP}\\s*$`), "")) // or ended with it
    .join("\n");
}
