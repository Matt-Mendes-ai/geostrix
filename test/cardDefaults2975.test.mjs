// TASKS.csv #2975 (review #2876, WA iron) — grade cards opened on a log ramp between 35.4 and 64.9 % Fe, and 'depth to the top of' a logged
// code 'favourable when high' (thicker cover scored better). A log ramp only where the ends span a factor of 5; depth-to-top favourable when low.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeEndsFromSamples, defaultEvidenceEnds, rampIsLog, LOG_SPAN } from "../src/lib/evidenceEnds.js";

test("the log ramp only over a factor of 5", () => {
  assert.equal(LOG_SPAN, 5);
  assert.equal(rampIsLog(35.4, 64.9), false, "per cent Fe");
  assert.equal(rampIsLog(25.6, 80.7), false, "per cent SiO2");
  assert.equal(rampIsLog(0.05, 1.2), true, "g/t Au");
  assert.equal(rampIsLog(0, 10), false);
  // an iron assay set: 40-65 % Fe, linear
  const fe = Array.from({ length: 200 }, (_, i) => ({ from: i, to: i + 1, Fe: 40 + (i % 26) }));
  const e = gradeEndsFromSamples(fe, (r) => r.Fe);
  assert.equal(e.log, false);
  // a trace metal: 1-1000 ppm, log
  const cu = Array.from({ length: 200 }, (_, i) => ({ from: i, to: i + 1, Cu: Math.round(10 ** (3 * i / 199)) }));
  assert.equal(gradeEndsFromSamples(cu, (r) => r.Cu).log, true);
  assert.equal(defaultEvidenceEnds("grade", Array.from({ length: 50 }, (_, i) => 40 + i / 2)).log, false);
});

test("the pane: the card takes the ends' log; depth to the top starts favourable when low", () => {
  const p = fs.readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('&& rampIsLog(low, high);'));
  assert.ok(p.includes("log = ge.log /* #2975"));
  assert.ok(p.includes('const topDepth = src.kind === "numeric" && parseCodedRef(src.ref)?.how === "top";'));
  assert.ok(p.includes('shape: dec || topDepth ? "decreasing" : "increasing"'));
});
