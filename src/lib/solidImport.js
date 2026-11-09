// TASKS.csv #148 — import an existing solid / wireframe (pit shell, stope design, someone else's
// modelled domain) and overlay it in the 3D view against drillholes and GeoStrix's own generated
// surfaces, for as-built vs. as-planned checks.
//
// This file is the format-agnostic front door: it dispatches on extension and always returns the same
// shape, so ViewerModule has ONE import path to wire into the existing implicitSurfaces machinery rather
// than one per format. The DXF half lives in dxf.js (createDXFMeshParser), extending the DXF module this
// repo already had rather than starting a second parser — see that function's comment for the
// entity-level detail.
//
// Formats: DXF (3DFACE entities and POLYLINE polyface meshes) and OBJ. Those are exactly the two
// formats meshExport.js already WRITES, which is deliberate: it makes an export -> re-import round trip
// a real regression test for both halves, and it means GeoStrix can now read back files it produced —
// which, before this row, it could not (parseDXF only ever handled plan-view 2D entities, so a surface
// exported to DXF was unreadable by the app that wrote it).
//
// Coordinates are taken AS-IS, in the project's own CRS. There is no reprojection here and there
// should not be: a DXF/OBJ carries no CRS, so any guess would be silent and wrong. The UI says so.
//
// TASKS.csv #414 — both parsers are streaming (feed chunks, then finish) and return typed arrays, one part
// per DXF layer / OBJ object: { parts: [{ layer, positions: Float64Array (world e,n,z), indices: Uint32Array }],
// triangleCount, vertexCount, format, note }. solidImport.worker.js runs parseSolidFileStream off the UI
// thread; parseSolidFile(name, text) is the same thing for a string already in memory (tests).
import { SOLID_FACE_WARN, SOLID_IMPORT_EXTENSIONS, solidBounds } from "./solidImportMeta.js"; // #552
export { SOLID_FACE_WARN, SOLID_IMPORT_EXTENSIONS, solidBounds };
import { createDXFMeshParser, lineFeeder } from "./dxf.js";
import { parseLeapfrogMsh } from "./leapfrogMsh.js"; // TASKS.csv #1991
import { createGocadParser, gocadCrsText } from "./gocad.js"; // TASKS.csv #1992
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

// Above this the import asks first: fine on a gaming PC, slow to orbit on the modest laptops GeoStrix is
// built for, and (until imported solids are stored compactly) tens of MB in every save.

// OBJ: `v x y z` vertex lines and `f` face lines. Face vertex references may be `v`, `v/vt`, `v//vn`
// or `v/vt/vn`, and may be NEGATIVE (relative to the end of the vertex list so far) — both handled,
// because both appear in real exports. Polygonal faces with more than 3 vertices are fan-triangulated
// (v0-v1-v2, v0-v2-v3, ...), which is correct for the convex faces any mesh exporter emits.
// `o` / `g` names split the file into parts (a pit shell and its benches as separate meshes), sharing
// OBJ's single global vertex list: each part keeps only the vertices its own faces use.
export function createOBJMeshParser() {
  let pos = new Float64Array(3072), nv = 0;
  const parts = [];
  let cur = null, quads = 0, ngons = 0;
  const newPart = (name) => { cur = { layer: name, idx: [], map: new Map(), local: [] }; parts.push(cur); };
  const localIndex = (g) => { let l = cur.map.get(g); if (l === undefined) { l = cur.local.length; cur.local.push(g); cur.map.set(g, l); } return l; };
  const lines = lineFeeder((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (line.startsWith("v ")) {
      const p = line.slice(2).trim().split(/\s+/).map(Number);
      if (p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) {
        if (nv * 3 + 3 > pos.length) { const b = new Float64Array(pos.length * 2); b.set(pos); pos = b; }
        pos[nv * 3] = p[0]; pos[nv * 3 + 1] = p[1]; pos[nv * 3 + 2] = p[2]; nv++;
      }
    } else if (line.startsWith("o ") || line.startsWith("g ")) {
      const name = line.slice(2).trim() || "default";
      if (!cur || cur.idx.length) newPart(name); else cur.layer = name; // an empty part just takes the new name
    } else if (line.startsWith("f ")) {
      const refs = line.slice(2).trim().split(/\s+/).map((tok) => {
        const n = parseInt(tok.split("/")[0], 10);
        if (!Number.isFinite(n) || n === 0) return null;
        return n > 0 ? n - 1 : nv + n; // 1-based, or negative = relative to the end
      }).filter((n) => n != null && n >= 0 && n < nv);
      if (refs.length < 3) return;
      if (refs.length === 4) quads++;
      if (refs.length > 4) ngons++;
      if (!cur) newPart("default");
      for (let k = 1; k + 1 < refs.length; k++) {
        const a = refs[0], b = refs[k], c = refs[k + 1];
        if (a === b || b === c || a === c) continue; // degenerate — no area, no usable normal
        cur.idx.push(localIndex(a), localIndex(b), localIndex(c));
      }
    }
  });
  return {
    feed: (text) => lines.feed(text),
    finish() {
      lines.end();
      const out = parts.filter((p) => p.idx.length).map((p) => {
        const positions = new Float64Array(p.local.length * 3);
        p.local.forEach((g, l) => { positions[l * 3] = pos[g * 3]; positions[l * 3 + 1] = pos[g * 3 + 1]; positions[l * 3 + 2] = pos[g * 3 + 2]; });
        return { layer: p.layer, positions, indices: Uint32Array.from(p.idx) };
      });
      if (!nv || !out.length) throw new Error(tr("No usable vertices/faces found — this OBJ has no `v` and `f` lines this importer could read."));
      const triangleCount = out.reduce((s, p) => s + p.indices.length / 3, 0);
      return { parts: out, triangleCount, vertexCount: out.reduce((s, p) => s + p.positions.length / 3, 0), quads, ngons };
    },
  };
}
export function parseOBJMesh(text) { const p = createOBJMeshParser(); p.feed(text); return p.finish(); }

// TASKS.csv #1992 — GOCAD TSurf (.ts, or the TSurfs of a .gp group): one part per surface object, named by its HEADER name. PLine and
// VSet objects in the same file are counted for the note (they are imported elsewhere: boundaries, point surveys).
export function createGocadMeshParser() {
  const g = createGocadParser();
  const lines = lineFeeder(g.feedLine);
  return {
    feed: (text) => lines.feed(text),
    finish() {
      lines.end();
      const objs = g.finish(), surfs = objs.filter((o) => o.type.toLowerCase() === "tsurf" && o.triangleCount > 0);
      if (!surfs.length) throw new Error(tr("No GOCAD TSurf with triangles in this file{v}.", { v: objs.length ? tr(" (it holds {list})", { list: objs.map((o) => o.type).join(", ") }) : "" }));
      const parts = surfs.map((o) => ({ layer: o.name, positions: o.positions, indices: o.indices }));
      const others = objs.filter((o) => !surfs.includes(o));
      return { parts, triangleCount: surfs.reduce((s, o) => s + o.triangleCount, 0), vertexCount: surfs.reduce((s, o) => s + o.vertexCount, 0),
        gocad: { surfaces: surfs.length, others: others.map((o) => o.type), crs: gocadCrsText(surfs[0].crs), depthDown: surfs.some((o) => o.crs.zSign < 0), skippedLines: objs.reduce((s, o) => s + o.skippedLines, 0) } };
    },
  };
}


function parserFor(fileName) {
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".dxf")) return { format: "DXF", parser: createDXFMeshParser() };
  if (name.endsWith(".obj")) return { format: "OBJ", parser: createOBJMeshParser() };
  if (name.endsWith(".ts") || name.endsWith(".gp")) return { format: "GOCAD", parser: createGocadMeshParser() }; // #1992
  throw new Error(tr("Unsupported solid format \"{v}\" — import a .dxf (3DFACE / polyface mesh), .obj, Leapfrog .msh or GOCAD .ts file.", { v: name.split(".").pop() }));
}
function describe(format, m) {
  if (format === "GOCAD") { // #1992
    const g = m.gocad;
    return [`TSurf objects: ${g.surfaces}`, g.depthDown ? "Z read as depth (ZPOSITIVE Depth), made elevation" : "", g.crs ? `the file names its coordinate system "${g.crs}"` : "",
      g.others.length ? `${g.others.length} other object(s) not read here (${[...new Set(g.others)].join(", ")})` : "", g.skippedLines ? `${g.skippedLines} line(s) skipped` : ""].filter(Boolean).join(", ");
  }
  const layers = m.parts.length > 1 ? `, ${m.parts.length} ${format === "DXF" ? "layers" : "objects"}` : "";
  if (format === "DXF") return `${m.nFaceEntities} 3DFACE entit${m.nFaceEntities === 1 ? "y" : "ies"}${m.nPolyfaceMeshes ? `, ${m.nPolyfaceMeshes} polyface mesh${m.nPolyfaceMeshes === 1 ? "" : "es"}` : ""}${layers}`;
  return `${m.quads ? `${m.quads} quad(s) triangulated` : "all faces triangular"}${m.ngons ? `, ${m.ngons} n-gon(s) fan-triangulated` : ""}${layers}`;
}

// TASKS.csv #1991 — a Leapfrog .msh (text header + binary triangles / vertices), one part named after the file
function leapfrog(fileName, data) {
  const bytes = typeof data === "string" ? Uint8Array.from(data, (c) => c.charCodeAt(0) & 255) : data;
  const base = String(fileName).split(/[\\/]/).pop().replace(/\.msh$/i, "");
  const m = parseLeapfrogMsh(bytes, { name: base });
  return { ...m, format: "Leapfrog MSH", note: `Leapfrog mesh${m.skipped.length ? `, ${m.skipped.join(" / ")} block(s) not read` : ""}` };
}

// A file's text already in memory.
export function parseSolidFile(fileName, text) {
  if (/\.msh$/i.test(String(fileName))) return leapfrog(fileName, text); // #1991: binary (bytes, or a string of byte codes)
  const { format, parser } = parserFor(fileName);
  parser.feed(text);
  const m = parser.finish();
  return { ...m, format, note: describe(format, m) };
}

// A File / Blob, streamed in chunks (never one big string). onProgress(bytesRead, totalBytes).
export async function parseSolidFileStream(file, onProgress) {
  if (/\.msh$/i.test(file.name)) { const buf = await file.arrayBuffer(); onProgress?.(file.size, file.size); return leapfrog(file.name, buf); } // #1991
  const { format, parser } = parserFor(file.name);
  const reader = file.stream().getReader();
  const dec = new TextDecoder();
  let read = 0, lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(dec.decode(value, { stream: true }));
    read += value.byteLength;
    if (onProgress && read - lastReport > 4 * 1024 * 1024) { lastReport = read; onProgress(read, file.size); }
  }
  parser.feed(dec.decode());
  const m = parser.finish();
  return { ...m, format, note: describe(format, m) };
}

// Axis-aligned bounding box of a parsed solid's parts, in world coordinates. The import UI reports this so a
// user can immediately see whether the file landed on the property or 6,000 km away — the single most
// common failure with CRS-less CAD hand-offs, and the reason this is surfaced rather than assumed.

// TASKS.csv #483 — per-vertex normals of a part, in WORLD axes, computed in the solid worker so the UI thread
// no longer spends ~400 ms in three.js computeVertexNormals after a 1M-face import. Same maths as three.js:
// each triangle adds its area-weighted normal (cb x ab) to its three vertices, then every sum is normalised
// (a vertex no triangle touches keeps a zero normal, as there). The caller maps them to scene axes.
export function solidNormals(positions, indices) {
  const acc = new Float64Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const cbx = positions[c] - positions[b], cby = positions[c + 1] - positions[b + 1], cbz = positions[c + 2] - positions[b + 2];
    const abx = positions[a] - positions[b], aby = positions[a + 1] - positions[b + 1], abz = positions[a + 2] - positions[b + 2];
    const nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx;
    for (const v of [a, b, c]) { acc[v] += nx; acc[v + 1] += ny; acc[v + 2] += nz; }
  }
  const out = new Float32Array(positions.length);
  for (let i = 0; i < acc.length; i += 3) {
    const len = Math.hypot(acc[i], acc[i + 1], acc[i + 2]);
    if (len > 0) { out[i] = acc[i] / len; out[i + 1] = acc[i + 1] / len; out[i + 2] = acc[i + 2] / len; }
  }
  return out;
}
