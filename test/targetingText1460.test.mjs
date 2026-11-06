// TASKS.csv #1460 — Targeting text: 'flat at 170 m below the holes' (170 is an elevation); 'Geophysical voxel ranges' over an estimated
// Zn model, with an empty state naming only the Geophysics import. (The target-band line went through tr() in #1832.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the score sheet's height reads as an elevation", () => {
  const e = read("../src/components/EvidenceOverlayPane.jsx");
  assert.ok(e.includes("flat at elevation {z} m (below the deepest hole)") && !e.includes("flat at {z} m below the holes"));
});

test("the ranges pane is not only geophysics, and its empty state names both routes", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.ok(v.includes('tr("Voxel / block model ranges")') && !v.includes('tr("Geophysical voxel ranges")'));
  assert.ok(v.includes("estimate one from the assays (3D Modelling > Estimation) or import one (Geophysics > Block models)"));
  assert.ok(read("../src/help/pages/targeting.js").includes("estimate one from the assays (3D Modelling > Estimation)"));
});
