// TASKS.csv #409 — export digitised section strings. Contacts drawn on a section are already stored with
// real-world x, y, z per vertex (SectionWindow converts on draw), but nothing read them back out, so
// interpretation done in GeoStrix could not be handed to Vulcan/Datamine/Leapfrog. Two outputs:
//   * CSV — one row per vertex: section, string_id, kind, name, vertex, x, y, z (+ along-section l)
//   * DXF — one 3D POLYLINE per string, on layer "<section>_<kind>_<name>" (buildDXF, #408)
// `kind` is "contact" (a unit's upper contact — the only kind that feeds litho modelling), "fault" or
// "string" (free interpretation line); contacts drawn before kinds existed are contacts.
import { buildDXF } from "./dxf.js";

export const STRING_KINDS = { contact: "Upper contact", fault: "Fault", string: "String" };
export const kindOf = (c) => c.kind || (c.isUpperContact === false ? "string" : "contact");

export function sectionStringsToRows(sections) {
  const rows = [];
  (sections || []).forEach((s) => (s.contacts || []).forEach((c) => (c.points || []).forEach((p, i) => {
    if (![p.x, p.y, p.z].every(Number.isFinite)) return;
    rows.push({ section: s.name, string_id: c.id, kind: kindOf(c), name: c.unit || "", vertex: i + 1, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), l: Number.isFinite(p.l) ? +p.l.toFixed(3) : "" });
  })));
  return rows;
}

export function sectionStringsToDXF(sections) {
  const features = [];
  (sections || []).forEach((s) => (s.contacts || []).forEach((c) => {
    const g = (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => [p.x, p.y, p.z]);
    if (g.length >= 2) features.push({ geometry: g, attributes: { hole_id: `${s.name}_${kindOf(c)}_${c.unit || "unnamed"}` } });
  }));
  return { dxf: buildDXF({ features, geomType: "line" }), count: features.length };
}
