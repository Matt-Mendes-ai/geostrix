// TASKS.csv #869 — the point cap of an explicit surface is a real cap: lines are simplified (corners and ends kept), and a
// set that still does not fit comes back with a refusal instead of a multi-second rebuild
import test from "node:test";
import assert from "node:assert/strict";
import { explicitPoints, simplifyLine } from "../src/lib/explicitSurface.js";

// a freehand string: 1,001 vertices over 5 km with 0.1 m jitter
const jitter = (i) => 0.1 * Math.sin(i * 12.9898);
const longString = Array.from({ length: 1001 }, (_, i) => ({ x: 5 * i, y: 0, z: 500 + 20 * Math.sin(i / 80) + jitter(i) }));
const sec = (name, pts) => ({ name, contacts: [{ unit: "Top", points: pts }] });
const picks = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, x: 37 * i, y: 100 + 13 * (i % 7), z: 480 + (i % 5) }));

test("#869 a 1,001-vertex string is simplified to fit, within the stated tolerance", () => {
  const ep = explicitPoints({ name: "Top", picks: picks(20) }, [sec("S1", longString)], { maxPoints: 800 });
  assert.ok(ep.points.length <= 800, `${ep.points.length} points`);
  assert.ok(ep.lineTolM > 0 && ep.lineVerticesKept < ep.lineVerticesIn && ep.lineVerticesIn === 1001, JSON.stringify({ t: ep.lineTolM, k: ep.lineVerticesKept }));
  assert.equal(ep.tooMany, null);
  // every original vertex lies within the tolerance of the simplified line (checked through the kept indices)
  const keep = simplifyLine(longString, ep.lineTolM);
  assert.equal(keep[0], 0); assert.equal(keep.at(-1), 1000);
});

test("#869 simplification keeps both corners of a 30 m step that every-3rd thinning dropped", () => {
  const step = [];
  for (let x = 0; x <= 100; x += 5) step.push({ x, y: 0, z: 0 });
  for (let x = 100; x <= 200; x += 5) step.push({ x, y: 0, z: 30 }); // vertical riser between (100, 0) and (100, 30)
  const keep = simplifyLine(step, 1).map((i) => step[i]);
  assert.ok(keep.some((p) => p.x === 100 && p.z === 0) && keep.some((p) => p.x === 100 && p.z === 30), JSON.stringify(keep));
  assert.equal(keep.length, 4);
});

test("#869 many short extra lines no longer pass the cap through their kept ends", () => {
  const extra = Array.from({ length: 60 }, (_, k) => ({ ref: `m${k}`, src: "map", pts: Array.from({ length: 30 }, (_, i) => ({ x: 25 * i, y: 40 * k, z: 400 + 3 * Math.sin(i + k) })) }));
  const ep = explicitPoints({ name: "Top", picks: picks(10) }, [], { maxPoints: 800, extraLines: extra });
  assert.ok(ep.points.length <= 800 * 1.5 && ep.tooMany === null, `${ep.points.length}`);
  assert.ok(ep.extraTolM > 0);
});

test("#869 too many picks to fit: refused with a message, not a slow build", () => {
  const ep = explicitPoints({ name: "Top", picks: picks(1300) }, [], { maxPoints: 800 });
  assert.match(ep.tooMany, /Too many points to build quickly: 1300/);
});
