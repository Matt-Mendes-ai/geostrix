// TASKS.csv #3279 (Galore review) — a Desurvey switch stalled the window 0.55-0.99 s on 70 holes: every curved interval of a moved hole was
// a CatmullRomCurve3 + TubeGeometry + material of its own. Now straight pieces on the shared prototype (batched), overlapping at inner joints.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("no tube per curved interval: pieces on the shared prototype, the inner joints overlapped, the ends on the interval's depths", () => {
  assert.doesNotMatch(s, /new THREE\.TubeGeometry/);
  assert.doesNotMatch(s, /new THREE\.CatmullRomCurve3/);
  assert.match(s, /const pts = \[p1, \.\.\.mid, p2\], last = pts\.length - 2, ext = radius \* 0\.5;/);
  assert.match(s, /const e0 = i > 0 \? ext : 0, e1 = i < last \? ext : 0,/);
  assert.match(s, /const m = new PickStandIn\(INTERVAL_PROTO\[st\.shape\], \{ color, transparent: st\.opacity < 1, opacity: st\.opacity \}\);/);
  assert.match(s, /for \(const mesh of pieces \|\| \[mesh_\]\) \{\n\s+mesh\.userData = lazyTip\(/, "every piece carries the row's tooltip, hole and category");
});

// the same placement as the build, on a bent interval: the pieces' ends meet the trace points, extended only at inner joints
test("the pieces' geometry on a bend", () => {
  const radius = 2, ext = radius * 0.5, pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: -10, z: 0 }, { x: 3, y: -19.5, z: 0 }], last = pts.length - 2;
  const placed = [];
  for (let i = 0; i <= last; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const e0 = i > 0 ? ext : 0, e1 = i < last ? ext : 0;
    placed.push({ start: [a.x - ux * e0, a.y - uy * e0], end: [a.x - ux * e0 + ux * (len + e0 + e1), a.y - uy * e0 + uy * (len + e0 + e1)] });
  }
  assert.deepEqual(placed[0].start, [0, 0], "starts at the interval's own top");
  const end = placed[1].end;
  assert.ok(Math.abs(end[0] - 3) < 1e-9 && Math.abs(end[1] + 19.5) < 1e-9, "ends at the interval's own bottom");
  assert.ok(placed[0].end[1] < -10 && placed[1].start[1] > -10, "the two pieces overlap at the bend");
});
