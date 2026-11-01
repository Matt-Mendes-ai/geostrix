// TASKS.csv #1315 geoML follows the hole list; #1316 acting on the filtered holes
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holesMatching, visibilityPatch, tickedHoles } from "../src/lib/holeFilter.js";

const ids = ["PS-26-30", "PS-21-05", "GS-21-117", "CB-18-34"];

test("#1316 the filter takes several parts, any case; empty lists every hole", () => {
  assert.deepEqual(holesMatching(ids, ""), ids);
  assert.deepEqual(holesMatching(ids, "ps-26"), ["PS-26-30"]);
  assert.deepEqual(holesMatching(ids, "ps-26, GS-21"), ["PS-26-30", "GS-21-117"]);
  assert.deepEqual(holesMatching(ids, "21"), ["PS-21-05", "GS-21-117"]);
  assert.deepEqual(holesMatching(ids, "zzz"), []);
});

test("#1316 check, uncheck and only touch what they say", () => {
  const start = { "CB-18-34": false };
  assert.deepEqual(visibilityPatch(start, ids, ["PS-26-30"], "hide"), { "CB-18-34": false, "PS-26-30": false });
  assert.equal(visibilityPatch(start, ids, ["CB-18-34"], "show")["CB-18-34"], true);
  const only = visibilityPatch(start, ids, ["GS-21-117"], "only");
  assert.deepEqual(ids.filter((id) => only[id] !== false), ["GS-21-117"]);
  assert.equal(start["PS-26-30"], undefined, "the old map is not changed");
});

test("#1315 a hole is left out only when unchecked, in every table", () => {
  const vis = { B: false };
  assert.deepEqual(tickedHoles([{ hole_id: "A" }, { hole_id: "B" }, { hole_id: "C" }], vis).map((r) => r.hole_id), ["A", "C"]);
  assert.equal(tickedHoles([{ hole_id: "A" }], undefined).length, 1);
  const p = fs.readFileSync(new URL("../src/components/PredictivePanel.jsx", import.meta.url), "utf8");
  for (const t of ["allCollars", "allSurvey", "allLitho", "allAssays"]) assert.match(p, new RegExp(`tickedHoles\\(${t}`));
  assert.match(fs.readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8"), /<PredictivePanel visibleHoles=\{visibleHoles\}/);
});
