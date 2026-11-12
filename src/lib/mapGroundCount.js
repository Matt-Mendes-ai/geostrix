// TASKS.csv #2959 (WA iron review) — before a Model from map run, how many of its inputs have terrain under them: the run (modellingRuns.js
// runMapModel) places each contact point (the map contacts between units of the order, a point every 25 m) and each measurement on the
// ground, and where the terrain has no data at the map layer's own elevation (#2410). The review's run found out afterwards that 265 of
// 357 sat on a flat RL 439. Pure.

// a polyline [[x, y]] -> a point at its start and every `step` m along it (as the run thins contact lines)
export function thinLine(line, step) {
  const out = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - acc;
    while (t <= L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
    acc = L - (t - step);
  }
  return out;
}

// contacts: extractMapContacts(...).contacts; order: the units in the run; groundAt(x, y) -> elevation or NaN; measurements [{ x, y, dip,
// dipDir }] -> { points, pointsOnGround, measurements, measurementsOnGround }
export function mapGroundCount({ contacts, order, groundAt, measurements = [], step = 25 }) {
  const inOrder = new Set(order || []);
  let points = 0, pointsOnGround = 0, n = 0, nOn = 0;
  for (const c of contacts || []) {
    const [a, b] = c.units || [];
    if (!inOrder.has(a) || !inOrder.has(b)) continue;
    for (const line of c.lines || []) for (const [x, y] of thinLine(line, step)) { points++; if (Number.isFinite(groundAt(x, y))) pointsOnGround++; }
  }
  for (const m of measurements) {
    if (![m.x, m.y, m.dip, m.dipDir].every(Number.isFinite)) continue;
    n++; if (Number.isFinite(groundAt(m.x, m.y))) nOn++;
  }
  return { points, pointsOnGround, measurements: n, measurementsOnGround: nOn };
}

// TASKS.csv #2973 (WA iron review) — logged contacts [{ hole_id }] split by whether their hole is collared inside bbox [x0, y0, x1, y1]
// (the map layer's area) -> { inside, insideHoles, outside } (a contact whose hole has no collar counts as outside)
export function contactsInArea(contacts, collars, bbox) {
  const [x0, y0, x1, y1] = bbox || [];
  const inBox = new Set((collars || []).filter((c) => Number(c.x) >= x0 && Number(c.x) <= x1 && Number(c.y) >= y0 && Number(c.y) <= y1).map((c) => c.hole_id));
  let inside = 0;
  const holes = new Set();
  for (const c of contacts || []) if (inBox.has(c.hole_id)) { inside++; holes.add(c.hole_id); }
  return { inside, insideHoles: holes.size, outside: (contacts || []).length - inside };
}
