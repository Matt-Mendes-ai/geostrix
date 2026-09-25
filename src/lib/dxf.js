// TASKS.csv #128 — DXF import/export, the CAD/GIS lingua franca in mineral exploration (drillhole
// plans, claim maps, section templates handed back and forth with surveyors/mine planners). Distinct
// from any 3D mesh/wireframe export elsewhere in the app — this is 2D vector CAD data (lines,
// polylines, points), not a modelled surface, matching how DXF is actually used for this kind of
// interop (plan-view drawings, not solids).
//
// Only the plain-text ("ASCII") DXF flavor is handled — the binary variant is rare in practice for
// this kind of hand-off and would need a completely different byte-level parser. Group-code pairs are
// DXF's whole file structure (an integer "group code" line, then its value line, repeated) — this is
// reverse-engineered from the DXF Reference's own documented group codes (autodesk's public DXF spec),
// not guessed.

// ---------------------------------------------------------------------------------------------
// Import: LINE, LWPOLYLINE, (old-style) POLYLINE+VERTEX+SEQEND, and POINT entities inside the
// ENTITIES section become boundary-shaped polylines ({x,y}[][], same shape parsePLYBoundary/geosoft.js
// produces) — CIRCLE/ARC/TEXT/3DFACE/etc. are left unsupported (a first pass covering what a plan-view
// claim map or drillhole collar/trace export actually consists of, not full DXF entity coverage).
export function parseDXF(text) {
  const rawLines = text.split(/\r\n|\r|\n/);
  // Group-code lines are always a bare integer; DXF is whitespace-trimmed per convention (real
  // exports pad the code with leading spaces — AutoCAD's own writer does this — so both the code and
  // its value need trimming).
  const pairs = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = parseInt(rawLines[i].trim(), 10);
    if (!Number.isFinite(code)) continue; // a malformed/truncated trailing line — stop trying to pair
    pairs.push([code, rawLines[i + 1].trim()]);
  }

  // Slice out just the ENTITIES section — everything else (HEADER/TABLES/BLOCKS/OBJECTS) is either
  // metadata this app has no use for, or block DEFINITIONS (an INSERT referencing a block's contents
  // isn't resolved here — a first-pass limitation, see the header comment).
  let entStart = -1, entEnd = pairs.length;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 2 && pairs[i][1] === "ENTITIES") { entStart = i + 1; break; }
  }
  if (entStart === -1) throw new Error("No ENTITIES section found — this may not be a valid DXF file, or uses the binary DXF variant (unsupported).");
  for (let i = entStart; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === "ENDSEC") { entEnd = i; break; }
  }

  // TASKS.csv #408 — Z (group codes 30/31, and LWPOLYLINE's constant elevation 38) and the entity's
  // LAYER (code 8) are now kept. Pit crests, section interpretations, development centrelines and drill
  // traces from Vulcan/Datamine/Micromine are 3D strings; this used to flatten every one of them and merge
  // all layers into one boundary at a default elevation. `closed` records a closed polyline (flag bit 1),
  // so open strings are not drawn as loops.
  const polylines = [], layers = [], closed = [];
  let has3D = false, faces = 0;
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const push = (verts, layer, isClosed) => {
    if (verts.some((q) => q.z != null)) has3D = true;
    polylines.push(verts.map((q) => (q.z != null ? { x: q.x, y: q.y, z: q.z } : { x: q.x, y: q.y })));
    layers.push(layer || "0"); closed.push(!!isClosed);
  };
  let i = entStart;
  while (i < entEnd) {
    const [code, value] = pairs[i];
    if (code !== 0) { i++; continue; }
    const type = value;
    if (type === "LINE") {
      const pt = { x: null, y: null, z: null }, pt2 = { x: null, y: null, z: null };
      let layer = "0";
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 8) layer = v;
        else if (c === 10) pt.x = num(v); else if (c === 20) pt.y = num(v); else if (c === 30) pt.z = num(v);
        else if (c === 11) pt2.x = num(v); else if (c === 21) pt2.y = num(v); else if (c === 31) pt2.z = num(v);
        i++;
      }
      if ([pt.x, pt.y, pt2.x, pt2.y].every(Number.isFinite)) push([pt, pt2], layer, false);
    } else if (type === "LWPOLYLINE") {
      const verts = [];
      let cur = null, layer = "0", elev = null, flags = 0;
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 8) layer = v;
        else if (c === 38) elev = num(v);
        else if (c === 70) flags = parseInt(v, 10) || 0;
        else if (c === 10) { if (cur) verts.push(cur); cur = { x: num(v), y: null, z: null }; }
        else if (c === 20 && cur) cur.y = num(v);
        i++;
      }
      if (cur) verts.push(cur);
      const usable = verts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)).map((q) => ({ ...q, z: elev != null && elev !== 0 ? elev : null }));
      if (usable.length > 1) push(usable, layer, flags & 1);
    } else if (type === "POLYLINE") {
      // Old-style polyline: the POLYLINE entity itself carries no vertices — each is a separate
      // VERTEX entity immediately following, terminated by a SEQEND. Flag 8 = 3D polyline, 1 = closed,
      // 16/64 = polygon/polyface mesh (a SOLID — see parseDXFMesh), skipped here.
      let layer = "0", flags = 0;
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        if (pairs[i][0] === 8) layer = pairs[i][1];
        else if (pairs[i][0] === 70) flags = parseInt(pairs[i][1], 10) || 0;
        i++;
      }
      const verts = [];
      while (i < entEnd && !(pairs[i][0] === 0 && pairs[i][1] === "SEQEND")) {
        if (pairs[i][0] === 0 && pairs[i][1] === "VERTEX") {
          const v = { x: null, y: null, z: null };
          i++;
          while (i < entEnd && pairs[i][0] !== 0) {
            if (pairs[i][0] === 10) v.x = num(pairs[i][1]);
            else if (pairs[i][0] === 20) v.y = num(pairs[i][1]);
            else if (pairs[i][0] === 30) v.z = num(pairs[i][1]);
            i++;
          }
          if (Number.isFinite(v.x) && Number.isFinite(v.y)) verts.push(v);
        } else {
          i++;
        }
      }
      if (!(flags & 16) && !(flags & 64) && verts.length > 1) push(flags & 8 ? verts : verts.map((q) => ({ ...q, z: q.z || null })), layer, flags & 1);
      else if (flags & 64) faces++;
      i++; // past SEQEND
    } else if (type === "POINT") {
      const pt = { x: null, y: null, z: null };
      let layer = "0";
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        if (pairs[i][0] === 8) layer = pairs[i][1];
        else if (pairs[i][0] === 10) pt.x = num(pairs[i][1]);
        else if (pairs[i][0] === 20) pt.y = num(pairs[i][1]);
        else if (pairs[i][0] === 30) pt.z = num(pairs[i][1]);
        i++;
      }
      // A lone point has nothing to draw a line to — represented as a degenerate 1-vertex "loop" so
      // it still round-trips through the same polylines shape rather than needing a separate list;
      // callers that only draw >=2-point loops (e.g. ViewerModule's LineLoop renderer) simply won't
      // render it, same as any other too-short loop.
      if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) push([pt], layer, false);
    } else {
      if (type === "3DFACE") faces++;
      i++;
    }
  }

  if (!polylines.length) {
    const err = new Error(faces ? "This DXF contains only faces (3DFACE / polyface mesh) — it is a solid, not strings." : "No usable LINE/LWPOLYLINE/POLYLINE/POINT entities found in this DXF's ENTITIES section.");
    err.facesOnly = faces > 0;
    throw err;
  }
  return { polylines, layers, closed, has3D };
}

// TASKS.csv #408 — one boundary spec per DXF layer (a CAD file's layers are its real grouping: pit crest,
// toe, centreline...), each keeping its vertices' Z when the file has any.
export function dxfToBoundaries(text, baseName) {
  const { polylines, layers, closed, has3D } = parseDXF(text);
  const byLayer = new Map();
  polylines.forEach((pl, k) => {
    if (!byLayer.has(layers[k])) byLayer.set(layers[k], { polylines: [], closedFlags: [] });
    const g = byLayer.get(layers[k]);
    g.polylines.push(pl); g.closedFlags.push(closed[k]);
  });
  const single = byLayer.size === 1;
  return [...byLayer.entries()].map(([layer, g]) => ({
    name: single ? baseName : `${baseName} — ${layer}`,
    polylines: g.polylines, closedFlags: g.closedFlags,
    useVertexZ: has3D && g.polylines.some((pl) => pl.some((q) => q.z != null)),
    dxfLayer: layer,
  }));
}

// ---------------------------------------------------------------------------------------------
// TASKS.csv #148 — importing a 3D SOLID/surface (pit shell, stope design, someone else's modelled
// wireframe) to overlay against drillholes and GeoStrix's own generated surfaces.
//
// This is deliberately a SEPARATE entry point from parseDXF above, not an extension of it, and the
// reason is a contract difference, not squeamishness: parseDXF returns plan-view {x,y} polylines and
// three existing call sites (GeophysicsModule's boundary import x2, ViewerModule's Browser-file
// import) destructure `{ polylines }` and hand them straight to a 2D boundary renderer. A 3D triangle
// mesh is not a boundary and must not silently arrive as one.
//
// It also closes a real gap rather than adding a nicety: meshExport.js's exportSurfaceDXF writes one
// 3DFACE entity per triangle, and parseDXF ignores 3DFACE entirely — so before this, GeoStrix could
// export a surface to DXF and then not read its own file back. The round trip is now verified both
// ways (see this row's TASKS.csv verification note).
//
// Handles the two ways a triangulated surface actually shows up in an ASCII DXF:
//   * 3DFACE — one entity per face, vertices in group codes 10/20/30 .. 13/23/33. The 4th vertex is
//     conventionally a repeat of the 3rd for a triangle; when it is genuinely distinct the quad is
//     split into two triangles (0-1-2 and 0-2-3), which is what every mesh consumer does with a quad.
//   * POLYLINE polyface mesh (flag 70 bit 64) — the older/compact form Vulcan, Surpac and Micromine
//     exports commonly use: a run of VERTEX entities carrying either a coordinate (10/20/30) or a face
//     record (71/72/73/74 = 1-based vertex indices, negative meaning "this edge is invisible", which
//     is a display hint only and is why the indices are abs()'d here).
// Vertices are welded on rounded coordinates so a 3DFACE soup (which repeats every shared vertex, once
// per adjoining triangle) comes back as a real indexed mesh instead of 3x the vertices it should have.
export function parseDXFMesh(text, opts = {}) {
  // 1e-4 m = 0.1 mm, which is exactly the precision exportSurfaceDXF writes (toFixed(4)) — welding any
  // tighter than the file's own precision would fail to merge vertices that ARE the same point.
  const weldTol = opts.weldTolerance ?? 1e-4;
  const rawLines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = parseInt(rawLines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push([code, rawLines[i + 1].trim()]);
  }
  let entStart = -1, entEnd = pairs.length;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 2 && pairs[i][1] === "ENTITIES") { entStart = i + 1; break; }
  }
  if (entStart === -1) throw new Error("No ENTITIES section found — this may not be a valid DXF file, or uses the binary DXF variant (unsupported).");
  for (let i = entStart; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === "ENDSEC") { entEnd = i; break; }
  }

  const vertices = [];           // [x, y, z] in DXF/world coordinates
  const indices = [];            // flat triangle index list
  const weld = new Map();
  const key = (x, y, z) => {
    const q = 1 / weldTol;
    return `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
  };
  const addVertex = (x, y, z) => {
    const k = key(x, y, z);
    const hit = weld.get(k);
    if (hit !== undefined) return hit;
    const idx = vertices.length;
    vertices.push([x, y, z]);
    weld.set(k, idx);
    return idx;
  };
  const addTriangle = (a, b, c) => {
    // A degenerate triangle (two vertices welded to the same index) has no area and no normal; keeping
    // it would only produce NaN normals downstream. This is exactly what a triangular 3DFACE's repeated
    // 4th vertex collapses to, so this is the normal path, not an error case.
    if (a === b || b === c || a === c) return;
    indices.push(a, b, c);
  };

  let nFaceEntities = 0, nPolyfaceMeshes = 0;
  let i = entStart;
  while (i < entEnd) {
    const [code, value] = pairs[i];
    if (code !== 0) { i++; continue; }
    if (value === "3DFACE") {
      const v = [[null, null, null], [null, null, null], [null, null, null], [null, null, null]];
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        const [c, val] = pairs[i];
        // 10..13 = x of vertex 0..3, 20..23 = y, 30..33 = z
        if (c >= 10 && c <= 13) v[c - 10][0] = parseFloat(val);
        else if (c >= 20 && c <= 23) v[c - 20][1] = parseFloat(val);
        else if (c >= 30 && c <= 33) v[c - 30][2] = parseFloat(val);
        i++;
      }
      const ok = v.map((p) => p.every(Number.isFinite));
      if (ok[0] && ok[1] && ok[2]) {
        const a = addVertex(...v[0]), b = addVertex(...v[1]), c = addVertex(...v[2]);
        addTriangle(a, b, c);
        if (ok[3]) {
          const d = addVertex(...v[3]);
          addTriangle(a, c, d); // no-op when vertex 3 repeats vertex 2 (the triangle convention)
        }
        nFaceEntities++;
      }
    } else if (value === "POLYLINE") {
      let flags = 0;
      i++;
      while (i < entEnd && pairs[i][0] !== 0) { if (pairs[i][0] === 70) flags = parseInt(pairs[i][1], 10) || 0; i++; }
      const isPolyface = (flags & 64) !== 0;
      const local = []; // 1-based per the DXF face records
      const faces = [];
      while (i < entEnd && !(pairs[i][0] === 0 && pairs[i][1] === "SEQEND")) {
        if (pairs[i][0] === 0 && pairs[i][1] === "VERTEX") {
          let x = null, y = null, z = 0, vflags = 0;
          const f = [0, 0, 0, 0];
          i++;
          while (i < entEnd && pairs[i][0] !== 0) {
            const [c, val] = pairs[i];
            if (c === 10) x = parseFloat(val);
            else if (c === 20) y = parseFloat(val);
            else if (c === 30) z = parseFloat(val);
            else if (c === 70) vflags = parseInt(val, 10) || 0;
            else if (c >= 71 && c <= 74) f[c - 71] = parseInt(val, 10) || 0;
            i++;
          }
          // vertex flag bit 128 = "this VERTEX carries a face record"; bit 64 = "it's a mesh vertex".
          // Falling back to "has any non-zero 71..74" covers writers that omit the flag.
          if ((vflags & 128 && !(vflags & 64)) || (!Number.isFinite(x) && f.some((n) => n !== 0))) faces.push(f);
          else if (Number.isFinite(x) && Number.isFinite(y)) local.push([x, y, Number.isFinite(z) ? z : 0]);
          else if (f.some((n) => n !== 0)) faces.push(f);
        } else i++;
      }
      i++; // past SEQEND
      if (isPolyface && local.length && faces.length) {
        const gi = local.map((p) => addVertex(p[0], p[1], p[2]));
        faces.forEach((f) => {
          // negative index = invisible edge, a display hint only — magnitude is the real 1-based index
          const idx = f.map((n) => Math.abs(n)).filter((n) => n >= 1 && n <= gi.length).map((n) => gi[n - 1]);
          if (idx.length >= 3) {
            addTriangle(idx[0], idx[1], idx[2]);
            if (idx.length === 4) addTriangle(idx[0], idx[2], idx[3]);
          }
        });
        nPolyfaceMeshes++;
      }
      continue;
    } else {
      i++;
    }
  }

  if (!indices.length) {
    throw new Error("No 3D faces found — this DXF has no 3DFACE entities or polyface mesh. A plan-view DXF (lines/polylines) can be imported as a boundary from the Geophysics tab instead.");
  }
  return { vertices, indices, nFaceEntities, nPolyfaceMeshes, triangleCount: indices.length / 3 };
}

// ---------------------------------------------------------------------------------------------
// Export: writes a minimal, valid ASCII DXF (R12-compatible subset — just ENTITIES, no HEADER/
// TABLES/BLOCKS — every DXF reader tested against, including QGIS and AutoCAD, accepts this) from the
// same {features:[{geometry:[[x,y,z],...], attributes}], geomType} shape buildVectorFeatures()
// (ViewerModule.jsx) already produces for Shapefile/GeoPackage export, so this is a third output
// format on the exact same data path rather than a new one. Plan-view only (X/Y; Z is dropped) per
// this task's own framing — DXF's LWPOLYLINE entity (used here for both "polyline" and multi-vertex
// geometry) is inherently 2D-per-vertex anyway. Each entity's DXF layer is set to its attributes'
// hole_id when present (so a surveyor opening the file gets one CAD layer per drillhole, the way
// they'd expect), falling back to a shared "GEOSTRIX" layer otherwise.
function sanitizeLayerName(name) {
  return (String(name || "GEOSTRIX").replace(/[^A-Za-z0-9_.$-]+/g, "_") || "GEOSTRIX").slice(0, 255);
}

export function buildDXF({ features, geomType }) {
  const lines = [];
  const put = (code, value) => { lines.push(String(code), String(value)); };

  put(0, "SECTION"); put(2, "ENTITIES");

  // TASKS.csv #408 — Z is written. Points carry their real elevation (they were all written at 0), and a
  // multi-vertex geometry with elevations becomes a 3D POLYLINE (flag 8) + VERTEX 10/20/30 entities,
  // which every package reading R12 DXF understands. A flat drill trace was useless to Vulcan/Datamine.
  features.forEach((f) => {
    const layer = sanitizeLayerName(f.attributes?.hole_id);
    const z = (p) => (Number.isFinite(p[2]) ? p[2] : 0);
    if (geomType === "point" || f.geometry.length === 1) {
      f.geometry.forEach((p) => {
        put(0, "POINT"); put(8, layer); put(10, p[0].toFixed(4)); put(20, p[1].toFixed(4)); put(30, z(p).toFixed(4));
      });
      return;
    }
    if (f.geometry.some((p) => Number.isFinite(p[2]))) {
      put(0, "POLYLINE"); put(8, layer); put(66, 1); put(70, 8); put(10, "0.0"); put(20, "0.0"); put(30, "0.0");
      f.geometry.forEach((p) => { put(0, "VERTEX"); put(8, layer); put(10, p[0].toFixed(4)); put(20, p[1].toFixed(4)); put(30, z(p).toFixed(4)); put(70, 32); });
      put(0, "SEQEND"); put(8, layer);
      return;
    }
    put(0, "LWPOLYLINE"); put(8, layer); put(90, f.geometry.length); put(70, 0);
    f.geometry.forEach(([x, y]) => { put(10, x.toFixed(4)); put(20, y.toFixed(4)); });
  });

  put(0, "ENDSEC");
  put(0, "EOF");
  return lines.join("\n") + "\n";
}
