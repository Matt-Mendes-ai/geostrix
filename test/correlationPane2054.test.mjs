// TASKS.csv #2054 (review #2013, Woodjam) — the Setup group's 'Correlation' tool opened a pane holding only a 'Fence / panel diagram…' launcher
// and a surface-geology note; the hole-to-hole correlation itself (connect, auto-number, sheet correlation) lived in Modelling codes. The
// pane now shows those tools beside the fence launcher (ModellingCodesPane focus "correlate"), from the same state as Modelling codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pane = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");

test("the Correlation pane shows the correlation tools beside the fence launcher", () => {
  const i = panes.indexOf('{toolPane === "correlation" && (<>'), j = panes.indexOf("{toolPane === ", i + 10);
  const body = panes.slice(i, j);
  assert.ok(body.includes('tr("Fence / panel diagram…")'));
  assert.ok(body.includes('{mcodesPane("correlate")}'), "the correlation tools");
  assert.match(panes, /\{toolPane === "mcodes" && \(<>[\s\S]{0,200}\{mcodesPane\(null\)\}/, "Modelling codes keeps the whole pane");
  assert.match(panes, /const mcodesPane = \(focus\) => <ModellingCodesPane focus=\{focus\} inArea=/, "one element, one state, for both");
});

test("focus 'correlate' leaves out the codes list and closed bodies, and keeps pick / connect, auto-number and sheets", () => {
  assert.match(pane, /export default function ModellingCodesPane\(\{ focus = null, /);
  assert.match(pane, /\{focus !== "correlate" && onBuildBody && unitBody && \(<>/);
  assert.match(pane, /\{focus !== "correlate" && \(<>\{\/\* #2054 \*\/\}\r?\n\s*<div className="ge-section-label" style=\{\{ marginTop: 12 \}\}>\{tr\("Codes \(youngest at the top\)"\)\}/);
  for (const kept of ["Pick intervals in the 3D view", "Auto-number alternations (optional)", "Correlate sheets between holes (optional)"]) {
    const at = pane.indexOf(`tr("${kept}")`);
    assert.ok(at > 0, kept);
    const before = pane.slice(0, at);
    const opened = (before.match(/focus !== "correlate" && /g) || []).length, closedCodes = before.includes("Codes (youngest at the top)") ? 1 : 0, closedBody = before.includes("Closed body of a unit") ? 1 : 0;
    assert.equal(opened, closedCodes + closedBody, `${kept} is outside the hidden sections`);
  }
  assert.ok(pane.includes('focus === "correlate" ? <div style={{ ...small, marginBottom: 8 }}>{tr("Hole-to-hole correlation: pick an interval and connect it to the same unit in the next hole'));
});
