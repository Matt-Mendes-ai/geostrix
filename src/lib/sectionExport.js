// TASKS.csv #409 — export digitised section strings. Contacts drawn on a section are already stored with
// real-world x, y, z per vertex (SectionWindow converts on draw), but nothing read them back out, so
// interpretation done in GeoStrix could not be handed to Vulcan/Datamine/Leapfrog. Two outputs:
//   * CSV — one row per vertex: section, string_id, kind, name, vertex, x, y, z (+ along-section l, tie: #1057)
//   * DXF — one 3D POLYLINE per string, on layer "<name>" for an outline, "<name>_<kind>" otherwise (buildDXF, #408; #1057)
// `kind` is "contact" (a unit's upper contact — the only kind that feeds litho modelling), "fault" or
// "string" (free interpretation line); contacts drawn before kinds existed are contacts.
import { buildDXF } from "./dxf.js";

export const STRING_KINDS = { contact: "Upper contact", fault: "Fault", string: "String", outline: "Outline" }; // outline: #570 / #942
export const kindOf = (c) => c.kind || (c.isUpperContact === false ? "string" : "contact");

// TASKS.csv #1104 (review #1016, Micromine user) — the CSV half of #942: an outline goes out closed (its first vertex
// repeated at the end) with closed = Y, and each string gets a numeric join (1..n) beside its text id, the field a
// Micromine / Datamine string file JOINs on. Before, an outline loaded from the CSV was an open string that would
// not wireframe until closed by hand, and the only key was a 15-character id like "c_1730000000000".
export function sectionStringsToRows(sections) {
  const rows = [];
  let join = 0;
  (sections || []).forEach((s) => (s.contacts || []).forEach((c) => {
    const pts = (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite));
    if (!pts.length) return;
    const kind = kindOf(c), closed = kind === "outline" && pts.length >= 3;
    join++;
    (closed ? [...pts, pts[0]] : pts).forEach((p, i) => {
      rows.push({ section: s.name, join, string_id: c.id, kind, name: c.unit || "", closed: closed ? "Y" : "N", vertex: i + 1, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), l: Number.isFinite(p.l) ? +p.l.toFixed(3) : "", tie: p.tie && i < pts.length ? "Y" : "" }); // tie: the #874 tie vertex (#1057)
    });
  }));
  return rows;
}

export function sectionStringsToDXF(sections) {
  const features = [];
  (sections || []).forEach((s) => (s.contacts || []).forEach((c) => {
    const g = (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => [p.x, p.y, p.z]);
    // TASKS.csv #942 — a body outline (#570) is stored without its first vertex repeated; repeating it here makes
    // buildDXF write a CLOSED polyline (flag 1). It left as an open string: Micromine got an outline missing its closing
    // edge, and GeoStrix's own DXF import read it back as a hard line.
    if (kindOf(c) === "outline" && g.length >= 3) g.push(g[0].slice());
    // TASKS.csv #1057 (review #1016, explicit modeller) — the layer is the body: an outline on "<name>", other strings on
    // "<name>_<kind>". It was "<section>_<kind>_<name>", so each section of a body landed on its own CAD layer (a
    // wireframer expects one per body) and GeoStrix's own DXF import read three outlines of VeinA as three bodies that
    // could not be linked. The section stays in the CSV.
    const name = c.unit || "unnamed";
    if (g.length >= 2) features.push({ geometry: g, attributes: { hole_id: kindOf(c) === "outline" ? name : `${name}_${kindOf(c)}` } });
  }));
  return { dxf: buildDXF({ features, geomType: "line" }), count: features.length };
}
