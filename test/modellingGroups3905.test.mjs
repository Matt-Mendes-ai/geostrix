// TASKS.csv #3905 (redesign P3) — the 3D Modelling ribbon grouped by what is built, in plain words; the engine is named in the panes.
// The buttons, their order inside the old groups, handlers and Simple / Advanced flags are unchanged (#2390, #3153 pin those).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3905 the groups, in order, and the buttons in each", () => {
  const r = read("../src/modules/viewer/ModeRibbons.jsx");
  const m = r.slice(r.indexOf('label="3D Modelling tools"'), r.indexOf('label="Mine design tools"'));
  const groups = [...m.matchAll(/<RibbonGroup [^>]*label="([^"]+)">([\s\S]*?)<\/RibbonGroup>/g)].map((g) => [g[1], [...g[2].matchAll(/<RibbonButton [^\n]*?label="([^"]+)"/g)].map((b) => b[1])]);
  assert.deepEqual(groups, [
    ["Setup", ["Model settings", "Litho groups", "Modelling codes", "Correlation"]],
    ["Surfaces", ["Implicit surface", "Strat. stack", "Model from map", "Explicit surface"]],
    ["Volumes", ["Alteration", "geoML models"]],
    ["Veins and dykes", ["Veins / dykes"]],
    ["Faults and structure", ["Faults", "Structures", "Stereonet", "Downhole plot", "Core orient."]], // Faults: #4006
    ["Grade", ["Grade shell", "Estimation", "Variogram"]],
    ["Check", ["Fence diagram", "Surface query"]],
  ]);
  assert.doesNotMatch(m, /label="(GemPy modelling|Explicit modelling|geoML modelling|Alteration & veins|Structure)"/, "no engine names on the ribbon");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Surfaces", "Volumes", "Veins and dykes", "Faults and structure"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
