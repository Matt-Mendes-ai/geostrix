// TASKS.csv #1769 (review #1645, Copley; regression of #1475) — the section window gets the assay legend its payload builds
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("both section launchers take assayLegend from buildSectionPayload and pass it to the window", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal(s.split("legendItems, assayLegend /* #1769 */, voxelSlices,").length - 1, 2);
  const opens = s.split("openSectionOrSay({").slice(1).map((x) => x.split("\n")[0]).filter((x) => x.includes("holes, intervals, points, planes,"));
  assert.ok(opens.length >= 2 && opens.every((x) => x.includes("planes, assayLegend,")));
});
