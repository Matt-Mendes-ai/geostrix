// TASKS.csv #2389 (review #2325, WA uranium) — the ribbon's Stereonet on a project with no structure picks and no outcrop
// measurements opened an empty net beside 'Mean orientation needs at least 2 picks'. It now says where each kind of data comes from
// (as the Structures pane and the Downhole plot do) and drops the mean line; Export SVG stays disabled (#1721).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");

test("no data from either source: the net says where it comes from", () => {
  assert.match(src, /const noData = !downholePicks\.length && !surfacePicks\.length;/);
  assert.match(src, /noData \? tr\("No structure picks or outcrop measurements yet"\)/);
  assert.match(src, /\{noData && <text x=\{CX\} y=\{CY \+ 12\}>\{tr\("Downhole: 3D View › Add layer › Structure planes\."\)\}/);
  assert.match(src, /\{noData && <text x=\{CX\} y=\{CY \+ 28\}>\{tr\("Outcrop: Surface Geology › Surface structures\."\)\}/);
});

test("no mean-orientation line when there is nothing at all, Export still disabled", () => {
  assert.match(src, /\) : noData \? null \/\* #2389 \*\/ : \(\s*<div[^>]*>\{tr\("Mean orientation needs at least 2 picks/);
  assert.match(src, /disabled=\{view === "rose" \? !rose : plotted === 0\}/);
});

test("the names it points at are the app's own", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /label: "3D View"/);
  assert.match(app, /label: "Surface Geology"/);
  const surf = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(surf, /tr\("Surface structures"\)/);
});
