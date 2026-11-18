// TASKS.csv #3700 (3D Modelling items 1, 2, 6, 7; Fireweed rehearsal round 3, Macpass)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voxelLegendGroups } from "../src/lib/legendGroups.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("(1) the shell is named for what Automatic made of it (tight / envelope / both), not 'automatic, p 0.5'", () => {
  const m = read("modules/viewer/modellingRuns.js");
  assert.match(m, /const shellName = \(tags\) => `\$\{symbol\} > /);
  assert.match(m, /const taskLabel = shellName\(shellTags\);/);
  assert.match(m, /i === 0 && envelopeMode && shellPref === "auto" \? \(anyEnv \? \(envBox\.every\(Boolean\) \? `envelope p \$\{envIso\}` : `envelope and tight, p \$\{envIso\}`\) : "tight"\)/);
});

test("(2) a density estimate speaks of value, not grade or metal", () => {
  const e = read("components/GradeEstimationModal.jsx");
  assert.match(e, /the value was carried across unsampled core, which is unknown here \(Unsampled metres inside a sampled hole decides how it is read\)/);
  assert.match(e, /the value was carried across unsampled chips/);
  assert.match(e, /tr\(nonMetal \? "\{k\} of the \{n\} highest composites[^"]*puts the value away from where it was measured/);
});

test("(6) the model's legend carries the layer's unit (t/m³ for the density)", () => {
  const stops = [{ value: 2.47, color: "#000" }, { value: 4.36, color: "#fff" }];
  const g = voxelLegendGroups([{ id: 1, name: "Specific gravity estimate (idw2, 10m, r60m)", min: 2.47, max: 4.36, colorMode: "continuous", stops, params: { element: "Specific gravity", unit: "t/m³" } }]);
  assert.match(g[0].label, /\(t\/m³\)$/);
});

test("(7) 'not known: left out' follows the user to the tool's next element", () => {
  const u = read("components/UnsampledChoice.jsx");
  assert.match(read("lib/unsampledChoices.js") /* #3920: moved */, /if \(patch\.mode !== undefined\) \{ if \(patch\.mode === "unknown"\) lastUnknown\.set\(tool, true\); else lastUnknown\.delete\(tool\); \}/);
  assert.match(u, /saved\?\.mode \?\? \(lastUnknown\.get\(tool\) \? "unknown" : defaultUnsampledMode\(inf\.share\)\)/);
});
