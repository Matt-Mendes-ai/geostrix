// TASKS.csv #2798 — the helpers every collar commit runs on a 20,000-collar project (the section buffer's drill spacing, the
// 'underground' test, the grid placement, the surface samples' flat level): same answers, a fraction of the time
import test from "node:test";
import assert from "node:assert/strict";
import { drillSiteSpacing } from "../src/lib/drillSpacing.js";
import { collarsLookUnderground } from "../src/lib/pitShell.js";
import { gridPlacement } from "../src/lib/viewer/gridGroup.js";

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const collars = (n) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i}`, x: 600000 + rnd() * 10000, y: 5790000 + rnd() * 10000, z: 1000 + rnd() * 50, dip: 60, depth: 300 }));

test("the underground answer is kept per collars / survey array, and handed out as a copy", () => {
  const cs = collars(50), sv = [{ hole_id: "H1", depth: 10, dip: -30 }, { hole_id: "H2", depth: 10, dip: -30 }];
  const a = collarsLookUnderground(cs, sv);
  assert.equal(a.upward, 2);
  a.underground = "spoiled";
  const b = collarsLookUnderground(cs, sv);
  assert.equal(typeof b.underground, "boolean", "the kept answer is not the caller's object");
  assert.equal(collarsLookUnderground(cs, []).upward, 0, "another survey array is asked again");
  assert.equal(collarsLookUnderground(cs).upward, 0);
  assert.equal(collarsLookUnderground([...cs], sv).upward, 2, "another collars array is asked again");
  assert.equal(collarsLookUnderground(null).underground, false);
});

test("stacked collars are still found with the numeric grid key, including negative local coordinates", () => {
  const cs = [];
  for (let i = 0; i < 10; i++) cs.push({ hole_id: `A${i}`, x: -50 + i * 100, y: -20, z: 100 }, { hole_id: `B${i}`, x: -50 + i * 100 + 2, y: -21, z: 60 });
  const r = collarsLookUnderground(cs);
  assert.equal(r.stacked, 10);
  assert.equal(r.underground, true);
});

test("20,000 collars: spacing, underground and grid placement without an O(n²) slip (about 0.23 s; was 0.9 s)", () => {
  const cs = collars(20000), sv = cs.flatMap((c) => Array.from({ length: 15 }, (_, k) => ({ hole_id: c.hole_id, depth: k * 20, dip: 60 })));
  { const w = collars(2000); drillSiteSpacing(w); collarsLookUnderground(w, []); gridPlacement(w, []); } // warm the code first: a cold call measures the compiler
  const t = performance.now();
  const sp = drillSiteSpacing(cs);
  const ug = collarsLookUnderground(cs, sv);
  const g = gridPlacement(cs, sv);
  const ms = performance.now() - t;
  assert.ok(sp.spacing > 20 && sp.spacing < 60 && sp.sites > 19900, JSON.stringify(sp));
  assert.equal(ug.underground, false);
  assert.ok(g && g.origin && Number.isFinite(g.lift));
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms (about 0.23 s on the dev machine, 0.9 s before #2798; the bound catches an O(n²) slip, not jitter)`);
});
