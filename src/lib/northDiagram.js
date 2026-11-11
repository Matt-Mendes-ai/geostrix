// The Layout's grid / true / magnetic north diagram (TASKS.csv #399): pure helpers. Reviews #1645 / #2013 / #2174 / #2325 / #2486 found
// it ran off the sheet from the starter arrow's place (#1773, #2137), dated the declination to today in UTC (#1773, #2310), drew rays
// of 0.4 and 2 degrees as one line with stacked labels (#2478), lettered MN on the east side of a ray that points west (#2613),
// rotated its captions with an oblique view (#2137) and printed a fixed '0.1-0.2°/yr' that was ten times the rate at the site (#2478).

export const DIAGRAM_W = 170, DIAGRAM_H = 136; // the drawn box in page px: 7 pt captions need up to ~149 px, four caption lines
export const ORIGIN = { x: 60, y: 80 }; // where the rays meet, in the box

// TASKS.csv #2310 — a date on the local calendar (the {date} placeholder's), not toISOString's UTC one (shared since #2358)
export { localDate } from "./localDate.js";

// TASKS.csv #1773 — the drilling date the collars carry (STARTDATE, drill_date, date_drilled, year...): the latest one, as the
// declination of the most recent program. A full date (yyyy-mm-dd, or dd/mm/yyyy with a 4-digit year) is used as it is; a bare year
// as its 1 July. -> { date: "yyyy-mm-dd", field } or null
const DATE_FIELD = /(^|_|\b)(start_?date|date_?start|drill_?date|date_?drilled|drilled|collar_?date|date|year|drill_?year)($|_|\b)/i;
export function collarDrillDate(collars) {
  let best = null;
  for (const c of collars || []) {
    for (const [k, raw] of Object.entries(c?.attrs || {})) {
      if (!DATE_FIELD.test(k) || /end|finish|complete|survey_?type|log/i.test(k)) continue;
      const d = parseDrillDate(raw);
      if (d && (!best || d > best.date)) best = { date: d, field: k };
    }
  }
  return best;
}
export function parseDrillDate(raw) {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  const ok = (y, mo, d) => y >= 1950 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (m && ok(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(s); // day first (the usual outside North America); a month over 12 swaps them
  if (m) { let d = +m[1], mo = +m[2]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; if (ok(+m[3], mo, d)) return iso(+m[3], mo, d); }
  m = /^(\d{4})(\.0+)?$/.exec(s);
  if (m && ok(+m[1], 7, 1)) return iso(+m[1], 7, 1);
  return null;
}

// TASKS.csv #2478 — a declination diagram is schematic: an angle under `min` (12) degrees is drawn at `min` (8 still read as one bundle with the star under GN) (side kept), and two rays on
// the same side are kept at least `min` apart in their true order; nothing past 60 degrees. -> { tn, mn, schematic }
export function schematicAngles(convergence, mnFromGrid, min = 12) {
  const sgn = (a) => (a > 0 ? 1 : a < 0 ? -1 : 0);
  const lift = (a) => (Math.abs(a) < 1e-9 ? 0 : sgn(a) * Math.min(60, Math.max(Math.abs(a), min)));
  let tn = lift(convergence), mn = lift(mnFromGrid);
  if (tn !== 0 && mn !== 0 && sgn(tn) === sgn(mn) && Math.abs(mn - tn) < min) {
    // the one truly further from grid north is drawn further out
    if (Math.abs(mnFromGrid) >= Math.abs(convergence)) mn = sgn(mn) * Math.min(60, Math.abs(tn) + min);
    else tn = sgn(tn) * Math.min(60, Math.abs(mn) + min);
  }
  if (mn === 0 && tn !== 0 && Math.abs(mnFromGrid) > 1e-9) mn = sgn(mnFromGrid) * min;
  const schematic = Math.abs(tn - convergence) > 0.05 || Math.abs(mn - mnFromGrid) > 0.05;
  return { tn, mn, schematic };
}

// a ray's tip and its label's place, on the outer side of the ray (#2613): west of grid north the label ends left of the tip
export function rayTip(deg, len, o = ORIGIN) {
  const r = (deg * Math.PI) / 180;
  const x = o.x + Math.sin(r) * len, y = o.y - Math.cos(r) * len;
  return { x, y, labelX: deg < 0 ? x - 4 : deg > 0 ? x + 4 : x, anchor: deg < 0 ? "end" : deg > 0 ? "start" : "middle" };
}

// TASKS.csv #2478 — the declination's yearly change at the site, from two IGRF dates a year apart (degrees per year, east positive)
export const yearLater = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return `${y + 1}-${String(m || 1).padStart(2, "0")}-${String(Math.min(d || 1, 28)).padStart(2, "0")}`; };

// TASKS.csv #1773 / #2137 — where the diagram goes so its box stays on the sheet (it grows from the 54 px arrow to 170 px)
export function keepOnSheet(x, y, pageW, pageH, margin = 10) {
  return { x: Math.max(margin, Math.min(Number(x) || 0, pageW - DIAGRAM_W - margin)), y: Math.max(margin, Math.min(Number(y) || 0, pageH - DIAGRAM_H - margin)) };
}
