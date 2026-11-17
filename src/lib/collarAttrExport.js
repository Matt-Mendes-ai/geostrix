// TASKS.csv #3613 (Fireweed rehearsal) — a collar's own fields (hole type, year, property, prospect, news release ...) are kept under collar.attrs; every collar export used to write that object
// as it was (the Shapefile / GeoPackage '[object Object]', the CSV one JSON cell, the KMZ nothing), so they did not survive and a re-import could not read them. Flattened here, one column per field,
// for every export; the importer already keeps a collar file's extra columns as attrs (the drillhole import's own rule), so a round trip gives them back.
import { holeTypeColumn } from "./holeType.js";

const plain = (v) => typeof v === "number" || typeof v === "string" || typeof v === "boolean";

// -> [[name, value]] in the collar's own order. reserved: the names the export already writes (hole_id, x, y, z, azim_grid ...): a field that would land on one is written as <name>_file.
// The app's normalized 'hole type' is left out when the file's own hole-type column is there (a re-import makes it again); alone it is written as hole_type.
export function collarAttrPairs(collar, reserved = []) {
  const attrs = collar?.attrs;
  if (!attrs || typeof attrs !== "object") return [];
  const taken = new Set(reserved.map((k) => String(k).toLowerCase()));
  const keys = Object.keys(attrs).filter((k) => !k.startsWith("_"));
  const own = holeTypeColumn(keys.filter((k) => k !== "hole type"));
  const out = [];
  for (const k of keys) {
    const v = attrs[k];
    if (v == null || v === "") continue;
    if (k === "hole type" && own) continue;
    let name = (k === "hole type" ? "hole_type" : String(k)).trim();
    if (!name) continue;
    if (taken.has(name.toLowerCase())) name = `${name}_file`;
    taken.add(name.toLowerCase());
    out.push([name, plain(v) ? v : JSON.stringify(v)]);
  }
  return out;
}
// the same names for a set of collars, so every row of a table has the same columns: -> [name, ...] in first-seen order
export function collarAttrNames(collars, reserved = []) {
  const seen = new Map();
  for (const c of collars || []) for (const [k] of collarAttrPairs(c, reserved)) if (!seen.has(k)) seen.set(k, true);
  return [...seen.keys()];
}

// TASKS.csv #3623 (Fireweed rehearsal) — a collar with no azimuth / dip of its own (Macpass's 559: the attitude is in the survey) left every export with two empty columns. Each collar missing one
// takes the hole's first (shallowest) survey station's, as the Layout collar table does (lib/collarTable.js collarsWithSurveyAttitude), and says so in `_attFrom` ('azimuth', 'dip' or 'azimuth and dip'),
// which the exports write as an attitude_from column. A value the collar has is never replaced; the collars are not changed.
export function collarsWithFirstStation(collars, survey) {
  const first = new Map();
  for (const s of survey || []) { if (!Number.isFinite(s?.depth)) continue; const f = first.get(s.hole_id); if (!f || s.depth < f.depth) first.set(s.hole_id, s); }
  return (collars || []).map((c) => {
    const s = first.get(c?.hole_id);
    if (!s) return c;
    const az = !Number.isFinite(c.azimuth) && Number.isFinite(s.azimuth), dip = !Number.isFinite(c.dip) && Number.isFinite(s.dip);
    if (!az && !dip) return c;
    return { ...c, ...(az ? { azimuth: s.azimuth } : {}), ...(dip ? { dip: s.dip } : {}), _attFrom: az && dip ? "azimuth and dip" : az ? "azimuth" : "dip" };
  });
}
export const attFromText = (c) => (c?._attFrom ? `first survey station: ${c._attFrom}` : "");
// TASKS.csv #3875 (#3724 e) - the way back: an exported collars.csv says in attitude_from which of a hole's azimuth / dip was the first survey station's, not the collar's own. A re-import used to store that azimuth and dip
// as the collar's own on every such hole (559 of them on Macpass) and the cell as a collar field 'attitude_from'. -> { azimuth, dip } (true: not the collar's own), or null when the text is not what attFromText writes
export function surveyAttitudeOf(text) {
  const m = /^\s*first survey station:\s*(azimuth and dip|azimuth|dip)\s*$/i.exec(String(text ?? ""));
  if (!m) return null;
  const w = m[1].toLowerCase();
  return { azimuth: w !== "dip", dip: w !== "azimuth" };
}
