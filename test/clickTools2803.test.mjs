// TASKS.csv #2803 — the 3D view's click tools (section, Measure, planned-hole pick, interpretation lines, modelling-code and
// explicit-surface picks) cast from the press's own position, as Identify does since #2796, not the click's whole pixels
import test from "node:test";
import assert from "node:assert/strict";
import { viewNdc, clickPoint } from "../src/lib/viewer/clickPoint.js";
import { clickPoint as fromIdentify } from "../src/lib/viewer/identify.js";
import { viewerSource } from "./helpers/viewerSource.mjs";

const rect = { left: 306, top: 151, width: 1614, height: 806 };

test("the press's fractional point gives the ray; another press, the click's own", () => {
  const p = viewNdc({ clientX: 1206, clientY: 553 }, rect, { x: 1206.4417, y: 553.5264 });
  assert.ok(Math.abs(p.x - (((1206.4417 - 306) / 1614) * 2 - 1)) < 1e-12);
  assert.ok(Math.abs(p.y - (-((553.5264 - 151) / 806) * 2 + 1)) < 1e-12);
  const q = viewNdc({ clientX: 1206, clientY: 553 }, rect, { x: 1190, y: 553 });
  assert.ok(Math.abs(q.x - (((1206 - 306) / 1614) * 2 - 1)) < 1e-12);
  assert.deepEqual(viewNdc({ clientX: 306, clientY: 151 }, rect, null), { x: -1, y: 1 });
  assert.equal(fromIdentify, clickPoint, "Identify uses the same rule");
});

test("every click tool of the 3D view builds its ray with viewNdc and the recorded press", () => {
  const v = viewerSource();
  const start = v.indexOf("const onSectionClick = useCallback((e) => {"), end = v.indexOf("// the picks of every explicit surface");
  const region = v.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(!region.includes("((e.clientX - rect.left) / rect.width)"), "no whole-pixel ray left");
  assert.equal(region.split("viewNdc(e, rect, mcDownRef.current)").length - 1, 6);
});
