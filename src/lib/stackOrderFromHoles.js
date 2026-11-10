// TASKS.csv #2382 (review #2325, WA uranium) — the stack's order is typed by hand and was never checked against the holes: E1, QA, H (the
// reverse of the logs) ran 116 s and ended "the model puts 0% of 6813 logged metres ... in the unit they were logged as", with no word that
// every hole has them the other way up. Down each hole, the unit whose first interval starts higher is the younger; counted over the holes
// that log both, pair by pair. Pure.

// rows: Lithology { hole_id, from, value }; kOf: Map(code -> index in the stack, youngest first); n: stack size
// -> { above: n x n counts (holes where unit a starts above unit b), conflicts: [{ younger, older, against, of }], order: indices youngest first }
export function stackOrderFromHoles(rows, kOf, n, { minHoles = 3, share = 2 / 3 } = {}) {
  const top = new Map(); // hole -> Float64Array(n) of first-interval depths
  for (const r of rows || []) {
    const k = kOf.get(r.value);
    const d = Number(r.from);
    if (k === undefined || !Number.isFinite(d)) continue;
    let t = top.get(r.hole_id);
    if (!t) { t = new Float64Array(n).fill(Infinity); top.set(r.hole_id, t); }
    if (d < t[k]) t[k] = d;
  }
  const above = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const t of top.values()) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b && t[a] < t[b] && Number.isFinite(t[b])) above[a][b]++;
  // a pair in the stack's order (a younger than b) that the holes put the other way up, in most of the holes that have both
  const conflicts = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const of = above[a][b] + above[b][a];
    if (of >= minHoles && above[b][a] >= share * of) conflicts.push({ younger: a, older: b, against: above[b][a], of });
  }
  // the order the holes give: by how many of the others each unit starts above (ties: as given)
  const wins = above.map((row, a) => row.reduce((s, v, b) => s + (v > above[b][a] ? 1 : 0), 0));
  const order = wins.map((_, i) => i).sort((p, q) => wins[q] - wins[p] || p - q);
  return { above, conflicts, order };
}
