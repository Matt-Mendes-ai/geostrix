// TASKS.csv #519 — section digitising: snapping, vertex editing, ghosted neighbour strings. Pure helpers for
// SectionWindow (and their tests). A section contact vertex is { l, z, x, y } in world coordinates (l = distance
// along the section line); a SNAPPED vertex also carries { hole_id, md, snap: "boundary" | "trace" } and the
// EXACT x / y / z of that point on the hole — so a contact snapped to a logged litho top goes into the implicit
// model at the logged contact, not a few metres off it (and not flattened onto the section plane).

// Snap targets: the depths on each hole where a contact belongs. For a unit's upper contact (kind "contact"): the
// TOP of each logged interval of that unit (the intervals' label is "Lithology: <unit>"). For faults and free
// strings: every logged interval boundary (top and base) of any layer.
// A unit's top only where the unit STARTS: a row that continues the same unit from the row above (a logging split,
// e.g. VCL 1.9-18.0 then VCL 18.0-20.5) is not a contact — the modeller skips those too (useModelling).
// TASKS.csv #569 — with `holes` ([{ hole_id, trace }]) an interval whose trace RISES from `from` to `to` (an
// up-hole) has its top at `to`, and continues the unit when the next row along the hole is the same unit.
export function snapTargets(intervals, { unit, kind, holes = null }) {
  const out = new Map();
  if (kind === "contact") {
    const want = `Lithology: ${unit}`;
    const byHole = new Map();
    for (const iv of intervals || []) if (iv.layer === "litho") { if (!byHole.has(iv.hole_id)) byHole.set(iv.hole_id, []); byHole.get(iv.hole_id).push(iv); }
    const traceOf = new Map((holes || []).map((h) => [h.hole_id, h.trace]));
    for (const rows of byHole.values()) {
      rows.sort((a, b) => a.from - b.from);
      rows.forEach((iv, i) => {
        if (iv.label !== want) return;
        const tr = traceOf.get(iv.hole_id);
        const zf = tr ? traceAt(tr, iv.from)?.z : NaN, zt = tr ? traceAt(tr, iv.to)?.z : NaN;
        const upHole = Number.isFinite(zf) && Number.isFinite(zt) && zt > zf + 1e-6;
        const nb = upHole ? rows[i + 1] : rows[i - 1];
        if (nb && nb.label === want && Math.abs(upHole ? nb.from - iv.to : nb.to - iv.from) < 1e-6) return; // same unit continues
        const md = upHole ? iv.to : iv.from;
        out.set(`${iv.hole_id}|${md}`, { hole_id: iv.hole_id, md, label: iv.label });
      });
    }
    return [...out.values()];
  }
  for (const iv of intervals || []) {
    {
      out.set(`${iv.hole_id}|${iv.from}`, { hole_id: iv.hole_id, md: iv.from, label: iv.label });
      out.set(`${iv.hole_id}|${iv.to}`, { hole_id: iv.hole_id, md: iv.to, label: iv.label });
    }
  }
  return [...out.values()];
}

// point on a trace ([{ md, x, y, z }]) at depth md
export function traceAt(trace, md) {
  if (!trace?.length) return null;
  if (md <= trace[0].md) return { ...trace[0], md };
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    if (md <= q.md) { const f = (md - p.md) / (q.md - p.md || 1e-12); return { md, x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f }; }
  }
  return { ...trace[trace.length - 1], md };
}

// Snap a click. `click` = { sx, sy } screen; `toScreen(x, y, z)` -> [sx, sy]; `along(x, y)` -> l.
// Order: a snap target within `radius` px wins (nearest); else the nearest point on any trace within `radius`;
// else null (the caller keeps the free click).
export function snapClick(click, { holes, targets, toScreen, along, radius = 12 }) {
  const traceOf = new Map((holes || []).map((h) => [h.hole_id, h.trace]));
  let best = null;
  for (const t of targets || []) {
    const p = traceAt(traceOf.get(t.hole_id), t.md);
    if (!p) continue;
    const [px, py] = toScreen(p.x, p.y, p.z);
    const d = Math.hypot(px - click.sx, py - click.sy);
    if (d <= radius && (!best || d < best.d)) best = { d, p, hole_id: t.hole_id, md: t.md, snap: "boundary", label: t.label };
  }
  if (best) return { l: along(best.p.x, best.p.y), z: best.p.z, x: best.p.x, y: best.p.y, hole_id: best.hole_id, md: best.md, snap: "boundary", label: best.label };
  for (const h of holes || []) {
    const tr = h.trace || [];
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      const [ax, ay] = toScreen(a.x, a.y, a.z), [bx, by] = toScreen(b.x, b.y, b.z);
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      const f = L2 > 0 ? Math.max(0, Math.min(1, ((click.sx - ax) * vx + (click.sy - ay) * vy) / L2)) : 0;
      const d = Math.hypot(ax + f * vx - click.sx, ay + f * vy - click.sy);
      if (d <= radius && (!best || d < best.d)) best = { d, hole_id: h.hole_id, md: a.md + (b.md - a.md) * f };
    }
  }
  if (!best) return null;
  const p = traceAt(traceOf.get(best.hole_id), best.md);
  return { l: along(p.x, p.y), z: p.z, x: p.x, y: p.y, hole_id: best.hole_id, md: +best.md.toFixed(3), snap: "trace" };
}

// vertex editing — all return a NEW points array
export const moveVertex = (points, i, pt) => points.map((p, k) => (k === i ? { l: pt.l, z: pt.z, x: pt.x, y: pt.y, ...(pt.snap ? { hole_id: pt.hole_id, md: pt.md, snap: pt.snap } : {}) } : p));
export const deleteVertex = (points, i) => (points.length > 2 ? points.filter((_, k) => k !== i) : points);
export const insertVertex = (points, afterIndex, pt) => [...points.slice(0, afterIndex + 1), pt, ...points.slice(afterIndex + 1)];
// index of the segment (i -> i + 1) nearest a screen point, within `radius` px, or -1
export function nearestSegment(points, sxsz, click, radius = 6) {
  let best = -1, bestD = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = sxsz(points[i - 1]), [bx, by] = sxsz(points[i]);
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    const f = L2 > 0 ? Math.max(0, Math.min(1, ((click.sx - ax) * vx + (click.sy - ay) * vy) / L2)) : 0;
    const d = Math.hypot(ax + f * vx - click.sx, ay + f * vy - click.sy);
    if (d < bestD) { bestD = d; best = i - 1; }
  }
  return bestD <= radius ? best : -1;
}

// Ghosts: strings from the nearest PARALLEL sections (azimuth within `tolDeg`, either direction) on each side of
// this one, within `maxOffset` m, projected onto this section (l along it, z). The interpreter sees the previous /
// next section's string while drawing this one — the core of sectional interpretation.
export function ghostStrings(current, sections, { tolDeg = 5, maxOffset = Infinity } = {}) {
  const dx = current.bx - current.ax, dy = current.by - current.ay, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const azOf = (s) => (Math.atan2(s.bx - s.ax, s.by - s.ay) * 180) / Math.PI;
  const az = azOf(current);
  const cand = (sections || []).filter((s) => s.id !== current.id && (s.contacts || []).length).map((s) => {
    let d = Math.abs(((azOf(s) - az) % 180 + 180) % 180); d = Math.min(d, 180 - d);
    const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
    return { s, dAz: d, offset: (mx - current.ax) * nx + (my - current.ay) * ny };
  }).filter((c) => c.dAz <= tolDeg && Math.abs(c.offset) > 1e-6 && Math.abs(c.offset) <= maxOffset);
  const pick = (sign) => cand.filter((c) => Math.sign(c.offset) === sign).sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0];
  return [pick(1), pick(-1)].filter(Boolean).map(({ s, offset }) => ({
    sectionId: s.id, sectionName: s.name, offset,
    strings: s.contacts.map((c) => ({ unit: c.unit, color: c.color, points: (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => ({ l: (p.x - current.ax) * ux + (p.y - current.ay) * uy, z: p.z })) })),
  }));
}
