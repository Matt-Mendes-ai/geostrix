// TASKS.csv #4067 (GSQ harvest, cr_91498_12 / _13 / _14) — a drillhole table exported with NO header row, its text cells quoted: "SERC/D-20" "STSTH" 437428.41
// 7581256.48 279.02 ... The CSV reader took the first row for the column names (a collar file of one hole read as 0 rows under 48 'names' such as
// 437428.41), so every table of such a set lost its first row and mapped nothing. -> the text with a header line of 'Column 1', 'Column 2' ... put in
// front, so the first row is data and the dialog offers each column to be mapped, or null when the first row is a header. Pure.
const DELIMS = ["\t", ",", ";"];
const cellsOf = (line, d) => {
  const out = []; let cur = "", q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  out.push(cur.trim());
  return out;
};
const isNum = (s) => s !== "" && Number.isFinite(Number(s));

export function addMissingHeader(text) {
  const lines = String(text || "").slice(0, 200_000).split("\n").slice(0, 30).map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  if (!lines.length) return null;
  const d = DELIMS.reduce((best, x) => (cellsOf(lines[0], x).length > cellsOf(lines[0], best).length ? x : best), "\t");
  const a = cellsOf(lines[0], d), b = lines.length > 1 ? cellsOf(lines[1], d) : a; // a one-row file (one hole's collar): its own numbers
  if (a.length < 4) return null;
  const both = a.map((v, k) => (isNum(v) && isNum(b[k] ?? "") ? k : -1)).filter((k) => k >= 0);
  if (both.length < 3) return null; // a header names its columns: at most a year or two among them
  if (!a.some((v) => v !== "" && !isNum(v))) return null; // all numbers: a header of wavelengths / depths ('400, 410, 420') or plain numbers: leave it
  const nums = a.filter(isNum).map(Number);
  if (nums.length >= 3 && nums.every((v, i) => i === 0 || v > nums[i - 1])) return null; // numeric column labels in order (years, wavelengths, depths): a header
  const width = lines.reduce((m, l) => Math.max(m, cellsOf(l, d).length), 0);
  const names = Array.from({ length: width }, (_, k) => `Column ${k + 1}`).join(d);
  return { text: `${names}${/\r\n/.test(text.slice(0, 200_000)) ? "\r\n" : "\n"}${text}`, columns: width }; // the file's own line end, so the reader sees one header line
}
