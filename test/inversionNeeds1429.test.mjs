// TASKS.csv #1429 (review #1352, Silvertip) — the inversion pane lists what an inversion needs up front (survey, terrain), with a button to
// Maps › Terrain (which can make a terrain from the project's samples and collars) when the terrain is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wired: the checklist, the button, the Maps action", () => {
  const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('aria-label={tr("What an inversion needs")}'));
  assert.ok(p.includes('onClick={() => { goToModule("maps"); requestModuleAction("maps-terrain"); }}'));
  assert.ok(readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8").includes('useModuleAction(["maps-terrain"], () => setPane("terrain"));'));
});
