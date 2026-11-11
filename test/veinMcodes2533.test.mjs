// TASKS.csv #2533 — the Vein tool refused a sheet swarm and sent the user to split it in Modelling codes, but the codes made there (P1 ...,
// set cross-cutting) were not offered by the Vein tool, the raw P stayed listed after every interval was re-coded, the envelope advice named
// Layer: Veins for a Lithology code, and Auto-number re-coded every hole of the property without a word.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { veinSourceUnits } from "../src/lib/layers.js";
import { rowKey } from "../src/lib/modellingCodes.js";

const litho = [
  { hole_id: "H1", from: 0, to: 2, value: "P" }, { hole_id: "H1", from: 10, to: 12, value: "P" },
  { hole_id: "H2", from: 3, to: 5, value: "P" }, { hole_id: "H1", from: 2, to: 10, value: "BAS" },
];

test("cross-cutting modelling codes some interval carries are vein sources; a raw code re-coded away is not", () => {
  const assign = { [rowKey(litho[0])]: "P1", [rowKey(litho[1])]: "P2", [rowKey(litho[2])]: "P1" };
  const mc = { assign, codes: [{ name: "P", role: "cross-cutting" }, { name: "P1", role: "cross-cutting" }, { name: "P2", role: "stratigraphic" }, { name: "P9", role: "cross-cutting" }] };
  assert.deepEqual(veinSourceUnits({ litho }, mc), ["mcode:P1"]);
  // one P interval left raw: P still offered
  const partial = { ...mc, assign: { [rowKey(litho[0])]: "P1" } };
  assert.deepEqual(veinSourceUnits({ litho }, partial), ["litho:P", "mcode:P1"]);
  // no modelling codes assigned: as before
  assert.deepEqual(veinSourceUnits({ litho, vein: [{ hole_id: "H1", from: 0, to: 1, value: "QV" }] }, { codes: [{ name: "P", role: "cross-cutting" }] }), ["QV", "litho:P"]);
});

test("wired: the vein run reads an mcode source by effective code; the refusal names a route for the layer; Auto-number follows the Model area", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /isMcodeVein \? effectiveCode\(r, modellingCodes, mcodeGroupOf\) === veinValue : r\.value === veinValue/);
  assert.match(r, /route: veinLayer === "litho" \? tr\("Alteration > Layer: Lithology, or Modelling codes > Build a closed body"\)/);
  const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(panes, /u\.startsWith\("mcode:"\) \? tr\("\{code\} \(Modelling code\)"/);
  assert.match(panes, /inArea=\{modelArea === "checked" \? \(id\) => visibleHoles\?\.\[id\] !== false : null\}/);
  const p = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const rows = inArea \? litho\.filter\(\(r\) => inArea\(r\.hole_id\)\) : litho;/);
  assert.match(p, /Numbered \{n\} interval\(s\) of \{codes\} in \{h\} hole\(s\)\{area\}\./);
});
