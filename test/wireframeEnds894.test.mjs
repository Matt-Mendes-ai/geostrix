// TASKS.csv #894 — how a linked solid ends beyond its first and last outline
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkOutlines } from "../src/lib/wireframe.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";

const rect = (y, w, h) => ({ section: `N${y}`, ax: 0, ay: y, bx: 1000, by: y, points: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, z]) => ({ x: 500 + x, y, z: 100 + z })) });
const pair = () => [rect(0, 100, 20), rect(50, 100, 20)];
const close = (v, want) => Math.abs(v - want) / want < 0.005; // the resampling cuts corners a little (#570)

test("#894 flat (as before), extended by half a spacing each end, pinched out to a point half a spacing beyond", () => {
  const flat = linkOutlines(pair(), { n: 64 }), ext = linkOutlines(pair(), { n: 64, ends: "extend" }), pin = linkOutlines(pair(), { n: 64, ends: "pinch" });
  assert.ok(close(flat.volume, 100000), `${flat.volume}`);
  assert.ok(close(ext.volume, 200000), `${ext.volume}`); // 50 m + 25 m each end
  assert.ok(close(pin.volume, 100000 + 2 * (2000 * 25) / 3), `${pin.volume}`); // + two cones of base 2000 m2, height 25 m
  for (const w of [flat, ext, pin]) assert.ok(isValidSolid(validateSolid(w.positions, w.indices)), "a closed, consistently wound solid");
  assert.equal(ext.sections, 2, "two outlines linked, whatever the ends");
});

import { linkPlanOutlines } from "../src/lib/wireframe.js";
test("#894 level-plan outlines link into a flat-lying solid: right volume, right place, outward", () => {
  // a 100 x 60 m lens outlined on plans at RL 900 and 940 (40 m apart), centred at (1000, 2000)
  const plan = (rl) => ({ name: "Lens", rl, points: [[-50, -30], [50, -30], [50, 30], [-50, 30]].map(([x, y]) => ({ x: 1000 + x, y: 2000 + y })) });
  const w = linkPlanOutlines([plan(940), plan(900)], { n: 64 });
  assert.ok(Math.abs(w.volume - 100 * 60 * 40) / (100 * 60 * 40) < 0.005, `${w.volume}`);
  let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k < w.positions.length; k += 3) { ymin = Math.min(ymin, w.positions[k + 1]); ymax = Math.max(ymax, w.positions[k + 1]); zmin = Math.min(zmin, w.positions[k + 2]); zmax = Math.max(zmax, w.positions[k + 2]); }
  assert.ok(Math.abs(zmin - 900) < 1e-6 && Math.abs(zmax - 940) < 1e-6 && Math.abs(ymin - 1970) < 0.5 && Math.abs(ymax - 2030) < 0.5, JSON.stringify({ zmin, zmax, ymin, ymax }));
  // outward: the signed volume about any point is positive
  let v6 = 0; const P = w.positions, o = [P[0], P[1], P[2]];
  for (let t = 0; t < w.indices.length; t += 3) { const [a, b, c] = [w.indices[t], w.indices[t + 1], w.indices[t + 2]].map((i) => [P[3 * i] - o[0], P[3 * i + 1] - o[1], P[3 * i + 2] - o[2]]); v6 += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
  assert.ok(v6 > 0);
  assert.ok(isValidSolid(validateSolid(w.positions, w.indices)));
  assert.equal(w.sections, 2);
});
