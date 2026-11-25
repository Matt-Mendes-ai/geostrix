// TASKS.csv #2054 (review #2013, Woodjam) — the Setup group's 'Correlation' tool opened a pane holding only a 'Fence / panel diagram…' launcher
// and a surface-geology note; the hole-to-hole correlation itself (connect, auto-number, sheet correlation) lived in Modelling codes. The
// pane now shows those tools beside the fence launcher (ModellingCodesPane focus "correlate"), from the same state as Modelling codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

const pane = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
const panes = modellingPanesSource();

test("the Correlation pane shows the correlation tools beside the fence launcher", () => {
  const i = panes.indexOf('{toolPane === "correlation" && (<>'), j = panes.indexOf("{toolPane === ", i + 10);
  const body = panes.slice(i, j);
  assert.ok(body.includes('tr("Fence / panel diagram…")'));
  assert.ok(body.includes('{mcodesPane("correlate")}'), "the correlation tools");
  assert.match(panes, /\{toolPane === "mcodes" && \(<>[\s\S]{0,600}\{mcodesPane\(null\)\}/, "Modelling codes keeps the whole pane"); // 600: #3606's no-lithology line under the header
  assert.match(panes, /const mcodesPane = \(focus\) => <ModellingCodesPane focus=\{focus\} inArea=/, "one element, one state, for both");
});

test("focus 'correlate' leaves out the codes list and closed bodies, and keeps pick / connect, auto-number and sheets", () => {
  assert.match(pane, /export default function ModellingCodesPane\(\{ focus = null, /);
  // TASKS.csv #4070 — the sections are built once (pickSection, numberSection with the sheets, footer); Modelling codes shows them as steps with the codes
  // list and the closed body, the correlate focus returns early with only the hole-to-hole ones
  const at = pane.indexOf('if (focus === "correlate") return (');
  assert.ok(at > 0);
  const correlate = pane.slice(at, pane.indexOf("const hasBody", at));
  for (const kept of ["{pickSection}", "{numberSection}", "{footer}", 'tr("Pick intervals in the 3D view")', 'tr("Auto-number alternations (optional)")', 'tr("Hole-to-hole correlation: connect intervals of one unit']) assert.ok(correlate.includes(kept), kept);
  for (const left of ["Codes and roles", "onBuildBody", "codes.map((c, i)"]) assert.ok(!correlate.includes(left), `${left} stays out of the Correlation pane`);
  const numberSection = pane.slice(pane.indexOf("const numberSection = ("), pane.indexOf("const footer = ("));
  assert.ok(numberSection.includes('tr("Correlate sheets between holes (optional)")'), "the sheets go with auto-number");
  assert.match(pane, /\.\.\.\(hasBody \? \[\{ key: "body"/, "the closed body: Modelling codes only, when it can be built");
});
