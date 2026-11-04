// TASKS.csv #1803 / #1804 / #1805 (review #1646, Kodiak) — a project with no collars still fits, slices and snapshots its data
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const parts = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");

test("the no-collars branch records its anchor box as the fit extent and enables Snapshot", () => {
  const i = v.indexOf("// TASKS.csv #1803 / #1804 / #1805");
  assert.ok(i > 0);
  const block = v.slice(i, i + 600);
  assert.ok(block.includes("lastTracesRef.current = [[{ x: box.min.x") && block.includes("setDataLoaded(true);"));
});

test("the 3D slice range falls back to that box; drillhole export keeps needing collars", () => {
  assert.ok(v.includes("const box = (lastTracesRef.current || []).flat();"));
  assert.ok(v.includes("exportDisabled={!collars.length}"));
  assert.ok(parts.includes("onClick={exportDisabled ? undefined : onExportHoles}"));
});
