// TASKS.csv #1972 — 3D Modelling pane texts match today's tools: the domain picker applies to every modelling tool, the search
// ellipsoid has its own orientation, grade estimation lists all four methods, veins go to the Vein / dyke tool, the geology map
// lives under Surface Geology, and the icon-only Alteration / Vein run buttons have an accessible name
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#1972 no stale modelling text", () => {
  const panes = read("modules/viewer/ModellingPanes.jsx"), runs = read("modules/viewer/modellingRuns.js");
  const sg = read("components/SurfaceGeologyProjection.jsx"), help = read("help/pages/modelling.js");
  assert.doesNotMatch(panes, /Applies to all four tools/);
  assert.doesNotMatch(panes, /oriented along the structural trend below/);
  assert.match(panes, /oriented by its own Azimuth and Dip here/);
  assert.doesNotMatch(panes, /nearest-neighbour or inverse- distance/);
  assert.match(panes, /moving least squares or ordinary kriging/);
  assert.doesNotMatch(panes, /with the Structural tool instead, not here/);
  assert.doesNotMatch(runs + help, /along the declared trend/);
  assert.doesNotMatch(sg, /Maps → Map layers/);
  assert.match(sg, /Surface Geology > Geology map/);
});

test("#1972 icon-only run buttons carry an aria-label", () => {
  const panes = read("modules/viewer/ModellingPanes.jsx");
  assert.match(panes, /aria-label=\{tr\("Build a closed alteration-halo envelope/);
  assert.match(panes, /aria-label=\{tr\("Build paired hangingwall\/footwall surfaces/);
});

test("#1972 translations follow the renamed strings", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    const keys = Object.keys(d);
    assert.ok(!keys.some((k) => /along the declared trend|Applies to all four tools|Maps → Map layers\)/.test(k)), lang);
    assert.ok(keys.some((k) => /inside the ellipsoid\.$/.test(k)), lang);
  }
});
