// TASKS.csv #2161 (WA drillhole review) — the drilling method of each hole, from whatever the collar file calls it (Hole_Type, HoleType,
// Drill_code, DRILL_TYPE, DrillholeType, Rig_Type, Drill_Method) and however it is spelt (RC, GCRC, DD, DDH, D, RAB, PHRAB, AC, AIRCORE,
// "AIR CORE", VAC, AU, AUGER, RC/DD, RCD ...), normalized to a few classes so the holes can be filtered and coloured by method. The file's
// own column is kept as it is beside it.

const HOLE_TYPE_COL = /^(dh_?|drill_?hole_?|hole_?|drill_?|rig_?)(type|code|method)$|^(drill_?type|holetype|drillholetype|drillmethod|drilling_?method|drill_?method)$/;
const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s.-]+/g, "_");

export function holeTypeColumn(headers) {
  return (headers || []).find((h) => HOLE_TYPE_COL.test(norm(h))) || null;
}

// the classes, in the words a log uses; null for a blank cell
export function normalizeHoleType(raw) {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;
  const t = s.replace(/[\s_-]+/g, "");
  if (/^(RC\/?DD|RCD|RCDD|RC\+DD|RCDDH|RC\/DDH|RCDT)$/.test(t)) return "RC + diamond tail";
  if (/^(DD|DDH|D|DIAMOND|DIA|CORE|NQ\d?|HQ\d?|PQ\d?|BQ|DDT|DDHW|DDW)$/.test(t)) return "Diamond (DD)";
  if (/^(RC|GCRC|RCGC|REVERSECIRCULATION|RCP|RCH)$/.test(t)) return "Reverse circulation (RC)"; // in full like the others: #2488
  if (/^(RCAC|ACRC)$/.test(t)) return "RC / aircore";
  if (/^(AC|AIRCORE|AIRC|ACH)$/.test(t)) return "Aircore (AC)";
  if (/^(RAB|PHRAB|RABH)$/.test(t)) return "RAB";
  if (/^(VAC|VACUUM)$/.test(t)) return "Vacuum";
  if (/^(AU|AUG|AUGER|AUGR|HANDAUGER)$/.test(t)) return "Auger";
  if (/^(PERC|PERCUSSION|RP|ROTARY|RB|ROTARYPERCUSSION)$/.test(t)) return "Percussion / rotary";
  if (/^(SONIC)$/.test(t)) return "Sonic";
  if (/^(NR|NOTRECORDED|UNKNOWN|UNK|DRILLHOLE|N\/A|NA)$/.test(t)) return "Not stated";
  return s; // a method this table does not know: kept as written
}
