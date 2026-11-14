// TASKS.csv #3046 (#2974 leftovers) and #2641 — on the Surface Geology tab: a rock-chip drop comes back to the tab after the Geochem dialog,
// the tab's legend leads with the map's own groups, its first visit opens north up in Top view, rock chips draw over flat map drapes, and an
// element stored as its oxide is labelled with that unit. SYNTHETIC values.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sampleLabelText, sampleLabelItems } from "../src/lib/viewer/holeLabels.js";

const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2641 an oxide element's label carries its unit; an element's stays a bare number", () => {
  const row = { sample_id: "R1", x: 0, y: 0, z: 0, values: { Li: 1.0763, Au: 0.25 }, bdl: ["Au"] };
  const units = { Li: "% Li2O", Au: "g/t" };
  assert.equal(sampleLabelText(row, "el:Li", units), "1.08 % Li2O");
  assert.equal(sampleLabelText(row, "el:Au", units), "<0.5", "below detection, not an oxide: as before");
  assert.equal(sampleLabelText(row, "el:Li"), "1.08", "no units given: as before");
  assert.equal(sampleLabelItems([row], "el:Li", { units })[0].text, "1.08 % Li2O");
  assert.ok(rd("../src/modules/ViewerModule.jsx").includes("{ ox, oy, oz, units: surfaceElementUnits /* #2641 */ }"));
});

test("#3046 (1) a surface-sample drop on Surface Geology goes back there after the Geochem dialog", () => {
  const v = rd("../src/modules/ViewerModule.jsx"), impl = rd("../src/modules/viewer/importPipelineImpl.js"), g = rd("../src/modules/GeochemModule.jsx");
  assert.match(v, /goToModule, \/\/ TASKS\.csv #917\n\s*mode, \/\/ TASKS\.csv #3046 \(1\)/);
  assert.match(impl, /requestModuleAction\("import-assay-file", \{ files, returnTo: mode === "surface" && surfaceOnly \? "surface" : null \}\)/);
  assert.match(g, /returnToRef\.current = p\?\.returnTo \|\| null; enqueueAssayFiles\(fs\);/);
  assert.match(g, /onCancel=\{\(\) => \{ setSurfaceModal\(null\); goBackAfterSurface\(\);/);
  assert.match(g, /const back = goBackAfterSurface\(\);/);
});

test("#3046 (3)-(5) the tab's legend order, its first view, and samples over flat drapes", () => {
  const v = rd("../src/modules/ViewerModule.jsx");
  assert.match(v, /return mode === "surface" && surfFirst\.length \? \[\.\.\.surfFirst, \.\.\.groups\.filter\(\(g\) => !surfFirst\.includes\(g\)\)\] : groups;/);
  assert.match(v, /\}, \[mode \/\* #3046 \*\/, (bare \/\* #3325 \*\/, )?rasters, sampleLegendGroup,/);
  assert.match(v, /if \(mode !== "surface" \|\| surfaceTopRef\.current \|\| !camState\.current \|\| !cameraRef\.current\?\.__update\) return; surfaceTopRef\.current = true; camState\.current\.theta = 0; camState\.current\.phi = 0\.02;/);
  assert.match(v, /new PickStandIn\(proto, \{ color, transparent: true, opacity: st\.opacity,/);
  assert.match(v, /mesh\.renderOrder = 7; \/\/ TASKS\.csv #3046 \(5\)/);
});
