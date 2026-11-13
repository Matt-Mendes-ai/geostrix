// TASKS.csv #2952 (review #2876, WA iron) — the units a downhole log is usually in, offered by the kind of log its name says (density, gamma,
// susceptibility, resistivity / conductivity), for the unit box of a log layer. Only suggestions: any unit can be typed, and none is assumed.
import { SUSC_NAME, DENS_NAME } from "./inversionLogSources.js";

const GAMMA = /gamma|\bgr\b|cps|\bapi\b|eu3o8|natural/i, RES = /resist|\bres\b|ohm/i, COND = /conduct|\bcond\b/i;
// TASKS.csv #2953 — readings no rock can give in a stated unit, as a check (never removed by this): a density outside 1 to 5 g/cc (1,000 to
// 5,000 kg/m³), a negative gamma (API, cps). -> { n, rule, lo, hi, unit } | null
export function implausibleReadings(values, unit) {
  const u = String(unit || "").trim();
  let lo = null, hi = null, rule = null;
  if (/^g\/cc$|^g\/cm3$|^g\/cm³$/i.test(u)) { lo = 1; hi = 5; rule = "density"; }
  else if (/^kg\/m3$|^kg\/m³$/i.test(u)) { lo = 1000; hi = 5000; rule = "density"; }
  else if (/^(api|cps)$/i.test(u)) { lo = 0; rule = "negative"; }
  if (!rule) return null;
  let n = 0;
  for (const v of values || []) if (Number.isFinite(v) && (v < lo || (hi != null && v > hi))) n++;
  return n ? { n, rule, lo, hi, unit: u } : null;
}
export function logUnitChoices(name) {
  const s = String(name || "");
  if (DENS_NAME.test(s)) return ["g/cc", "kg/m³"];
  if (GAMMA.test(s)) return ["API", "cps", "ppm eU3O8"];
  if (SUSC_NAME.test(s)) return ["SI", "×10⁻³ SI", "×10⁻⁵ SI"];
  if (RES.test(s)) return ["ohm·m"];
  if (COND.test(s)) return ["mS/m"];
  return ["g/cc", "API", "cps", "SI", "×10⁻³ SI", "×10⁻⁵ SI", "ohm·m", "mS/m"];
}
