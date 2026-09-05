// TASKS.csv #148 — import an existing solid / wireframe (pit shell, stope design, someone else's
// modelled domain) and overlay it in the 3D view against drillholes and GeoStrix's own generated
// surfaces, for as-built vs. as-planned checks.
//
// This file is the format-agnostic front door: it dispatches on extension and always returns the same
// {vertices, indices, ...} shape, so ViewerModule has ONE import path to wire into the existing
// implicitSurfaces machinery rather than one per format. The DXF half lives in dxf.js (parseDXFMesh),
// extending the DXF module this repo already had rather than starting a second parser — see that
// function's comment for the entity-level detail.
//
// Formats: DXF (3DFACE entities and POLYLINE polyface meshes) and OBJ. Those are exactly the two
// formats meshExport.js already WRITES, which is deliberate: it makes an export -> re-import round trip
// a real regression test for both halves, and it means GeoStrix can now read back files it produced —
// which, before this row, it could not (parseDXF only ever handled plan-view 2D entities, so a surface
// exported to DXF was unreadable by the app that wrote it).
//
// Coordinates are taken AS-IS, in the project's own CRS. There is no reprojection here and there
// should not be: a DXF/OBJ carries no CRS, so any guess would be silent and wrong. The UI says so.
import { parseDXFMesh } from "./dxf.js";

// OBJ: `v x y z` vertex lines and `f` face lines. Face vertex references may be `v`, `v/vt`, `v//vn`
// or `v/vt/vn`, and may be NEGATIVE (relative to the end of the vertex list so far) — both handled,
// because both appear in real exports. Polygonal faces with more than 3 vertices are fan-triangulated
// (v0-v1-v2, v0-v2-v3, ...), which is correct for the convex faces any mesh exporter emits.
export function parseOBJMesh(text) {
  const vertices = [];
  const indices = [];
  let quads = 0, ngons = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("v ")) {
      const p = line.slice(2).trim().split(/\s+/).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) vertices.push([p[0], p[1], p[2]]);
    } else if (line.startsWith("f ")) {
      const refs = line.slice(2).trim().split(/\s+/).map((tok) => {
        const n = parseInt(tok.split("/")[0], 10);
        if (!Number.isFinite(n) || n === 0) return null;
        return n > 0 ? n - 1 : vertices.length + n; // 1-based, or negative = relative to the end
      }).filter((n) => n != null && n >= 0 && n < vertices.length);
      if (refs.length < 3) continue;
      if (refs.length === 4) quads++;
      if (refs.length > 4) ngons++;
      for (let k = 1; k + 1 < refs.length; k++) {
        const a = refs[0], b = refs[k], c = refs[k + 1];
        if (a === b || b === c || a === c) continue; // degenerate — no area, no usable normal
        indices.push(a, b, c);
      }
    }
  }
  if (!vertices.length || !indices.length) {
    throw new Error("No usable vertices/faces found — this OBJ has no `v` and `f` lines this importer could read.");
  }
  return { vertices, indices, triangleCount: indices.length / 3, quads, ngons };
}

export const SOLID_IMPORT_EXTENSIONS = ".dxf,.obj";

// Returns { vertices: [[e,n,z],...], indices: [...], format, triangleCount, note } with `vertices` in
// PROJECT WORLD coordinates (easting, northing, elevation) — the same convention meshExport.js writes
// and the caller converts to scene space exactly once.
export function parseSolidFile(fileName, text) {
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".dxf")) {
    const m = parseDXFMesh(text);
    return {
      ...m, format: "DXF",
      note: `${m.nFaceEntities} 3DFACE entit${m.nFaceEntities === 1 ? "y" : "ies"}${m.nPolyfaceMeshes ? `, ${m.nPolyfaceMeshes} polyface mesh${m.nPolyfaceMeshes === 1 ? "" : "es"}` : ""}`,
    };
  }
  if (name.endsWith(".obj")) {
    const m = parseOBJMesh(text);
    return { ...m, format: "OBJ", note: `${m.quads ? `${m.quads} quad(s) triangulated` : "all faces triangular"}${m.ngons ? `, ${m.ngons} n-gon(s) fan-triangulated` : ""}` };
  }
  throw new Error(`Unsupported solid format "${name.split(".").pop()}" — import a .dxf (3DFACE / polyface mesh) or .obj file.`);
}

// Axis-aligned bounding box of a parsed solid, in world coordinates. The import UI reports this so a
// user can immediately see whether the file landed on the property or 6,000 km away — the single most
// common failure with CRS-less CAD hand-offs, and the reason this is surfaced rather than assumed.
export function solidBounds(vertices) {
  if (!vertices?.length) return null;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  vertices.forEach((v) => v.forEach((c, i) => { if (c < mn[i]) mn[i] = c; if (c > mx[i]) mx[i] = c; }));
  return { min: { x: mn[0], y: mn[1], z: mn[2] }, max: { x: mx[0], y: mx[1], z: mx[2] } };
}
