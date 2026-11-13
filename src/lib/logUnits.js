// TASKS.csv #2952 (review #2876, WA iron) — the units a downhole log is usually in, offered by the kind of log its name says (density, gamma,
// susceptibility, resistivity / conductivity), for the unit box of a log layer. Only suggestions: any unit can be typed, and none is assumed.
import { SUSC_NAME, DENS_NAME } from "./inversionLogSources.js";

const GAMMA = /gamma|\bgr\b|cps|\bapi\b|eu3o8|natural/i, RES = /resist|\bres\b|ohm/i, COND = /conduct|\bcond\b/i;
export function logUnitChoices(name) {
  const s = String(name || "");
  if (DENS_NAME.test(s)) return ["g/cc", "kg/m³"];
  if (GAMMA.test(s)) return ["API", "cps", "ppm eU3O8"];
  if (SUSC_NAME.test(s)) return ["SI", "×10⁻³ SI", "×10⁻⁵ SI"];
  if (RES.test(s)) return ["ohm·m"];
  if (COND.test(s)) return ["mS/m"];
  return ["g/cc", "API", "cps", "SI", "×10⁻³ SI", "×10⁻⁵ SI", "ohm·m", "mS/m"];
}
