// TASKS.csv #1992 — GOCAD ASCII objects: TSurf (.ts, triangulated surfaces), PLine (.pl, 3D lines) and VSet (.vs, point sets), alone
// or several in one file (.gp groups them). Written from the format as it is publicly documented and widely written (clean room: the
// GPL / unlicensed readers named on the row were not read). Each object runs from a 'GOCAD <Type> 1' line to 'END':
//   HEADER { name:Granite top }                       (or one 'HEADER {name:…}' line)
//   GOCAD_ORIGINAL_COORDINATE_SYSTEM … ZPOSITIVE Depth … END_ORIGINAL_COORDINATE_SYSTEM   (Depth: z is read as -z)
//   PROPERTIES Au Cu / NO_DATA_VALUES -99999 -99999    (the values after x y z on PVRTX lines)
//   VRTX id x y z | PVRTX id x y z v1 v2 …             a vertex
//   ATOM id ref | PATOM id ref …                       a vertex that reuses vertex `ref`
//   TFACE, TRGL a b c                                  (TSurf) faces of triangles
//   ILINE, SEG a b                                     (PLine) lines of segments
// Vertex ids are any integers (usually 1-based, in order); triangles and segments refer to them. Voxet / SGrid / GSurf are named and
// skipped. Streaming: createGocadParser().feedLine(line) per line, finish() once.

const num = Number;

export function createGocadParser() {
  const objects = [];
  let cur = null, inHeader = false, inCrs = false;
  const start = (type) => {
    cur = { type, name: "", crs: { name: "", zSign: 1, projection: "", datum: "", units: "" }, props: [], noData: [],
      ids: new Map(), xyz: [], vals: [], tri: [], segs: [], lineStarts: [], faces: 0, skippedLines: 0 };
    objects.push(cur);
  };
  const addVertex = (id, x, y, z, vals) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { cur.skippedLines++; return; }
    cur.ids.set(id, cur.xyz.length / 3);
    cur.xyz.push(x, y, z);
    if (cur.props.length) cur.vals.push(vals);
  };
  const feedLine = (raw) => {
    const line = raw.trim();
    if (!line || line[0] === "#") return;
    const sp = line.indexOf(" "), kw = (sp < 0 ? line : line.slice(0, sp)).toUpperCase(), rest = sp < 0 ? "" : line.slice(sp + 1).trim();
    if (kw === "GOCAD") { start(rest.split(/\s+/)[0] || "?"); inHeader = false; inCrs = false; return; }
    if (!cur) return;
    if (inHeader) {
      if (line.startsWith("}")) { inHeader = false; return; }
      const m = /^\*?name\s*:\s*(.+)$/i.exec(line);
      if (m && !cur.name) cur.name = m[1].trim();
      return;
    }
    if (inCrs) {
      if (kw === "END_ORIGINAL_COORDINATE_SYSTEM") { inCrs = false; return; }
      if (kw === "ZPOSITIVE") cur.crs.zSign = /^depth/i.test(rest) ? -1 : 1;
      else if (kw === "NAME") cur.crs.name = rest.replace(/^"|"$/g, "");
      else if (kw === "PROJECTION") cur.crs.projection = rest.replace(/^"|"$/g, "");
      else if (kw === "DATUM") cur.crs.datum = rest.replace(/^"|"$/g, "");
      else if (kw === "AXIS_UNIT") cur.crs.units = rest.replace(/"/g, "").split(/\s+/)[0] || "";
      return;
    }
    switch (kw) {
      case "HEADER": {
        const one = /\{([^}]*)\}?/.exec(rest);
        if (one && /}/.test(rest)) { const m = /name\s*:\s*([^;}]+)/i.exec(one[1]); if (m) cur.name = m[1].trim(); }
        else inHeader = true;
        return;
      }
      case "GOCAD_ORIGINAL_COORDINATE_SYSTEM": inCrs = true; return;
      case "PROPERTIES": cur.props = rest.split(/\s+/).filter(Boolean); return;
      case "NO_DATA_VALUES": cur.noData = rest.split(/\s+/).map(num); return;
      case "VRTX": case "PVRTX": {
        const p = rest.split(/\s+/);
        const vals = kw === "PVRTX" && cur.props.length ? cur.props.map((_, i) => { const v = num(p[4 + i]); return Number.isFinite(v) && v !== cur.noData[i] ? v : null; }) : cur.props.map(() => null);
        addVertex(num(p[0]), num(p[1]), num(p[2]), num(p[3]) * cur.crs.zSign, vals);
        return;
      }
      case "ATOM": case "PATOM": {
        const p = rest.split(/\s+/), k = cur.ids.get(num(p[1]));
        if (k === undefined) { cur.skippedLines++; return; }
        cur.ids.set(num(p[0]), k);
        return;
      }
      case "TFACE": cur.faces++; return;
      case "TRGL": {
        const p = rest.split(/\s+/), a = cur.ids.get(num(p[0])), b = cur.ids.get(num(p[1])), c = cur.ids.get(num(p[2]));
        if (a === undefined || b === undefined || c === undefined) { cur.skippedLines++; return; }
        cur.tri.push(a, b, c);
        return;
      }
      case "ILINE": cur.lineStarts.push(cur.segs.length); return;
      case "SEG": {
        const p = rest.split(/\s+/), a = cur.ids.get(num(p[0])), b = cur.ids.get(num(p[1]));
        if (a === undefined || b === undefined) { cur.skippedLines++; return; }
        cur.segs.push(a, b);
        return;
      }
      case "END": cur = null; return;
      default: return; // BSTONE, BORDER, PROPERTY_CLASS…, STRATIGRAPHIC_POSITION, colours: not needed to place the geometry
    }
  };
  const finish = () => objects.map(finishObject);
  return { feedLine, finish };
}

// segments -> polylines of {x,y,z}: consecutive segments that share an end are one line
function chainSegments(segs, xyz) {
  const out = [];
  let line = null, last = -1;
  const pt = (k) => ({ x: xyz[k * 3], y: xyz[k * 3 + 1], z: xyz[k * 3 + 2] });
  for (let i = 0; i < segs.length; i += 2) {
    const a = segs[i], b = segs[i + 1];
    if (line && a === last) { line.push(pt(b)); last = b; continue; }
    line = [pt(a), pt(b)]; last = b; out.push(line);
  }
  return out;
}

function finishObject(o, i) {
  const name = o.name || `${o.type} ${i + 1}`;
  const base = { type: o.type, name, crs: o.crs, skippedLines: o.skippedLines };
  if (/^tsurf$/i.test(o.type)) {
    // only the vertices the triangles use, renumbered (a TSurf can carry unused vertices)
    const map = new Int32Array(o.xyz.length / 3).fill(-1), pos = [];
    const indices = new Uint32Array(o.tri.length);
    for (let k = 0; k < o.tri.length; k++) {
      const v = o.tri[k];
      if (map[v] < 0) { map[v] = pos.length / 3; pos.push(o.xyz[v * 3], o.xyz[v * 3 + 1], o.xyz[v * 3 + 2]); }
      indices[k] = map[v];
    }
    return { ...base, positions: Float64Array.from(pos), indices, triangleCount: o.tri.length / 3, vertexCount: pos.length / 3, faces: Math.max(1, o.faces) };
  }
  if (/^pline$/i.test(o.type)) return { ...base, lines: chainSegments(o.segs, o.xyz) };
  if (/^vset$/i.test(o.type)) {
    const points = [];
    for (let k = 0; k < o.xyz.length / 3; k++) points.push({ x: o.xyz[k * 3], y: o.xyz[k * 3 + 1], z: o.xyz[k * 3 + 2], values: o.vals[k] || [] });
    return { ...base, properties: o.props, points };
  }
  return { ...base, unsupported: true };
}

export function parseGocad(text) {
  const p = createGocadParser();
  for (const line of String(text || "").split(/\r?\n/)) p.feedLine(line);
  return p.finish();
}

// a few words on the file's own coordinate system, for the import notice ("" when it names none)
export function gocadCrsText(crs) {
  if (!crs) return "";
  return [crs.name && crs.name !== "Default" ? crs.name : "", crs.projection && crs.projection !== "Unknown" ? crs.projection : "", crs.datum && crs.datum !== "Unknown" ? crs.datum : ""].filter(Boolean).join(", ");
}
