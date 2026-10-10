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
  const skipped = {}; // TASKS.csv #550 — entity types not imported, counted for the notice
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
      let cur = null, layer = "0", elev = null, flags = 0; // elev: code 38 when present (0 included, #550)
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
      const usable = verts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)).map((q) => ({ ...q, z: elev })); // #550 — 0 is resolved file-wide below
      if (usable.length > 1) push(usable, layer, flags & 1);
    } else if (type === "POLYLINE") {
      // Old-style polyline: the POLYLINE entity itself carries no vertices — each is a separate
      // VERTEX entity immediately following, terminated by a SEQEND. Flag 8 = 3D polyline, 1 = closed,
      // 16/64 = polygon/polyface mesh (a SOLID — see parseDXFMesh), skipped here.
      let layer = "0", flags = 0, headerZ = null;
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        if (pairs[i][0] === 8) layer = pairs[i][1];
        else if (pairs[i][0] === 70) flags = parseInt(pairs[i][1], 10) || 0;
        else if (pairs[i][0] === 30) headerZ = num(pairs[i][1]); // #550 — a 2D polyline's elevation (R12 contours)
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
      // #550 — a 2D polyline's vertices sit at the header's elevation (code 30); without one, a vertex's own non-zero z
      if (!(flags & 16) && !(flags & 64) && verts.length > 1) push(flags & 8 ? verts : verts.map((q) => ({ ...q, z: headerZ != null ? headerZ : q.z || null })), layer, flags & 1);
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
    } else if (type === "CIRCLE" || type === "ARC") {
      // #550 — collar symbols, pit-shell arcs: drawn as polylines (48 segments a full turn) at the entity's elevation
      let layer = "0", cx = null, cy = null, cz = null, r = null, a0 = 0, a1 = 360;
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 8) layer = v; else if (c === 10) cx = num(v); else if (c === 20) cy = num(v); else if (c === 30) cz = num(v);
        else if (c === 40) r = num(v); else if (c === 50) a0 = num(v) ?? 0; else if (c === 51) a1 = num(v) ?? 360;
        i++;
      }
      if ([cx, cy, r].every(Number.isFinite) && r > 0) {
        const full = type === "CIRCLE";
        let sweep = full ? 360 : ((a1 - a0) % 360 + 360) % 360 || 360; // an ARC runs counter-clockwise from 50 to 51
        const n = Math.max(4, Math.ceil(48 * sweep / 360));
        const pts = [];
        for (let k = 0; k <= (full ? n - 1 : n); k++) { const t = ((a0 + (sweep * k) / n) * Math.PI) / 180; pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), z: cz }); }
        push(pts, layer, full);
      }
    } else {
      if (type === "3DFACE") faces++;
      else if (!["SEQEND", "VERTEX", "ENDSEC", "EOF"].includes(type)) skipped[type] = (skipped[type] || 0) + 1; // #550
      i++;
    }
  }

  // TASKS.csv #550 — elevation 0. AutoCAD writes a 0 elevation on nearly every 2D entity by default, so a file whose
  // strings are ALL at 0 is a plan drawing (claims, outlines) with no elevation, not a drawing at sea level; but in a
  // file that carries real elevations, a 0 is real too (a sea-level or mine-grid-zero string among contours).
  const anyNonZero = polylines.some((pl) => pl.some((q) => q.z != null && q.z !== 0));
  let zerosDropped = false;
  if (!anyNonZero) {
    polylines.forEach((pl, k) => { if (pl.some((q) => q.z === 0)) { zerosDropped = true; polylines[k] = pl.map((q) => ({ x: q.x, y: q.y })); } });
    has3D = false;
  } else has3D = true;

  if (!polylines.length) {
    const err = new Error(faces ? "This DXF contains only faces (3DFACE / polyface mesh) — it is a solid, not strings." : "No usable LINE/LWPOLYLINE/POLYLINE/POINT entities found in this DXF's ENTITIES section.");
    err.facesOnly = faces > 0;
    throw err;
  }
  return { polylines, layers, closed, has3D, skipped, zerosDropped };
}

// TASKS.csv #550 — "skipped 37 TEXT, 12 INSERT" for the import notice ("" when nothing was skipped)
export function dxfSkippedText(skipped) {
  const e = Object.entries(skipped || {}).sort((a, b) => b[1] - a[1]);
  return e.length ? `skipped ${e.map(([t, n]) => `${n} ${t}`).join(", ")} (not imported: text, block references and fills carry no line geometry GeoStrix uses)` : "";
}

// TASKS.csv #408 — one boundary spec per DXF layer (a CAD file's layers are its real grouping: pit crest,
// toe, centreline...), each keeping its vertices' Z when the file has any.
export function dxfToBoundaries(text, baseName) {
  const { polylines, layers, closed, has3D, skipped, zerosDropped } = parseDXF(text);
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
    dxfSkipped: skipped, dxfZerosDropped: zerosDropped, // #550 — for the import notice
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
//
// TASKS.csv #414 — streaming, typed-array parser, ONE MESH PER DXF LAYER. The first version split the whole
// file into a line array, then a [code, value] pair array, then welded through string keys into [x,y,z]
// arrays: a 200k-face (39 MB) file took 1.6 s and 522 MB of heap, 1M faces (195 MB) 11 s and 1.6 GB, all on
// the UI thread, and every layer (pit shell, stopes, pillars...) merged into one grey mesh. Now:
//   * fed in chunks (feed(text) any number of times, then finish()), so a file is never held as one string —
//     it can also be larger than the ~512 MB a JS string can hold — and solidImport.worker.js can stream it
//     off the UI thread;
//   * per-layer growable Float64 positions + Uint32 indices, welded through an open-addressing hash on the
//     quantised coordinates (no per-vertex string keys or arrays).
// Result: { parts: [{ layer, positions: Float64Array (x,y,z world), indices: Uint32Array }], triangleCount,
// vertexCount, nFaceEntities, nPolyfaceMeshes }. Weld rule and triangle rules are unchanged.
class GrowF64 {
  constructor(n = 3072) { this.a = new Float64Array(n); this.n = 0; }
  push3(x, y, z) { if (this.n + 3 > this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
  trimmed() { return this.a.slice(0, this.n); }
}
class GrowU32 {
  constructor(n = 3072) { this.a = new Uint32Array(n); this.n = 0; }
  push3(x, y, z) { if (this.n + 3 > this.a.length) { const b = new Uint32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
  trimmed() { return this.a.slice(0, this.n); }
}
const TWO32 = 4294967296;
const mix = (h, v) => {
  const lo = v % TWO32, hi = Math.floor(v / TWO32); // exact for |v| < 2^53 (quantised UTM at 0.1 mm ~ 6e10)
  h = Math.imul(h ^ (lo | 0), 0x85ebca6b);
  return Math.imul(h ^ (hi | 0), 0xc2b2ae35) ^ (h >>> 13);
};
// One layer's mesh under construction.
function meshBucket(layer, q) {
  const pos = new GrowF64(), qpos = new GrowF64(), idx = new GrowU32();
  let table = new Int32Array(4096).fill(-1), count = 0;
  const slot = (qx, qy, qz) => (mix(mix(mix(0x9e3779b9, qx), qy), qz) >>> 0) & (table.length - 1);
  const grow = () => {
    const old = table; table = new Int32Array(old.length * 2).fill(-1);
    for (let k = 0; k < old.length; k++) {
      const v = old[k]; if (v < 0) continue;
      let s = slot(qpos.a[v * 3], qpos.a[v * 3 + 1], qpos.a[v * 3 + 2]);
      while (table[s] >= 0) s = (s + 1) & (table.length - 1);
      table[s] = v;
    }
  };
  return {
    layer,
    vertex(x, y, z) {
      const qx = Math.round(x * q), qy = Math.round(y * q), qz = Math.round(z * q);
      let s = slot(qx, qy, qz);
      for (;;) {
        const v = table[s];
        if (v < 0) break;
        if (qpos.a[v * 3] === qx && qpos.a[v * 3 + 1] === qy && qpos.a[v * 3 + 2] === qz) return v;
        s = (s + 1) & (table.length - 1);
      }
      const v = count++;
      table[s] = v; pos.push3(x, y, z); qpos.push3(qx, qy, qz);
      if (count * 2 > table.length) grow();
      return v;
    },
    // A degenerate triangle (two vertices welded to the same index) has no area and no normal; keeping
    // it would only produce NaN normals downstream. This is exactly what a triangular 3DFACE's repeated
    // 4th vertex collapses to, so this is the normal path, not an error case.
    triangle(a, b, c) { if (a !== b && b !== c && a !== c) idx.push3(a, b, c); },
    get triangles() { return idx.n / 3; },
    get vertices() { return count; },
    result() { return { layer, positions: pos.trimmed(), indices: idx.trimmed() }; },
  };
}

// Line splitter for chunked text: calls onLine(line) per complete line, keeps a partial last line (and a
// trailing "\r" that may be the first half of "\r\n") for the next chunk.
export function lineFeeder(onLine) {
  let rest = "";
  return {
    feed(chunk) {
      let buf = rest + chunk, hold = "";
      if (buf.endsWith("\r")) { buf = buf.slice(0, -1); hold = "\r"; }
      let start = 0, nN = buf.indexOf("\n"), nR = buf.indexOf("\r");
      for (;;) {
        if (nN >= 0 && nN < start) nN = buf.indexOf("\n", start);
        if (nR >= 0 && nR < start) nR = buf.indexOf("\r", start);
        const nl = nN < 0 ? nR : nR < 0 ? nN : Math.min(nN, nR);
        if (nl < 0) break;
        onLine(buf.slice(start, nl));
        start = nl + (nl === nR && nN === nl + 1 ? 2 : 1); // "\r\n" is one line break
      }
      rest = buf.slice(start) + hold;
    },
    end() { const last = rest.replace(/\r$/, ""); if (last.length) onLine(last); rest = ""; },
  };
}

export function createDXFMeshParser(opts = {}) {
  // 1e-4 m = 0.1 mm, which is exactly the precision exportSurfaceDXF writes (toFixed(4)) — welding any
  // tighter than the file's own precision would fail to merge vertices that ARE the same point.
  const q = 1 / (opts.weldTolerance ?? 1e-4);
  const buckets = new Map();
  const bucket = (layer) => { let b = buckets.get(layer); if (!b) { b = meshBucket(layer, q); buckets.set(layer, b); } return b; };
  let nFaceEntities = 0, nPolyfaceMeshes = 0;
  let section = null, sawEntities = false, expectSectionName = false;
  let ent = null;  // the entity whose group codes are being read: { type, layer, ... }
  let poly = null; // an open POLYLINE (its VERTEX entities follow until SEQEND)

  const finishEntity = () => {
    if (!ent) return;
    const e = ent; ent = null;
    if (e.type === "3DFACE") {
      const ok = [0, 1, 2, 3].map((k) => Number.isFinite(e.v[k * 3]) && Number.isFinite(e.v[k * 3 + 1]) && Number.isFinite(e.v[k * 3 + 2]));
      if (ok[0] && ok[1] && ok[2]) {
        const b = bucket(e.layer), v = e.v;
        const a = b.vertex(v[0], v[1], v[2]), bb = b.vertex(v[3], v[4], v[5]), c = b.vertex(v[6], v[7], v[8]);
        b.triangle(a, bb, c);
        if (ok[3]) b.triangle(a, c, b.vertex(v[9], v[10], v[11])); // a quad's 2nd half; no-op for the triangle convention (vertex 3 = vertex 2)
        nFaceEntities++;
      }
    } else if (e.type === "POLYLINE") {
      poly = { layer: e.layer, polyface: (e.flags & 64) !== 0, local: [], faces: [] };
    } else if (e.type === "VERTEX" && poly) {
      const { x, y, z, vflags, f } = e;
      // vertex flag bit 128 = "this VERTEX carries a face record"; bit 64 = "it's a mesh vertex".
      // Falling back to "has any non-zero 71..74" covers writers that omit the flag.
      if ((vflags & 128 && !(vflags & 64)) || (!Number.isFinite(x) && f.some((n) => n !== 0))) poly.faces.push(f);
      else if (Number.isFinite(x) && Number.isFinite(y)) poly.local.push(x, y, Number.isFinite(z) ? z : 0);
      else if (f.some((n) => n !== 0)) poly.faces.push(f);
    }
  };
  const finishPolyline = () => {
    const p = poly; poly = null;
    if (!p || !p.polyface || !p.local.length || !p.faces.length) return;
    const b = bucket(p.layer);
    const gi = [];
    for (let k = 0; k < p.local.length; k += 3) gi.push(b.vertex(p.local[k], p.local[k + 1], p.local[k + 2]));
    p.faces.forEach((f) => {
      // negative index = invisible edge, a display hint only — magnitude is the real 1-based index
      const idx = f.map((n) => Math.abs(n)).filter((n) => n >= 1 && n <= gi.length).map((n) => gi[n - 1]);
      if (idx.length >= 3) {
        b.triangle(idx[0], idx[1], idx[2]);
        if (idx.length === 4) b.triangle(idx[0], idx[2], idx[3]);
      }
    });
    nPolyfaceMeshes++;
  };

  const onPair = (code, value) => {
    if (code === 0) {
      finishEntity();
      if (value === "SECTION") { expectSectionName = true; return; }
      if (value === "ENDSEC") { if (poly) finishPolyline(); section = null; return; }
      if (section !== "ENTITIES") return;
      if (value === "SEQEND") { finishPolyline(); return; }
      if (value === "3DFACE") ent = { type: value, layer: "0", v: new Array(12).fill(NaN) };
      else if (value === "POLYLINE") { if (poly) finishPolyline(); ent = { type: value, layer: "0", flags: 0 }; }
      else if (value === "VERTEX") ent = poly ? { type: value, x: NaN, y: NaN, z: 0, vflags: 0, f: [0, 0, 0, 0] } : null;
      else { if (poly) finishPolyline(); ent = null; } // any other entity also ends an unterminated POLYLINE
      return;
    }
    if (expectSectionName) { expectSectionName = false; if (code === 2) { section = value; if (value === "ENTITIES") sawEntities = true; } return; }
    if (!ent) return;
    if (code === 8) { ent.layer = value || "0"; return; }
    if (ent.type === "3DFACE") {
      // 10..13 = x of vertex 0..3, 20..23 = y, 30..33 = z
      if (code >= 10 && code <= 13) ent.v[(code - 10) * 3] = parseFloat(value);
      else if (code >= 20 && code <= 23) ent.v[(code - 20) * 3 + 1] = parseFloat(value);
      else if (code >= 30 && code <= 33) ent.v[(code - 30) * 3 + 2] = parseFloat(value);
    } else if (ent.type === "POLYLINE") {
      if (code === 70) ent.flags = parseInt(value, 10) || 0;
    } else if (ent.type === "VERTEX") {
      if (code === 10) ent.x = parseFloat(value);
      else if (code === 20) ent.y = parseFloat(value);
      else if (code === 30) ent.z = parseFloat(value);
      else if (code === 70) ent.vflags = parseInt(value, 10) || 0;
      else if (code >= 71 && code <= 74) ent.f[code - 71] = parseInt(value, 10) || 0;
    }
  };

  // Group-code lines are always a bare integer; values are whitespace-trimmed per DXF convention. A line
  // that should be a code but isn't a number drops that pair, as the first version did.
  let codeLine = null;
  const lines = lineFeeder((line) => {
    if (codeLine === null) { codeLine = line; return; }
    const code = parseInt(codeLine.trim(), 10);
    codeLine = null;
    if (Number.isFinite(code)) onPair(code, line.trim());
  });

  return {
    feed: (text) => lines.feed(text),
    // Faces so far (for a progress line / an early budget check).
    get triangleCount() { let t = 0; buckets.forEach((b) => { t += b.triangles; }); return t; },
    finish() {
      lines.end(); finishEntity(); if (poly) finishPolyline();
      if (!sawEntities) throw new Error("No ENTITIES section found — this may not be a valid DXF file, or uses the binary DXF variant (unsupported).");
      const parts = [...buckets.values()].filter((b) => b.triangles > 0).map((b) => b.result());
      if (!parts.length) {
        throw new Error("No 3D faces found — this DXF has no 3DFACE entities or polyface mesh. A plan-view DXF (lines/polylines) can be imported as a boundary from the Geophysics tab instead.");
      }
      const triangleCount = parts.reduce((s, p) => s + p.indices.length / 3, 0);
      const vertexCount = parts.reduce((s, p) => s + p.positions.length / 3, 0);
      return { parts, triangleCount, vertexCount, nFaceEntities, nPolyfaceMeshes };
    },
  };
}

export function parseDXFMesh(text, opts = {}) {
  const p = createDXFMeshParser(opts);
  p.feed(text);
  return p.finish();
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
