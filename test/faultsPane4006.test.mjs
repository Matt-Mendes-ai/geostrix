// TASKS.csv #4006 — one Faults button and pane that gathers every fault tool (a user could not find the fault tool: they were spread over the
// app). The evidence counts with made-up data; every tool's row opens where it lives; the pane is a lazy chunk; a Help search for a fault
// lands on the Faults page first.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { faultInventory, isFaultCode, mappedFaultFeatures, drawnFaultLines } from "../src/lib/faultInventory.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files
const { searchPages, pageById } = await import("../src/help/content.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4006 fault evidence counted by kind, with made-up data", () => {
  const inv = faultInventory({
    faultCandidates: [{ key: "FLT|", type: "FLT", n: 7, faultLike: true }, { key: "Shear|S1", type: "Shear", n: 3, faultLike: true }, { key: "Vein|", type: "Vein", n: 40, faultLike: false }],
    layers: {
      litho: [{ hole_id: "DH-1", from: 1, to: 2, value: "FLT" }, { hole_id: "DH-1", from: 2, to: 9, value: "BAS" }, { hole_id: "DH-2", from: 3, to: 4, value: "Gouge" }],
      structzone: [{ hole_id: "DH-1", from: 5, to: 6, value: "FZ" }, { hole_id: "DH-2", from: 6, to: 7, value: "BX" }],
      structure: [{ hole_id: "DH-1", depth: 5, value: "FLT", dip: 60, azimuth: 90 }], // picks are counted from the candidates, not twice
    },
    surfaceStructures: [{ rows: [{ cls: "fault" }, { cls: "bedding" }, { cls: "fault" }] }],
    mapLayers: [
      { id: "geo", features: [{ parts: [[[0, 0], [1, 1]]], attributes: { TYPE: "Normal fault" } }, { parts: [[[0, 0], [1, 1]]], attributes: { TYPE: "contact" } }] },
      { id: "int", interpretation: true, features: [{ parts: [[[0, 0, 150], [1, 1, 150]]], attributes: { type: "fault", level_rl: 150 } }, { parts: [[[0, 0]]], attributes: { type: "vein" } }] },
    ],
    sections: [{ contacts: [{ kind: "fault", points: [] }, { kind: "contact", points: [] }] }, { contacts: [{ kind: "fault", points: [] }] }],
    implicitSurfaces: [{ type: "fault" }, { type: "surface" }],
    stackFaults: ["FLT|"],
  });
  assert.deepEqual(inv, { picks: 10, pickTypes: 2, outcrop: 2, logged: 3, mapped: 1, drawn: 1, sectionStrings: 2, surfaces: 1, inStack: 1 });
  for (const c of ["FLT", "fz", "Fault breccia", "shear zone", "GOUGE", "SZ", "mylonite"]) assert.ok(isFaultCode(c), c);
  for (const c of ["BX", "Breccia", "BAS", "", null, "Vein"]) assert.ok(!isFaultCode(c), String(c)); // a breccia alone is not a fault
  assert.equal(mappedFaultFeatures([{ interpretation: true, features: [{ parts: [[]], attributes: { type: "fault" } }] }]).length, 0, "drawn lines are counted on their own");
  assert.equal(drawnFaultLines([{ interpretation: true, features: [{ attributes: { type: "Shear" } }] }]).length, 1);
  assert.deepEqual(faultInventory(), { picks: 0, pickTypes: 0, outcrop: 0, logged: 0, mapped: 0, drawn: 0, sectionStrings: 0, surfaces: 0, inStack: 0 });
});

test("#4006 / #4070 the pane: the builder as steps; the tools the ribbon has are named, the two it has not are buttons; every fault tool is still reachable", () => {
  const p = read("../src/modules/viewer/FaultsPanel.jsx");
  const ids = [...p.matchAll(/\{ id: "([a-z]+)", name:/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["guided", "interpret"], "the rows the ribbon has not");
  assert.match(p, /requestModuleAction\("guided-open", \{ tool: "faults" \}\)/);
  assert.match(p, /requestModuleAction\("interpret-lines", \{\}\)/);
  // the reachable set: the seven the ribbon has are named in the fold AND still on the ribbon; Domains and the Section window are said in a line each
  const named = [...p.matchAll(/RIBBON_FAULT_TOOLS = \[([^\]]*)\]/g)][0][1].split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  assert.deepEqual(named, ["Strat. stack", "Explicit surface", "Structures", "Model from map", "Stereonet", "Downhole plot", "Core orient."]);
  const ribbon = read("../src/modules/viewer/ModeRibbons.jsx");
  for (const n of named) assert.ok(ribbon.includes(`label="${n}"`), `the 3D Modelling ribbon still has ${n}`);
  assert.match(p, /Domains: fault blocks; choose the fault surface in the Domains list, below the panes\./);
  assert.match(p, /Section window: open a section, then Draw fault; the builder above uses the strings\./);
  assert.match(p, /<MoreFold summary=\{tr\("Other fault tools…"\)\} data-fine-tune="faults">/);
  assert.match(p, /A fault surface from a few points is a guess, and beyond its evidence it is extrapolated, not observed\./); // the protective line
  // the steps
  const b = read("../src/modules/viewer/FaultBuilder.jsx");
  assert.match(b, /<StepPane id="faults" label=\{tr\("Faults"\)\}/);
  for (const k of ['key: "evidence"', 'key: "faults"', 'key: "shape"']) assert.ok(b.includes(k), k);
  for (const k of ["setOff(", "setAssign(", "setNames(", "setDips(", "setShape(", "setGapM(", "setExtent(", "setMarginM(", "setUntil(", "check(s)", "addToStack(s)", "setCheckN("]) assert.ok(b.includes(k), k);
  assert.match(b, /onClick: build/);
  // the guided card's tool id is the one opened
  assert.match(read("../src/modules/viewer/guided/guidedTools.js"), /id: "faults"/);
  // wiring: a lazy chunk of ModellingPanes; ViewerModule only knows the pane id and the opener
  const mp = modellingPanesSource();
  assert.match(mp, /const FaultsPanel = lazy\(\(\) => import\("\.\.\/FaultsPanel\.jsx"\)\);/); // #4070 — in panes/FaultsPane.jsx
  assert.match(mp, /\{toolPane === "faults" && \(<>[^\n]*\n\s*\{paneHeader\("Faults", SquareSplitVertical, "model", true[^\n]*\n\s*<Suspense fallback=\{null\}><FaultsPanel \{\.\.\.props\} pBtn=\{pBtn\} \/><\/Suspense>/);
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.doesNotMatch(vm, /FaultsPanel/);
  assert.match(vm, /const MODELLING_PANES = new Set\(\[[^\n]*"faults" \/\* #4006 \*\/\]\);/);
  assert.match(vm, /useModuleAction\(\["open-geoml", "open-pane"\], \(a, p\) => setToolPane\(a === "open-pane" \? \(MODELLING_PANES\.has\(p\?\.pane\) \? p\.pane : null\) : "geoml"\)\);/);
});

test("#4006 a Help search for a fault lands on the Faults page first; the pane's ? opens it", () => {
  for (const q of ["fault", "faults", "fault surface"]) assert.equal(searchPages(q)[0]?.page.id, "faults", q);
  assert.equal(searchPages("fault", undefined, { area: "3D Modelling" })[0]?.page.id, "faults");
  assert.match(read("../src/lib/help.js"), /"Faults": "faults",/);
  const f = pageById("faults");
  assert.match(f.cautions.join(" "), /a guess/);
  assert.match(f.cautions.join(" "), /extrapolated, not observed/);
  assert.match(read("../src/modules/viewer/ModeRibbons.jsx"), /label="Faults" tone="model" title="Every fault tool in one place/); // the ribbon's info card
});
