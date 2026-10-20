// TASKS.csv #525 — level plans (horizontal sections at an RL). The vertical section tools (#98 / #357 / #499) cut
// everything with a vertical plane along a line; a plan at, say, 850 m RL cuts with the horizontal plane z = RL and
// keeps what lies within a slab RL ± half-width. Pure geometry here (no React, no three.js), shared by the plan
// window and its tests:
//   slabRuns      the depth runs of a trace inside the slab (what is drawn on the plan, and what logs are clipped to)
//   piercePoints  where a trace crosses the RL exactly (the classic level-plan "pierce point", with its depth)
//   voxelPlanRects  block-model cells whose vertical extent contains the RL, as E/N rectangles
//   meshPlanCut   a triangle mesh cut by the plane z = RL, as E/N segments (model surfaces, solids)
// A trace is [{ md, x (E), y (N), z (elevation) }], as desurveyHole returns.

// md runs [[md0, md1], ...] where zmin <= z <= zmax, interpolated at the crossings
export function slabRuns(trace, zmin, zmax) {
  const runs = [];
  let start = null;
  const inside = (p) => p.z >= zmin && p.z <= zmax;
  const cross = (p, q, zc) => p.md + ((q.md - p.md) * (zc - p.z)) / (q.z - p.z || 1e-12);
  for (let i = 0; i < trace.length; i++) {
    const p = trace[i];
    if (i === 0) { if (inside(p)) start = p.md; continue; }
    const q = trace[i - 1];
    const pin = inside(p), qin = inside(q);
    if (pin && !qin) start = cross(q, p, q.z < zmin ? zmin : zmax);
    if (!pin && qin) { runs.push([start, cross(q, p, p.z < zmin ? zmin : zmax)]); start = null; }
    if (!pin && !qin && ((q.z < zmin && p.z > zmax) || (q.z > zmax && p.z < zmin))) {
      // passes straight through the slab between two samples
      const a = cross(q, p, q.z > zmax ? zmax : zmin), b = cross(q, p, q.z > zmax ? zmin : zmax);
      runs.push([Math.min(a, b), Math.max(a, b)]);
    }
  }
  if (start != null) runs.push([start, trace[trace.length - 1].md]);
  return runs.filter(([a, b]) => b - a > 1e-9 || trace.length === 1);
}

// position on a trace at depth md (linear between samples)
export function pointAtMd(trace, md) {
  if (!trace.length) return null;
  if (md <= trace[0].md) return { ...trace[0] };
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    if (md <= q.md) { const f = (md - p.md) / (q.md - p.md || 1e-12); return { md, x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f }; }
  }
  return { ...trace[trace.length - 1] };
}

// every crossing of z = rl: [{ md, x, y }]
export function piercePoints(trace, rl) {
  const out = [];
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    if ((p.z - rl) * (q.z - rl) <= 0 && p.z !== q.z) {
      const f = (rl - p.z) / (q.z - p.z);
      if (f < 0 || f > 1 || (f === 0 && i > 1)) continue; // a sample exactly on the RL is counted once
      out.push({ md: p.md + (q.md - p.md) * f, x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
    }
  }
  return out;
}

// the parts of a trace inside the md runs, as E/N polylines
export function tracePolylines(trace, runs) {
  return runs.map(([a, b]) => {
    const pts = [pointAtMd(trace, a)];
    for (const p of trace) if (p.md > a && p.md < b) pts.push(p);
    pts.push(pointAtMd(trace, b));
    return pts.map((p) => [p.x, p.y]);
  });
}

// block-model cells cut by the RL: { x0, y0, x1, y1, value, cell }
export function voxelPlanRects(cells, rl) {
  const out = [];
  for (const c of cells || []) {
    const dz = c.dz || 0;
    if (rl < c.z - dz / 2 || rl > c.z + dz / 2) continue;
    out.push({ x0: c.x - (c.dx || 0) / 2, y0: c.y - (c.dy || 0) / 2, x1: c.x + (c.dx || 0) / 2, y1: c.y + (c.dy || 0) / 2, value: c.value, cell: c });
  }
  return out;
}

// a triangle mesh cut by z = rl. `vertexAt(i)` -> {x (E), y (N), z} in world coordinates; `triangles` = vertex
// index triples (flat). Returns [[e0, n0, e1, n1], ...].
export function meshPlanCut(vertexCount, triangles, vertexAt, rl) {
  const segs = [];
  const V = new Array(vertexCount);
  const at = (i) => V[i] || (V[i] = vertexAt(i));
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const v = [at(triangles[t]), at(triangles[t + 1]), at(triangles[t + 2])];
    const cut = [];
    for (let e = 0; e < 3; e++) {
      const p = v[e], q = v[(e + 1) % 3];
      const dp = p.z - rl, dq = q.z - rl;
      if ((dp <= 0 && dq > 0) || (dp > 0 && dq <= 0)) {
        const f = dp / (dp - dq);
        cut.push([p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f]);
      }
    }
    if (cut.length === 2) segs.push([cut[0][0], cut[0][1], cut[1][0], cut[1][1]]);
  }
  return segs;
}

// a strike / dip symbol for a structure pick on the plan: strike line through the point (half-length `len`)
// and a dip tick toward the dip direction. Bearings in degrees clockwise from grid north.
export function strikeDipSymbol(x, y, dip, dipDir, len = 6) {
  const s = ((dipDir - 90) * Math.PI) / 180, d = (dipDir * Math.PI) / 180;
  return {
    strike: [x - len * Math.sin(s), y - len * Math.cos(s), x + len * Math.sin(s), y + len * Math.cos(s)],
    tick: [x, y, x + (len / 2.2) * Math.sin(d), y + (len / 2.2) * Math.cos(d)],
    label: `${Math.round(dip)}`,
  };
}
