// TASKS.csv #875 — existing interpretation strings (DXF polylines and points from Micromine / Vulcan / a contractor)
// brought into the explicit tools (Matt: "Yes, build it"). From lib/dxf.js parseDXF's { polylines, layers, closed }:
//   - a CLOSED string lying on a saved section (every vertex within tolM of the section's vertical plane) becomes an
//     outline on that section, named after its DXF layer - ready for "Link into a solid";
//   - an OPEN string with elevations becomes a hard line of the chosen explicit surface (the surface passes through it);
//   - a POINT with an elevation becomes a pick;
//   - a string without elevations (2D) and a closed string on no saved section are counted, not guessed at.
// Pure: no React. Coordinates are the project CRS (E, N, elevation); sections are { id, name, ax, ay, bx, by, corridor }.

export function placeDxfStrings(parsed, sections, { tolM = 10 } = {}) {
  const out = { hardLines: [], picks: [], outlines: [], flat: 0, offSection: 0 };
  const P = parsed?.polylines || [];
  P.forEach((pl, i) => {
    const layer = parsed.layers?.[i] || "0", closed = !!parsed.closed?.[i];
    const pts = pl.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!pts.length) return;
    if (!pts.every((p) => Number.isFinite(p.z))) { out.flat++; return; }
    if (pts.length === 1) { out.picks.push({ x: pts[0].x, y: pts[0].y, z: pts[0].z, layer }); return; }
    if (!closed) { out.hardLines.push({ layer, pts: pts.map((p) => ({ x: p.x, y: p.y, z: p.z })) }); return; }
    // a closed string: the saved section whose plane it lies in (the nearest, within tolM for every vertex)
    let best = null;
    for (const s of sections || []) {
      const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy);
      if (!(L > 0)) continue;
      const ux = dx / L, uy = dy / L;
      let worst = 0;
      for (const p of pts) worst = Math.max(worst, Math.abs(-(p.x - s.ax) * uy + (p.y - s.ay) * ux));
      if (worst <= Math.min(tolM, s.corridor ?? tolM) && (!best || worst < best.worst)) best = { s, ux, uy, worst };
    }
    if (!best) { out.offSection++; return; }
    const { s, ux, uy } = best;
    // vertices projected onto the section plane (as a drawn outline is: l along the line, x / y on it)
    const ring = pts.length > 2 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y && pts[0].z === pts[pts.length - 1].z ? pts.slice(0, -1) : pts;
    out.outlines.push({ sectionId: s.id, sectionName: s.name, layer, points: ring.map((p) => { const l = (p.x - s.ax) * ux + (p.y - s.ay) * uy; return { l, z: p.z, x: s.ax + l * ux, y: s.ay + l * uy }; }) });
  });
  return out;
}
