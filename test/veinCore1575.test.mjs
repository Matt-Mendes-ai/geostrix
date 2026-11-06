// TASKS.csv #1575 (review #1497, Lawyers) — a well-defined oriented-core attitude that contradicts the plane fitted to the
// intercept midpoints by more than 30° wins: the walls are built on it and the notice says so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { poleAngleDeg, coreAttitudeWins, CORE_WINS_ANGLE, CORE_WINS_ALPHA95 } from "../src/lib/veinOrientations.js";

test("the angle between two attitudes' poles", () => {
  assert.ok(Math.abs(poleAngleDeg(1.7, 255.5, 81, 228) - 80) < 2);
  assert.ok(poleAngleDeg(60, 90, 60, 90) < 1e-9);
  assert.ok(Math.abs(poleAngleDeg(60, 90, 60, 270) - 60) < 1e-9); // the same strike, opposite dips: 2 x (90 - 60)
  assert.ok(Math.abs(poleAngleDeg(0, 0, 90, 0) - 90) < 1e-9);
});

test("the core wins only with a well-defined mean and a real disagreement", () => {
  const fitted = { dip: 1.7, dipDir: 255.5 };
  const vn1a = { n: 109, meanDip: 81, meanDipDir: 228, k: 3.1, alpha95: 9 };
  const w = coreAttitudeWins(fitted, vn1a);
  assert.ok(w && w.angle > 70 && w.dip === 81 && w.dipDir === 228 && w.n === 109);
  assert.equal(coreAttitudeWins(fitted, { ...vn1a, alpha95: 20 }), null, "a loose mean (α95 20°) does not overrule the fit");
  assert.equal(coreAttitudeWins(fitted, { ...vn1a, n: 2 }), null, "two measurements are not a mean");
  assert.equal(coreAttitudeWins(fitted, { ...vn1a, noPreferred: true }), null);
  assert.equal(coreAttitudeWins({ dip: 75, dipDir: 230 }, vn1a), null, "within 30°: the fit stands");
  assert.equal(coreAttitudeWins(null, vn1a), null);
  assert.equal(coreAttitudeWins(fitted, null), null);
  assert.deepEqual([CORE_WINS_ANGLE, CORE_WINS_ALPHA95], [30, 15]);
});

test("the vein run rebuilds on the core attitude and says so; the pane no longer promises three surfaces", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const coreWins = !typed && model\.plane\?\.attitudeSource === "fitted to intercept midpoints" \? coreAttitudeWins\(fitted0, logged\) : null;/);
  assert.match(r, /if \(coreWins\) model = buildVeinModel\(used, \{ cellSize: [^}]*dip: coreWins\.dip, dipDir: coreWins\.dipDir \}\);/);
  assert.match(r, /built on the oriented-core attitude \{dip\}° \/ \{dipDir\}°/);
  assert.match(r, /restrict the tool under Model settings › Domain\./);
  assert.match(r, /if \(logged\?\.n && !coreWins\) \{/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(p, /Adds three surfaces/);
  assert.match(p, /Adds a hangingwall and a footwall, and a closed solid for volume when the two do not cross\./);
});
