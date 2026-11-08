// TASKS.csv #1548 — the Structures run's pick check called downhole Vn1a picks 'drawn contact at 609454 E 6356322 N'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickReport } from "../src/lib/pickDiagnostics.js";

test("picks carrying hole and depth are named by them in the check", () => {
  const p = { x: 0, y: 0, z: 0, hole_id: "22CCDD011", depth: 154.3 };
  const r = pickReport({ label: "Structure: Vn1a", points: [p, { ...p, depth: 154.4 }], orientations: [] }, { origin: { x: 609454, y: 6356322, z: 0 } });
  assert.ok(r && r.close >= 1); // #2048 — 0.1 m apart down the hole: close picks, not a repeated row
  assert.match(r.closeExamples[0], /22CCDD011 at 154\.3 \/ 154\.4 m/);
  assert.ok(!/drawn contact/.test(r.closeExamples[0]));
});

test("runStructuralModel carries them, as the stack faults do", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  const i = s.indexOf("const runStructuralModel = ");
  assert.match(s.slice(i, i + 6000), /if \(p\) points\.push\(\{ \.\.\.sceneToApi\(p\), hole_id: s\.hole_id, depth: s\.depth \}\);/);
});
