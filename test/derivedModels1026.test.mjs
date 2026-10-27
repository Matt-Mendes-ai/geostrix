// TASKS.csv #1026 (review #1016) — the Data Support Index and kriging-variance block models are not exported under the grade's name and unit.
import test from "node:test";
import assert from "node:assert/strict";
import { blockModelRows, blockModelParamLines, valueColumnName } from "../src/lib/blockModelExport.js";
import { volumeElementFromModel } from "../src/lib/omfWriter.js";
import { provenanceText, tensorFromCells } from "../src/lib/modelExport.js";
import { NOT_A_RESOURCE } from "../src/lib/provenance.js";

const cells = [];
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cells.push({ x: 1000 + i * 10, y: 2000 + j * 10, z: 100, dx: 10, dy: 10, dz: 10, value: 0.6, nSamples: 4, nHoles: 2 });
const params = { tool: "Grade estimation", element: "Au", unit: "ppm" };
const si = { name: "Au — Data Support Index", source: "support-index-ok", cells, params: { ...params, value: "Data Support Index (geometric, 0-1)" } };
const kv = { name: "Au — kriging variance", source: "kriging-variance", cells, params: { ...params, value: "kriging variance (ppm squared)" } };
const grade = { name: "Au estimate", source: "estimate-ok", cells, params };

test("#1026 CSV: SUPPORT_INDEX (no unit) and KV_Au_ppm2 (ppm squared), never Au_ppm; the grade keeps Au_ppm", () => {
  assert.equal(valueColumnName(grade), "Au_ppm");
  assert.equal(valueColumnName(si), "SUPPORT_INDEX");
  assert.equal(valueColumnName(kv), "KV_Au_ppm2");
  assert.ok("SUPPORT_INDEX" in blockModelRows(si)[0] && !("Au_ppm" in blockModelRows(si)[0]));
  assert.ok("KV_Au_ppm2" in blockModelRows(kv)[0] && !("Au_ppm" in blockModelRows(kv)[0]));
  const siLines = blockModelParamLines(si).join("\n"), kvLines = blockModelParamLines(kv).join("\n");
  assert.match(siLines, /Values: SUPPORT_INDEX \(no unit\)/);
  assert.match(kvLines, /Values: KV_Au_ppm2 in ppm squared/);
  assert.doesNotMatch(siLines + kvLines, /Values: Au_ppm/);
  assert.equal(valueColumnName({ ...si, property: "MY_SI" }), "MY_SI"); // an explicit property still wins
});

test("#1026 OMF and provenance: the derived arrays named for what they hold; kriging variance carries the not-a-resource sentence", () => {
  const eS = volumeElementFromModel(si).element, eK = volumeElementFromModel(kv).element;
  assert.equal(eS.data[0].name, "SUPPORT_INDEX");
  assert.equal(eK.data[0].name, "KV_Au_ppm2");
  assert.doesNotMatch(eS.description, /values in ppm/);
  assert.match(eK.description, /values in ppm squared/);
  assert.ok(eK.description.includes(NOT_A_RESOURCE));
  assert.ok(provenanceText(kv, tensorFromCells(cells), [], 32610, []).includes(NOT_A_RESOURCE));
});
