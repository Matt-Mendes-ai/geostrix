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

  const polylines = [];
  let i = entStart;
  while (i < entEnd) {
    const [code, value] = pairs[i];
    if (code !== 0) { i++; continue; }
    const type = value;
    if (type === "LINE") {
      const pt = { x: null, y: null }, pt2 = { x: null, y: null };
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 10) pt.x = parseFloat(v); else if (c === 20) pt.y = parseFloat(v);
        else if (c === 11) pt2.x = parseFloat(v); else if (c === 21) pt2.y = parseFloat(v);
        i++;
      }
      if ([pt.x, pt.y, pt2.x, pt2.y].every(Number.isFinite)) polylines.push([pt, pt2]);
    } else if (type === "LWPOLYLINE") {
      const verts = [];
      let cur = null;
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 10) { if (cur) verts.push(cur); cur = { x: parseFloat(v), y: null }; }
        else if (c === 20 && cur) cur.y = parseFloat(v);
        i++;
      }
      if (cur) verts.push(cur);
      const usable = verts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (usable.length > 1) polylines.push(usable);
    } else if (type === "POLYLINE") {
      // Old-style polyline: the POLYLINE entity itself carries no vertices — each is a separate
      // VERTEX entity immediately following, terminated by a SEQEND.
      i++;
      const verts = [];
      while (i < entEnd && !(pairs[i][0] === 0 && pairs[i][1] === "SEQEND")) {
        if (pairs[i][0] === 0 && pairs[i][1] === "VERTEX") {
          const v = { x: null, y: null };
          i++;
          while (i < entEnd && pairs[i][0] !== 0) {
            if (pairs[i][0] === 10) v.x = parseFloat(pairs[i][1]);
            else if (pairs[i][0] === 20) v.y = parseFloat(pairs[i][1]);
            i++;
          }
          if (Number.isFinite(v.x) && Number.isFinite(v.y)) verts.push(v);
        } else {
          i++;
        }
      }
      if (verts.length > 1) polylines.push(verts);
      i++; // past SEQEND
    } else if (type === "POINT") {
      const pt = { x: null, y: null };
      i++;
      while (i < entEnd && pairs[i][0] !== 0) {
        if (pairs[i][0] === 10) pt.x = parseFloat(pairs[i][1]);
        else if (pairs[i][0] === 20) pt.y = parseFloat(pairs[i][1]);
        i++;
      }
      // A lone point has nothing to draw a line to — represented as a degenerate 1-vertex "loop" so
      // it still round-trips through the same polylines shape rather than needing a separate list;
      // callers that only draw >=2-point loops (e.g. ViewerModule's LineLoop renderer) simply won't
      // render it, same as any other too-short loop.
      if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) polylines.push([pt]);
    } else {
      i++;
    }
  }

  if (!polylines.length) {
    throw new Error("No usable LINE/LWPOLYLINE/POLYLINE/POINT entities found in this DXF's ENTITIES section.");
  }
  return { polylines };
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

  features.forEach((f) => {
    const layer = sanitizeLayerName(f.attributes?.hole_id);
    if (geomType === "point" || f.geometry.length === 1) {
      f.geometry.forEach(([x, y]) => {
        put(0, "POINT"); put(8, layer); put(10, x.toFixed(4)); put(20, y.toFixed(4)); put(30, "0.0");
      });
      return;
    }
    // LWPOLYLINE for every multi-vertex geometry (a plain 2-point "LINE" is just a 2-vertex
    // LWPOLYLINE) — one entity type to write/verify instead of two.
    put(0, "LWPOLYLINE"); put(8, layer); put(90, f.geometry.length); put(70, 0);
    f.geometry.forEach(([x, y]) => { put(10, x.toFixed(4)); put(20, y.toFixed(4)); });
  });

  put(0, "ENDSEC");
  put(0, "EOF");
  return lines.join("\n") + "\n";
}
