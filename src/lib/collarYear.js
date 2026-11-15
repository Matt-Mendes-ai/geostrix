// TASKS.csv #3545 (#3538, Fireweed rehearsal, Macpass) — the collar file's year column was kept as the text '2023': 'Colour holes by' made 28
// classes of it, not a range. A collar field named for a year (year, yr, drill_year, 'ENDDATE year' from a date column, #3075) whose every
// value is a whole year (four digits, 1800-2200) is stored as a number. Anything else in it (a blank, '2019?', '2019-20') keeps the column as text.
const YEAR_NAME = /(^|[\s_-])(year|yr)$|^(year|yr)([\s_-]|$)/i;
const isYearText = (v) => (typeof v === "number" ? Number.isInteger(v) && v >= 1800 && v <= 2200 : /^\d{4}$/.test(String(v).trim()) && +v >= 1800 && +v <= 2200);

// rows: collars with attrs -> the attr keys to store as numbers
export function yearAttrKeys(rows) {
  const ok = new Map(); // key -> true while every value is a year
  for (const r of rows || []) for (const [k, v] of Object.entries(r?.attrs || {})) {
    if (!YEAR_NAME.test(String(k).trim()) || ok.get(k) === false) continue;
    if (v == null || String(v).trim() === "") continue;
    ok.set(k, isYearText(v));
  }
  return [...ok].filter(([, y]) => y).map(([k]) => k);
}

// -> the rows, each year field a number (a row is copied only when it changes)
export function yearsAsNumbers(rows) {
  const keys = yearAttrKeys(rows);
  if (!keys.length) return rows;
  return rows.map((r) => {
    if (!r?.attrs || !keys.some((k) => typeof r.attrs[k] === "string" && r.attrs[k].trim() !== "")) return r;
    const attrs = { ...r.attrs };
    for (const k of keys) if (typeof attrs[k] === "string" && attrs[k].trim() !== "") attrs[k] = Number(attrs[k]);
    return { ...r, attrs };
  });
}
