// TASKS.csv #2617 (re-test of #2528) — the trend notice compares the box with the one a no-trend run really gets, in Mm³ under 1 km³
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noTrendBoxVolume, reachPad, verticalPad } from "../src/lib/contactReach.js";

test("the no-trend box: reachPad across, verticalPad on the drilled column", () => {
  const pts = [{ x: 0, y: 0, z: 100 }, { x: 400, y: 300, z: 90 }]; // contacts 400 x 300 m, 10 m of relief
  const column = { min: 22, max: 271 }, cap = 500;
  const v = noTrendBoxVolume(pts, { column, reachM: 122, capM: cap });
  const longest = 400, px = reachPad(400, longest, 122, cap), py = reachPad(300, longest, 122, cap), vp = verticalPad(10, 249, cap);
  const want = (400 + 2 * px) * (300 + 2 * py) * (271 - 22 + 2 * vp);
  assert.ok(Math.abs(v - want) < 1e-6, `${v} vs ${want}`);
  assert.ok(v > 1e6 && v < 1e9); // Mm³, not '0.0 km³'
  assert.equal(noTrendBoxVolume([], { capM: cap }), 0);
});

test("the notice prints both with fmtVol and says which is larger", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /reachLib\.noTrendBoxVolume\(extentApiPts, \{ column: colHit/);
  assert.match(m, /notice\(volT >= volNT \? "With a trend the model box is about \{a\}, larger than the \{b\} the same data get without one/);
  assert.match(m, /\{ a: fmtVol\(volT\), b: fmtVol\(volNT\) \}/);
});
