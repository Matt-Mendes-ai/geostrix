// TASKS.csv #1718 — Model from map says the drillholes are not used, and where they are
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the note shows with holes, in the empty state too, and points to a tool that does use map contacts", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // CRLF on the CI checkout
  assert.match(p, /holeCount = 0 \}\)/);
  assert.match(p, /const holesNote = holeCount > 0 \?/);
  assert.match(p, /if \(!polys\.length\) return <>\{holesNote\}/);
  assert.match(p, /\{holesNote\}\n/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // CRLF on the CI checkout
  assert.match(m, /<MapModelPanel [^\n]*holeCount=\{collars\.length\}/);
  // the tool named really adds map contacts to hole picks
  const e = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // CRLF on the CI checkout
  assert.match(e, /mapContactLines\(layer/);
  assert.match(e, /tr\("From the geological map"\)/);
});
