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
