// TASKS.csv #4081 — Surpac string files (.str): text, comma-separated. The round-2 harvest has 155 of them (section and plan slices through a
// model, Voronoi polygons, ellipsoids), listed as "Datamine .str": the format is Surpac's.
//   line 1: the header record (location, date, purpose, memo)
//   line 2: the axis record (0, y1, x1, z1, y2, x2, z2), not a point
//   then:   string number, Y (northing), X (easting), Z, D1, D2 ... (descriptions)
//   a record with string number 0 ends a segment; "0, 0.000, 0.000, 0.000, END" ends the file.
// A segment whose last point repeats its first is closed. Pure: text in, the boundary specs addBoundary takes out (one per string number, like a DXF
// layer; more than MAX_GROUPS string numbers come in as one layer).

const MAX_GROUPS = 12;

export const isSurpacStr = (text, name = "") => {
  if (!/\.str$/i.test(name)) return false;
  const lines = String(text || "").slice(0, 4000).split(/\r\n|\r|\n/);
  return lines.length >= 3 && /^\s*0\s*,(\s*[-+.\deE]+\s*,){2}/.test(lines[1] || "");
};

// -> { title, specs: [{ name, polylines: [[{ x, y, z }]], closedFlags, useVertexZ, surpacString }], segments, points, strings, spots (single-point strings: left out), skipped (unreadable records) }
export function parseSurpacStr(text, baseName = "Surpac strings") {
  const lines = String(text || "").split(/\r\n|\r|\n/);
  const title = (lines[0] || "").split(",").map((s) => s.trim()).filter(Boolean).slice(2, 3)[0] || null;
  const segs = [];
  let cur = null, skipped = 0, spots = 0, points = 0, ended = false;
  const close = () => { if (cur && cur.pts.length >= 2) segs.push(cur); else if (cur && cur.pts.length) spots++; cur = null; };
  for (let i = 2; i < lines.length && !ended; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const f = l.split(",").map((s) => s.trim());
    const sn = Number(f[0]);
    if (!Number.isFinite(sn)) { skipped++; continue; }
    if (sn === 0) { close(); if (f.some((v) => /^END$/i.test(v))) ended = true; continue; }
    const y = Number(f[1]), x = Number(f[2]), z = Number(f[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || f[1] === "" || f[2] === "") { skipped++; continue; }
    if (cur && cur.sn !== sn) close();
    if (!cur) cur = { sn, pts: [] };
    cur.pts.push({ x, y, z: Number.isFinite(z) ? z : 0 });
    points++;
  }
  close();
  const has3D = segs.some((s) => s.pts.some((p) => p.z !== 0));
  const closedOf = (pts) => pts.length >= 4 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y && pts[0].z === pts[pts.length - 1].z;
  const groups = new Map();
  for (const s of segs) {
    const shut = closedOf(s.pts), pl = (shut ? s.pts.slice(0, -1) : s.pts).map((p) => (has3D ? p : { x: p.x, y: p.y }));
    const g = groups.get(s.sn) || groups.set(s.sn, { polylines: [], closedFlags: [] }).get(s.sn);
    g.polylines.push(pl); g.closedFlags.push(shut);
  }
  const list = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const merged = list.length > MAX_GROUPS || list.length === 1;
  const specs = merged
    ? (list.length ? [{ name: baseName, polylines: list.flatMap(([, g]) => g.polylines), closedFlags: list.flatMap(([, g]) => g.closedFlags), useVertexZ: has3D, surpacString: list.length === 1 ? list[0][0] : null }] : [])
    : list.map(([sn, g]) => ({ name: `${baseName} — string ${sn}`, polylines: g.polylines, closedFlags: g.closedFlags, useVertexZ: has3D, surpacString: sn }));
  return { title, specs, segments: segs.length, points, strings: list.length, spots, skipped };
}
