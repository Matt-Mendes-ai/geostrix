// TASKS.csv #3824 (Scottie Gold review) — small slips in the Targeting panes: pins on each fix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { padRadius, PAD_M, planChecks, drilledTraceIndex } from "../src/lib/plannedHoleChecks.js";
import { undoTooltip } from "../src/lib/undoLabels.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("(3) the same-pad distance is at least the minimum spacing", () => {
  assert.equal(padRadius(0), PAD_M); assert.equal(padRadius(null), PAD_M); assert.equal(padRadius(15.9), 15.9); assert.equal(padRadius(4), PAD_M);
  // a drilled collar 14.5 m from the planned collar: another pad at 10 m, the same pad at the 15.9 m minimum
  const drilled = drilledTraceIndex([{ hole_id: "A", x: 14.5, y: 0, z: 0, length: 100, azimuth: 0, dip: -90 }], [], "minimumCurvature"); // vertical, no survey
  const hole = { id: "p", name: "p", x: 0, y: 0, z: 0, azimuth: 0, dip: -90, length: 100 };
  const trace = (h) => Array.from({ length: 34 }, (_, i) => ({ md: i * 3, x: h.x, y: h.y, z: h.z - i * 3 }));
  const at = (padM) => { try { return planChecks([hole], drilled, [], trace, { padM })[0].samePad; } catch (e) { return e.message; } };
  assert.deepEqual(at(10), []);
  assert.deepEqual(at(padRadius(15.9)), ["A"]);
});

test("(4) the undo tooltip names the model surfaces, not the store key", () => {
  assert.match(undoTooltip("undo", { keys: ["surfaceIds"] }, ""), /takes back: model surfaces\./);
});

test("(1) (2) (5) (6) (7) (8) (9) (10) (11) wiring", () => {
  const p = read("../src/components/PlannedHoleParts.jsx");
  assert.match(p, /limit=\{wrapAz\}/); assert.match(p, /limit=\{limitDip\}/);
  assert.match(p, /azimuth: wrapAz\(azRef === "grid"/);
  assert.doesNotMatch(p, /-target`/, "a pad hole is named from the series, not 'X-target'");
  assert.match(p, /setTypedMin\(null\)/);
  assert.match(p, /Are the azimuths in \{f\} measured from \{ref\}/);
  const e = read("../src/components/EvidenceOverlayPane.jsx");
  assert.match(e, /Reads the Level \(\{band\}\), not the whole column\./);
  assert.match(e, /\(the holes where \{pick\}\)/);
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /model\.visible === false \? tr\("Hidden: /);
  assert.match(read("../src/modules/ViewerModule.jsx"), /if \(!pickHoleMode\) identify\.handleViewClick\(e\)/);
  assert.match(read("../src/components/EndInOreList.jsx"), /uLabel = gradeUnitLabel\(symbol, u\)/);
  for (const l of ["es", "pt", "fr", "ar"]) for (const k of ["model surfaces", "Use the suggested {m} m", "Azimuths read as grid north."]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))[k], `${l} ${k}`);
});
