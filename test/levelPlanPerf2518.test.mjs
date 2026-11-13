// TASKS.csv #2518 — the level plan froze 0.8-4.4 s per RL step on 2,248 holes; the CPU profile put the time in the hole-id declutter (every
// placed box scanned for every candidate spot) and the labels were recomputed on every render. The declutter and the clustering now use a
// grid (the same result as the plain scans, checked here against copies of them), the RL applies when the slider stops, and the plan opens
// on the RL most holes cross.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLabels, clusterLabelPoints, labelWidth, groupLabelText } from "../src/lib/sectionLabels.js";
import { busiestRl } from "../src/lib/levelPlan.js";

// the scans as they were before #2518
function oldCluster(points, radius = 8) {
  const groups = [], r2 = radius * radius;
  for (const p of points || []) {
    const g = groups.find((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= r2);
    if (g) { if (!g.ids.includes(p.id)) g.ids.push(p.id); } else groups.push({ key: p.key, x: p.x, y: p.y, ids: [p.id] });
  }
  return groups;
}
function oldResolve(specs, obstacles = [], { gap = 1.5, bounds = null, yBounds = null } = {}) {
  const RINGS = 10;
  const placed = obstacles.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h, y1: b.y + 2 }));
  const boxOf = (c, text, size) => { const w = labelWidth(text, size), x0 = c.anchor === "end" ? c.x - w : c.anchor === "middle" ? c.x - w / 2 : c.x; return { x0, x1: x0 + w, y0: c.y - size, y1: c.y + 2 }; };
  const hit = (a) => placed.some((b) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap);
  const out = [];
  const inWithin = (s, b) => !s.within || (b.x0 >= s.within[0] && b.x1 <= s.within[1] && b.y0 >= s.within[2] && b.y1 <= s.within[3]);
  specs.map((s, i) => ({ s, i })).sort((a, b) => b.s.prio - a.s.prio || a.i - b.i).forEach(({ s }) => {
    let pick = null;
    for (const c of s.cands) { const box = boxOf(c, s.text, s.size); if (!hit(box) && inWithin(s, box)) { pick = { c, box }; break; } }
    if (!pick && s.prio <= 1) return;
    let leaderFrom = null;
    if (!pick) {
      const c0 = s.cands[0], w = labelWidth(s.text, s.size), inside = (b) => (!bounds || (b.x0 >= bounds[0] && b.x1 <= bounds[1])) && (!yBounds || (b.y0 >= yBounds[0] && b.y1 <= yBounds[1]));
      search: for (let r = 1; r <= RINGS; r++) for (const dy of [r, -r]) for (const dx of [0, -0.6, 0.6, -1.2, 1.2]) {
        const c = { ...c0, x: c0.x + dx * w, y: c0.y + dy * (s.size + 3) }, box = boxOf(c, s.text, s.size);
        if (inside(box) && inWithin(s, box) && !hit(box)) { pick = { c, box }; leaderFrom = { x: c0.x, y: c0.y - s.size / 2 }; break search; }
      }
      if (!pick && (s.optional || s.within)) return;
      if (!pick) pick = { c: c0, box: boxOf(c0, s.text, s.size) };
    }
    placed.push(pick.box);
    out.push({ ...s, x: pick.c.x, y: pick.c.y, anchor: pick.c.anchor || "start", ...(leaderFrom ? { leaderFrom } : {}) });
  });
  return out;
}

// a level plan's pierce points: a 25 m grid of 2,248 holes drawn ~760 px wide (as the review's), plus fans sharing a collar
let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pts = [];
for (let i = 0; i < 48; i++) for (let j = 0; j < 47; j++) pts.push({ key: `p${pts.length}`, id: `LP${pts.length}`, x: 20 + i * 15.5 + rnd() * 3, y: 30 + j * 13 + rnd() * 3 });
for (let f = 0; f < 30; f++) for (let k = 0; k < 5; k++) pts.push({ key: `f${f}_${k}`, id: `FAN${f}_${k}`, x: 100 + f * 20 + k * 0.8, y: 400 + k * 0.5 });
const specsOf = (groups) => groups.map((g) => ({ key: g.key, text: groupLabelText(g.ids), ids: g.ids, size: 10.5, prio: 2, optional: true, cands: [{ x: g.x + 6, y: g.y - 5, anchor: "start" }, { x: g.x + 6, y: g.y + 13, anchor: "start" }, { x: g.x - 6, y: g.y - 5, anchor: "end" }, { x: g.x - 6, y: g.y + 13, anchor: "end" }] }));
const obst = pts.map((p) => ({ x: p.x, y: p.y + 5, w: 11, h: 11 }));
const opts = { bounds: [2, 798], yBounds: [20, 700] };

test("clustering by grid gives the same groups as the plain scan", () => {
  const a = clusterLabelPoints(pts, 8), b = oldCluster(pts, 8);
  assert.deepEqual(a, b);
  assert.ok(a.some((g) => g.ids.length === 5), "a fan of five is one label");
});

test("the grid declutter places the same labels in the same spots, and fast", () => {
  const groups = oldCluster(pts, 8), specs = specsOf(groups);
  const t0 = performance.now();
  const a = resolveLabels(specs, obst, opts);
  const tNew = performance.now() - t0;
  const t1 = performance.now();
  const b = oldResolve(specs, obst, opts);
  const tOld = performance.now() - t1;
  assert.deepEqual(a, b);
  assert.ok(a.length > 20 && a.length < specs.length, `${a.length} of ${specs.length} placed`); // a crowded plan: most ids have no free spot
  assert.ok(tNew < tOld, `grid ${tNew.toFixed(0)} ms vs scan ${tOld.toFixed(0)} ms`);
  console.log(`declutter: grid ${tNew.toFixed(0)} ms, scan ${tOld.toFixed(0)} ms, ${a.length} of ${specs.length} placed`);
  // the section window's float labels (prio 1 and within) behave as before too
  const fl = Array.from({ length: 200 }, (_, i) => ({ key: `s${i}`, text: `Cu ${i}`, size: 9, prio: i % 3, within: i % 4 === 0 ? [0, 400, 0, 300] : undefined, cands: [{ x: (i * 37) % 400, y: 20 + ((i * 53) % 280) }] }));
  assert.deepEqual(resolveLabels(fl, [], { bounds: [0, 400] }), oldResolve(fl, [], { bounds: [0, 400] }));
});

test("busiestRl: the RL most holes cross, the middle of the busiest run", () => {
  const holes = [];
  for (let k = 0; k < 100; k++) holes.push({ trace: [{ z: 300 }, { z: 220 }] }); // 100 holes from 300 to 220
  holes.push({ trace: [{ z: 330 }, { z: -262 }] }); // one deep hole sets the range
  assert.equal(busiestRl(holes), 260);
  assert.equal(busiestRl([]), null);
  assert.equal(busiestRl([{ trace: [{ z: 10.4 }, { z: 10.6 }] }]), 11, "a hole shorter than a metre");
});

test("the window: RL and slab debounced, the plan's RL in the title, the busiest RL at opening, the labels cached", () => {
  const s = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /setTimeout\(\(\) => setApplied\(\(p\) => \(p\.rl === rl && p\.half === half \? p : \{ rl, half \}\)\), 150\)/); // #3064 — the same RL not built again
  assert.match(s, /buildRef\.current\(Number\(applied\.rl\), Math\.max\(0\.1, Number\(applied\.half\) \|\| 0\)\) : emptyPlan\(applied\)\), \[applied, rev, ready\]/);
  assert.match(s, /b = busiestRl\(build\(r0, 12\.5\)\.holes\) \?\? r0;/); // #2929 / #3064 — before any full plan is committed (the first render is an empty plan)
  assert.match(s, /labelMemo\.current\.data === data && labelMemo\.current\.frame === frame/);
  assert.match(s, /\{ rl: data\.rl, half: data\.half \}/);
});
