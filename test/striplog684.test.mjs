// TASKS.csv #684 — the exported strip log gets a mineralisation track when the project has a mineralisation log
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

const collars = [{ hole_id: "H1", x: 0, y: 0, z: 0, depth: 100 }];

test("mineralisation intervals add a Min. track", () => {
  const { svg } = buildStripLogSvgMarkup({ holeId: "H1", collars, layers: { litho: [{ hole_id: "H1", from: 0, to: 100, value: "GRN" }], mnlgy: [{ hole_id: "H1", from: 10, to: 79, value: "PY" }, { hole_id: "H2", from: 0, to: 5, value: "CP" }] } });
  assert.match(svg, />Min\.</);
});

test("no mineralisation log, no Min. track", () => {
  const { svg } = buildStripLogSvgMarkup({ holeId: "H1", collars, layers: { litho: [{ hole_id: "H1", from: 0, to: 100, value: "GRN" }] } });
  assert.doesNotMatch(svg, />Min\.</);
});
