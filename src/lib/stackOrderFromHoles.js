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

// TASKS.csv #2532 (review #2486, WA lithium) — a stack of three codes that alternate down the holes (P, A and D up to 11 times per hole) ran
// 19 s and reproduced P at 0 %: nothing before the run said these are not layers. Down each hole, the stack units' runs top-down (touching
// rows of one unit merge); a unit that comes back after another unit repeats. -> { holes (with 2+ stack units), repeating (holes where some
// unit repeats), byUnit: counts per unit index, maxRuns: the most runs of one unit in one hole }
export function stackRepeats(rows, kOf, n) {
  const byHole = new Map();
  for (const r of rows || []) {
    const k = kOf.get(r.value), f = Number(r.from), to = Number(r.to);
    if (k === undefined || !Number.isFinite(f) || !(to > f)) continue;
    (byHole.get(r.hole_id) || byHole.set(r.hole_id, []).get(r.hole_id)).push([f, to, k]);
  }
  const byUnit = new Array(n).fill(0);
  let holes = 0, repeating = 0, maxRuns = 0;
  for (const list of byHole.values()) {
    list.sort((a, b) => a[0] - b[0]);
    const runs = [];
    for (const [f, to, k] of list) { const last = runs[runs.length - 1]; if (last && last.k === k) last.to = Math.max(last.to, to); else runs.push({ k, from: f, to }); }
    const seen = new Set(runs.map((r) => r.k));
    if (seen.size < 2) continue;
    holes++;
    const count = new Array(n).fill(0);
    runs.forEach((r) => count[r.k]++);
    let rep = false;
    count.forEach((c, k) => { if (c > 1) { rep = true; byUnit[k]++; if (c > maxRuns) maxRuns = c; } });
    if (rep) repeating++;
  }
  return { holes, repeating, byUnit, maxRuns };
}
