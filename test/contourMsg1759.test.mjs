// TASKS.csv #1759 (review #1645, Copley) — Generate contours reports in the Terrain pane, not the Point survey pane's message box
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the contour button writes contourMsg, rendered beside the contour controls", () => {
  const s = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  const i = s.indexOf("contourTerrain(terrain, { interval: contourInterval })"), j = s.indexOf("setContourOpen(false);", i);
  const block = s.slice(i, j);
  assert.ok(!block.includes("setError("), "no longer the shared error box");
  assert.equal(block.split("setContourMsg(").length - 1, 2);
  assert.ok(s.includes("{contourMsg && ( /* #1759 */"));
});
