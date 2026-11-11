// Which block models the pit shell may price as grades (PitShellPane).
import { valueUnit } from "./blockModelExport.js";
import { metalOf } from "./gradeTonnage.js";

// TASKS.csv #1848 / #1614 (review #1646, Kodiak) — a physical property is never a grade: Kodiak's chargeability came in as
// 'MPD-2023_ipinv3d_r3i04_chg' (block-model CSV) and was priced as copper ('7.17B t at 3.91 %, margin $1.97T'), and a UBC-GIF
// model with its unit set to 'Not stated' was offered too. Words and the short tokens vendors put in file names (chg, res, con,
// sus, mag, mvi, inv, ip), and units of physical properties, all rule a model out; so does a UBC-GIF source (an inversion mesh).
const PHYSICAL = /ztem|conductiv|resistiv|chargeab|suscept|magnet|inversion|density contrast|mv\/v|ohm|s\/m|\bmsec\b|(^|[^a-z])(chg|res|con|cond|sus|susc|mag|mvi|inv|ipinv\w*|ip|amt|mt|dcip)(?=[^a-z]|$)/i;
export function gradeCandidate(m, isCategorical = () => false) {
  if (!m?.cells?.length || isCategorical(m) || m.method) return false;
  const src = String(m.source || "");
  if (/^(support-index|kriging-variance|geoml|simpeg|ubc)/.test(src)) return false;
  const text = `${m.name || ""} ${m.property || ""}`;
  if (PHYSICAL.test(text)) return false;
  return valueUnit(m) ? !!metalOf(valueUnit(m)) : true;
}

// TASKS.csv #2436 (review #2325, WA uranium) — the models a grade pane leaves out, with the reason, so a numeric model never goes missing
// without a word: a gamma eU3O8 estimate whose unit was "as logged" was dropped from Pit shell and Stope outlines with no line at all.
// -> { units: [{ name, unit }] (a unit that is not a grade's; "index" has its own note), other: [name] (physical, categorical, quality) }
export function notOfferedGrades(voxelModels, isCategorical = () => false) {
  const units = [], other = [];
  for (const m of voxelModels || []) {
    if (!m?.cells?.length || gradeCandidate(m, isCategorical)) continue;
    const u = valueUnit(m);
    if (u === "index") continue;
    const text = `${m.name || ""} ${m.property || ""}`;
    if (u && !metalOf(u) && !isCategorical(m) && !m.method && !PHYSICAL.test(text) && !/^(support-index|kriging-variance|geoml|simpeg|ubc)/.test(String(m.source || ""))) units.push({ name: m.name, unit: u });
    else other.push(m.name);
  }
  return { units, other };
}
