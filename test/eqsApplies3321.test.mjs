// TASKS.csv #3321 (Galore Creek review: 'Grid with equivalent sources…' was offered on IP chargeability, resistivity, an electrode list and a 3D
// cloud going 445 m below sea level) — offered for magnetic and gravity surveys and an unlabelled one (with what it assumes); other methods get
// a one-line reason; the box refuses a 3D cloud.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eqsApplies, SURVEY_METHODS } from "../src/lib/geophysSurveys.js";
import { cloudShape } from "../src/lib/cloudShape.js";

test("which surveys get equivalent sources", () => {
  for (const m of ["mag", "mag_rtp", "mag_vg", "grav", "grav_fa", "grav_gzz"]) assert.equal(eqsApplies(m), "ok", m);
  for (const m of [null, undefined, "", "other"]) assert.equal(eqsApplies(m), "assume", String(m));
  for (const m of ["ip", "res", "sp", "rad_k", "em_cond", "mt_rho", "vlf_tilt"]) assert.equal(eqsApplies(m), "no", m);
  for (const m of ["euler_depth", "mt_bostick", "lidar", "em1d_cond"]) assert.equal(eqsApplies(m), "hidden", m);
  // every method has an answer
  for (const m of Object.keys(SURVEY_METHODS)) assert.ok(["ok", "assume", "no", "hidden"].includes(eqsApplies(m)), m);
});

test("an IP cloud 445 m below sea level is a 3D cloud; a draped ground survey is not", () => {
  const cloud = [], ground = [];
  for (let i = 0; i < 3000; i++) { const x = (i % 30) * 25, y = Math.floor(i / 30) % 10 * 25, k = Math.floor(i / 300); cloud.push({ x, y, z: 1277 - k * 172, value: 1 }); }
  for (let i = 0; i < 900; i++) { const x = (i % 30) * 25, y = Math.floor(i / 30) * 25; ground.push({ x, y, z: 900 + 0.05 * x, value: 1 }); }
  assert.equal(cloudShape(cloud).is3D, true);
  assert.equal(cloudShape(ground).is3D, false);
});

test("wired: the card's line and button, the box's refusal and its assumption line", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /\{eqsApplies\(meta\.method\) === "no" && <div [^>]*>\{tr\("Equivalent sources: for magnetic and gravity surveys only/);
  assert.match(g, /\{\(eqsApplies\(meta\.method\) === "ok" \|\| eqsApplies\(meta\.method\) === "assume"\)/);
  const b = readFileSync(new URL("../src/components/EqsGridBox.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(b, /const shape = useMemo\(\(\) => cloudShape\(pts\), \[pts\]\);/);
  assert.match(b, /if \(shape\?\.is3D\) return \(/);
  assert.match(b, /\{!method && <div [^>]*>\{tr\("This survey has no method: equivalent sources assume/);
});
