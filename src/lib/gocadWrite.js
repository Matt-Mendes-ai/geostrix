// TASKS.csv #2631 — GOCAD ASCII writers for what meshExport.js's exportSurfaceTS does not cover: a PLine (.pl, 3D lines: interpretation and
// contact lines, drillhole traces) and a VSet (.vs, point sets: collars, samples, contact points, with numeric properties as PVRTX columns).
// A TSurf (.ts) of a generated surface is meshExport.js's exportSurfaceTS (#2928 (7), #3149).
// Written from the format as src/lib/gocad.js reads it (clean room: the GeosciencesIO writers, MIT, were only read for the keywords they
// emit: ILINE / VRTX / SEG, a closing SEG for a ring, PVRTX with PROPERTIES / NO_DATA_VALUES). The header is the one exportSurfaceTS writes:
// HEADER name, GOCAD_ORIGINAL_COORDINATE_SYSTEM with the project's EPSG code (or 'Default' with none) and ZPOSITIVE Elevation. The
// coordinates are real-world ones: the caller hands them in the export CRS (through the local-grid tie when there is one). The provenance is
// '#' comment lines, which GOCAD readers skip. Pure: no React, no three.js.

export const NO_DATA = -99999;
const clean = (s) => String(s ?? "").replace(/[\r\n{}]/g, " ").trim();
const fix = (v) => (Number.isFinite(v) ? v : 0).toFixed(4);

function head(type, name, { epsg = null, comments = [] } = {}) {
  const out = [`# ${clean(name)} — exported from GeoStrix`];
  for (const c of comments) if (c) out.push(`# ${clean(c)}`);
  out.push(`GOCAD ${type} 1`, "HEADER {", `name:${clean(name)}`, "}",
    "GOCAD_ORIGINAL_COORDINATE_SYSTEM", `NAME ${epsg ? `EPSG:${epsg}` : "Default"}`, 'AXIS_NAME "X" "Y" "Z"', 'AXIS_UNIT "m" "m" "m"', "ZPOSITIVE Elevation", "END_ORIGINAL_COORDINATE_SYSTEM");
  return out;
}

// lines: [[ [x, y, z], … ], …]. A line of fewer than two points is left out; a ring (first point = last) is written without the repeated
// vertex and with a closing SEG. A missing z is written as 0 (counted in zMissing, so the caller can say so).
// -> { text, lines, vertices, zMissing }
export function writePLine(name, lines, opts = {}) {
  const out = head("PLine", name, opts);
  let id = 0, nLines = 0, zMissing = 0;
  for (const raw of lines || []) {
    const pts = (raw || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) continue;
    const ring = pts.length > 3 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] && (pts[0][2] ?? 0) === (pts.at(-1)[2] ?? 0);
    const use = ring ? pts.slice(0, -1) : pts;
    out.push("ILINE");
    const first = id + 1;
    for (const p of use) {
      id++;
      if (!Number.isFinite(p[2])) zMissing++;
      out.push(`VRTX ${id} ${fix(p[0])} ${fix(p[1])} ${fix(p[2])}`);
    }
    for (let k = first; k < id; k++) out.push(`SEG ${k} ${k + 1}`);
    if (ring) out.push(`SEG ${id} ${first}`);
    nLines++;
  }
  out.push("END");
  return { text: out.join("\n") + "\n", lines: nLines, vertices: id, zMissing };
}

// property names a GOCAD reader takes as one word each: letters, digits and underscores, unique, not empty
export function gocadPropertyNames(names) {
  const seen = new Set();
  return names.map((n, i) => {
    let s = String(n ?? "").trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || `property_${i + 1}`;
    while (seen.has(s.toLowerCase())) s += "_";
    seen.add(s.toLowerCase());
    return s;
  });
}

// points: [{ x, y, z, values: [number | null, …] }] with `props` the column names. Without props the points are VRTX lines; with them PVRTX
// lines after PROPERTIES / NO_DATA_VALUES (a missing value is written as the no-data value). -> { text, points, zMissing, properties }
export function writeVSet(name, points, props = [], opts = {}) {
  const names = gocadPropertyNames(props);
  const out = head("VSet", name, opts);
  if (names.length) out.push(`PROPERTIES ${names.join(" ")}`, `NO_DATA_VALUES ${names.map(() => NO_DATA).join(" ")}`);
  let id = 0, zMissing = 0;
  for (const p of points || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    id++;
    if (!Number.isFinite(p.z)) zMissing++;
    const vals = names.map((_, i) => { const v = p.values?.[i]; return Number.isFinite(v) ? String(v) : String(NO_DATA); });
    out.push(`${names.length ? "PVRTX" : "VRTX"} ${id} ${fix(p.x)} ${fix(p.y)} ${fix(p.z)}${vals.length ? " " + vals.join(" ") : ""}`);
  }
  out.push("END");
  return { text: out.join("\n") + "\n", points: id, zMissing, properties: names };
}
