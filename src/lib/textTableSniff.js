// TASKS.csv #3737 (Scottie Gold review) — a survey table saved as .sur or .tx is refused by its extension ("Not imported from this drop") with nothing said of what it is.
// A small text table (three or more lines of three or more fields, mostly numbers, no binary bytes) is named as one, with the way in: rename it .csv.
// text: the first few KB of the file. -> true when it reads as a delimited text table
export function looksLikeTextTable(text) {
  const s = String(text ?? "");
  if (!s || s.includes("\u0000")) return false;
  const lines = s.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  if (lines.length < 3) return false;
  const delim = (l) => l.split(l.includes(",") ? "," : l.includes("\t") ? "\t" : l.includes(";") ? ";" : /\s+/).map((t) => t.trim()).filter((t) => t !== "");
  const rows = lines.map(delim).filter((t) => t.length >= 3);
  if (rows.length < 3 || rows.length < 0.6 * lines.length) return false;
  const numeric = rows.slice(1).flat().filter((t) => Number.isFinite(Number(t))).length, total = rows.slice(1).flat().length;
  return total > 0 && numeric / total >= 0.5;
}
