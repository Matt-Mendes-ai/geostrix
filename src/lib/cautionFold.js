// TASKS.csv #4073 (Matt's rule, Main 2026-11-25) — a Result step folds its cautions, but the fold must not hide THAT there are any, or HOW BAD the worst is: its own label says the count and the
// worst one in a few words ("Cautions (3): 38 % of the estimated metal lies below…"), and with none the fold is not shown. Pure: the component reads its rendered lines and hands them here.
// A line's level: 2 = danger (red), 1 = warning (amber), 0 = a plain detail. Ranking: the highest level, the first of them in reading order.
export const levelOfStyle = (style = "", role = "") => (/danger/.test(style) || role === "alert" ? 2 : /warn-(text|bg|border)/.test(style) ? 1 : 0);

export function worstWords(text, n = 7) {
  const w = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return w.length > n ? `${w.slice(0, n).join(" ")}…` : w.join(" ");
}

// items: [{ text, level }] in reading order -> { kind: "cautions" | "details" | "none", n, worst }
export function cautionSummary(items) {
  const lines = (items || []).filter((x) => String(x?.text || "").trim());
  if (!lines.length) return { kind: "none", n: 0, worst: "" };
  const warned = lines.filter((x) => x.level >= 1);
  if (!warned.length) return { kind: "details", n: lines.length, worst: "" };
  const top = warned.reduce((m, x) => (x.level > m ? x.level : m), 0);
  const worst = warned.find((x) => x.level === top);
  return { kind: "cautions", n: warned.length, worst: worstWords(worst.text) };
}
