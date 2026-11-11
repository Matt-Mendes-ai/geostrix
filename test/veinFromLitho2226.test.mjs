// TASKS.csv #2226 — veins logged as lithology codes reach the Vein / dyke tool and the halo; an empty list says why
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { veinSourceUnits, setLithologyNoteRoles } from "../src/lib/layers.js";

test("the Veins log first, then the cross-cutting lithology codes as litho:<code>", () => {
  setLithologyNoteRoles(null);
  const layers = { vein: [{ value: "QZ" }, { value: "QZ" }], litho: [{ value: "SMP" }, { value: "Dyke" }, { value: "VQZ" }, { value: "" }] };
  assert.deepEqual(veinSourceUnits(layers), ["QZ", "litho:Dyke"]);
  // a role set in Modelling codes wins: VQZ marked cross-cutting, Dyke marked stratigraphic
  assert.deepEqual(veinSourceUnits(layers, { codes: [{ name: "VQZ", role: "cross-cutting" }, { name: "Dyke", role: "stratigraphic" }] }), ["QZ", "litho:VQZ"]);
  assert.deepEqual(veinSourceUnits({}), []);
});

test("the run reads the chosen layer; the halo offers Lithology; the pane says why the list is empty", () => {
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.ok(runs.includes('const veinLayer = String(veinPick).startsWith("litho:") || isMcodeVein ? "litho" : "vein"')); // #2533: modelling codes too
  assert.ok(runs.includes("const rows = (layers[veinLayer] || []).filter((r) => (isMcodeVein ? effectiveCode(r, modellingCodes, mcodeGroupOf) === veinValue : r.value === veinValue)"));
  assert.ok(runs.includes('source?.layer === "litho" ? "litho" : "alt"'));
  const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.ok(panes.includes('<option value="litho">{tr("Lithology (a code set as an envelope)")}</option>'));
  assert.ok(panes.includes('{vein_units.length === 0 && <div'));
  assert.ok(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").includes("const vein_units = veinSourceUnits(layers, modellingCodes);"));
});
