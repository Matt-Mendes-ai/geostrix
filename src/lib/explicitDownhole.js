// TASKS.csv #1002 — a downhole dip guide for explicit surfaces (structural geologist, review #918 / #982). A contact picked
// on a hole usually has an oriented-core measurement of that contact at (or near) the same depth: the surface should leave
// the hole at that attitude, not only at whatever slope the neighbouring picks imply. For each pick on a hole, the nearest
// structure reading of the chosen type within `windowM` down-hole gives the contact's plane there; two short CONSTRUCTED
// lines through the pick (`reachM` each way along the dip and along the strike) carry that plane into the fit, reported
// as constructed exactly like the map dip guide (#817). Pure.

// picks: [{ x, y, z, hole_id, md }] (already on the hole's current trace); rows: structure rows { hole_id, depth, dip,
// azimuth (dip direction), value (type) }; types: the structure types to use ([] = any).
// -> { lines: [{ ref, src: "downhole", pts }], used: [{ hole, md, depth, dip, dipDir, type }], unmatched }
export function downholeDipGuides(picks, rows, { types = [], windowM = 3, reachM = 25, step = 10 } = {}) {
  const out = { lines: [], used: [], unmatched: 0 };
  if (!(reachM > 0)) return out;
  const want = new Set((types || []).map(String));
  const byHole = new Map();
  for (const r of rows || []) {
    if (r.hole_id == null || !Number.isFinite(Number(r.depth)) || !Number.isFinite(r.dip) || !Number.isFinite(r.azimuth)) continue;
    if (want.size && !want.has(String(r.value ?? ""))) continue;
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
  }
  const rad = Math.PI / 180;
  for (const p of picks || []) {
    if (p.hole_id == null || !Number.isFinite(p.md) || ![p.x, p.y, p.z].every(Number.isFinite)) continue;
    let best = null, bd = Infinity;
    for (const r of byHole.get(p.hole_id) || []) { const d = Math.abs(Number(r.depth) - p.md); if (d <= windowM && d < bd) { bd = d; best = r; } }
    if (!best) { out.unmatched++; continue; }
    const dip = best.dip * rad, az = best.azimuth * rad;
    const down = [Math.sin(az) * Math.cos(dip), Math.cos(az) * Math.cos(dip), -Math.sin(dip)]; // down the dip, in the plane
    const strike = [Math.cos(az), -Math.sin(az), 0]; // level, in the plane
    const line = (u) => {
      const n = Math.max(1, Math.ceil(reachM / step)), pts = [];
      for (let k = -n; k <= n; k++) { const t = (k / n) * reachM; pts.push({ x: p.x + u[0] * t, y: p.y + u[1] * t, z: p.z + u[2] * t }); }
      return pts;
    };
    const ref = `${p.hole_id} @ ${p.md.toFixed(1)} m`;
    out.lines.push({ ref: `${ref} (downhole dip guide)`, src: "downhole", pts: line(down) }, { ref: `${ref} (downhole strike guide)`, src: "downhole", pts: line(strike) });
    out.used.push({ hole: p.hole_id, md: p.md, depth: Number(best.depth), dip: best.dip, dipDir: best.azimuth, type: best.value ?? "" });
  }
  return out;
}
