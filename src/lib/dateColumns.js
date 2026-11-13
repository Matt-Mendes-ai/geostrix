// TASKS.csv #3075 (#2900 (8), WA review) — a collar file's dates (WAMEX ENDDATE '14-Nov-18') were kept as text: hundreds of distinct values, so never
// offered to filter or colour holes by. A column whose values read as dates is stored as ISO dates (2018-11-14, which sort and compare), and its
// year is added as a field of its own ('ENDDATE year'), which has few values. Pure, small: the collar import runs it.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monthOf = (s) => { const t = String(s).toLowerCase(); return /^[a-z]{3,9}$/.test(t) ? MONTHS[t.slice(0, 3)] || null : null; }; // Nov, November, SEPT
const yearOf = (y) => (y.length === 2 ? (Number(y) < 50 ? 2000 : 1900) + Number(y) : Number(y)); // a two-digit year: 1950-2049
const pad = (n) => String(n).padStart(2, "0");
const valid = (y, m, d) => y >= 1800 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => (valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null);

// one value -> { iso } for an unambiguous form, { a, b, y } for a numeric a/b/y (day-month or month-day: the column decides), or null
function readOne(raw) {
  const s = String(raw ?? "").trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(am|pm|z)?$/i, "").trim(); // a time after the date is dropped
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s); // 2018-11-14, 2018/11/14
  if (m) { const v = iso(+m[1], +m[2], +m[3]); return v ? { iso: v } : null; }
  m = /^(\d{1,2})[-/ .]([A-Za-z]{3,9})\.?[-/ .,]*(\d{4}|\d{2})$/.exec(s); // 14-Nov-18, 14 November 2018
  if (m && monthOf(m[2])) { const v = iso(yearOf(m[3]), monthOf(m[2]), +m[1]); return v ? { iso: v } : null; }
  m = /^([A-Za-z]{3,9})\.?[-/ .]+(\d{1,2}),?[-/ .]+(\d{4})$/.exec(s); // Nov 14, 2018
  if (m && monthOf(m[1])) { const v = iso(+m[3], monthOf(m[1]), +m[2]); return v ? { iso: v } : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(s); // 14/11/2018 or 11/14/2018
  if (m) return { a: +m[1], b: +m[2], y: yearOf(m[3]) };
  return null;
}

// values: the column's cells -> { toIso(v) -> 'YYYY-MM-DD' | null, order: "iso" | "dmy" | "mdy" } when at least 90 % of the non-blank cells (and two
// or more) read as dates in one order; { ambiguous: true } when they are numeric dates whose day and month cannot be told apart; else null
export function dateColumnReader(values) {
  let n = 0, ok = 0, numeric = 0, dayFirst = false, monthFirst = false;
  const parsed = [];
  for (const v of values || []) {
    if (String(v ?? "").trim() === "") continue;
    n++;
    const p = readOne(v);
    parsed.push(p);
    if (!p) continue;
    ok++;
    if (p.a != null) { numeric++; if (p.a > 12) dayFirst = true; if (p.b > 12) monthFirst = true; }
  }
  if (n < 2 || ok / n < 0.9) return null;
  if (numeric && dayFirst && monthFirst) return null; // both ways round in one column: not dates
  if (numeric && !dayFirst && !monthFirst) return { ambiguous: true };
  const order = numeric ? (dayFirst ? "dmy" : "mdy") : "iso";
  const toIso = (v) => {
    const p = readOne(v);
    if (!p) return null;
    if (p.iso) return p.iso;
    return order === "mdy" ? iso(p.y, p.a, p.b) : iso(p.y, p.b, p.a);
  };
  return { toIso, order };
}

// the collar attrs of one row with each date column read: { [col]: iso, [`${col} year`]: 'YYYY' }; a cell that does not read stays as written
export function withDateFields(attrs, readers) {
  if (!attrs || !readers?.size) return attrs;
  const out = { ...attrs };
  for (const [col, rd] of readers) {
    if (out[col] == null || String(out[col]).trim() === "") continue;
    const v = rd.toIso(out[col]);
    if (!v) continue;
    out[col] = v;
    if (!(`${col} year` in attrs)) out[`${col} year`] = v.slice(0, 4);
  }
  return out;
}
