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
