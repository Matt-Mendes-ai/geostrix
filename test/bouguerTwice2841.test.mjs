// TASKS.csv #2841 — the gravity reductions do not take the plate off a survey labelled a Bouguer anomaly without an explicit choice
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { alreadyBouguer } from "../src/lib/gravityReduction.js";

test("a survey labelled Bouguer with anomaly values is already reduced; observed gravity or a free-air survey is not", () => {
  assert.equal(alreadyBouguer("grav", -48.2), true); // Blake River BOUGUER
  assert.equal(alreadyBouguer("grav", 980800), false); // observed gravity mislabelled 'Bouguer': still reduced
  assert.equal(alreadyBouguer("grav_fa", -30.3), false);
  assert.equal(alreadyBouguer(null, -30.3), false);
});

test("the box blocks Reduce behind a tick when the plate would come off twice", () => {
  const src = fs.readFileSync(new URL("../src/components/GravityReductionBox.jsx", import.meta.url), "utf8");
  assert.match(src, /const twice = alreadyBouguer\(method, median\) && input === "freeair" && correction !== "none";/);
  assert.match(src, /if \(twice && !anyway\) return;/);
  assert.match(src, /disabled=\{twice && !anyway\}/);
  const geo = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(geo, /<GravityReductionBox survey=\{sv\.key\} method=\{meta\.method \|\| null\}/);
});
