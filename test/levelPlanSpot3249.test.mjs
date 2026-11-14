// TASKS.csv #3249 — a vertical hole puts a slab's samples of one element on one spot of the Level plan; whichever was drawn last showed.
// The rule now: the highest of them, its tooltip saying so. Synthetic points.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { highestOnSpot } from "../src/modules/viewer/levelPlanBuild.js";

const pt = (hole_id, sym, value, x, y, md) => ({ hole_id, md, x, y, color: `c${value}`, label: `${sym}: ${value}`, assay: { sym, value } });

test("one hole's samples of one element on one spot show as the highest, said in the tooltip", () => {
  const pts = [pt("V1", "Au", 0.2, 10, 10, 100), pt("V1", "Au", 3.1, 10.1, 10, 104), pt("V1", "Au", 0.9, 10, 10.2, 108), pt("V1", "Cu", 500, 10, 10, 104), pt("I2", "Au", 0.4, 50, 0, 90), pt("I2", "Au", 1.5, 52, 0, 94)];
  const out = highestOnSpot(pts);
  assert.equal(out.length, 4, "V1 Au merged; V1 Cu, and I2's two (2 m apart) kept");
  assert.equal(out[0].assay.value, 3.1);
  assert.equal(out[0].color, "c3.1");
  assert.match(out[0].label, /^Au: 3\.1 \(highest of 3 in the slab\)$/);
  assert.equal(out[1].label, "Cu: 500");
  assert.deepEqual(out.slice(2).map((p) => p.assay.value), [0.4, 1.5]);
});

test("points without an assay value (logs at a depth) pass as they are; the build uses the rule", () => {
  const log = { hole_id: "V1", md: 5, x: 10, y: 10, label: "Mag. susc.: 12", assay: null };
  assert.deepEqual(highestOnSpot([log, log]), [log, log]);
  const b = fs.readFileSync(new URL("../src/modules/viewer/levelPlanBuild.js", import.meta.url), "utf8");
  assert.match(b, /points: highestOnSpot\(planPoints\),/);
});
