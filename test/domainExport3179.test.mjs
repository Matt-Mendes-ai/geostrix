// TASKS.csv #3179 — DOMAIN (the per-block domain of a hard-boundary estimate) in the VTK / OMF exports: a code array plus a legend
import test from "node:test";
import assert from "node:assert/strict";
import { numericCellFields, domainLegend, domainLegendText } from "../src/lib/blockModelExport.js";
import { blockModelToVtk } from "../src/lib/vtkExport.js";
import { volumeElementFromModel } from "../src/lib/omfWriter.js";

const cells = [];
for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) cells.push({ x: 1005 + i * 10, y: 2005 + j * 10, z: 102.5 + k * 5, dx: 10, dy: 10, dz: 5, value: 1 + i, domain: i === 0 ? "Oxide" : i === 1 ? "Sulphide" : j === 0 ? "Oxide" : null });
const model = { name: "Cu estimate", property: "Cu", cells };

test("#3179 the legend: codes in the order the domains first appear; none when no block has one", () => {
  assert.deepEqual(domainLegend(cells), [[1, "Oxide"], [2, "Sulphide"]]);
  assert.equal(domainLegendText(cells), "DOMAIN_CODE: 1 = Oxide, 2 = Sulphide.");
  assert.deepEqual(domainLegend(cells.map(({ domain, ...c }) => c)), []);
  assert.equal(domainLegendText([]), "");
});

test("#3179 DOMAIN_CODE is a numeric cell field: the code of each block's domain, none where a block has no domain", () => {
  const f = numericCellFields(cells).find((x) => x.name === "DOMAIN_CODE");
  assert.deepEqual(cells.slice(0, 3).map(f.get), [1, 2, 1]);
  assert.equal(f.get(cells[5]), null); // i = 2, j = 1: no domain
  assert.equal(numericCellFields(cells.map(({ domain, ...c }) => c)).some((x) => x.name === "DOMAIN_CODE"), false);
});

test("#3179 VTK: a DOMAIN_CODE CELL_DATA array and the legend in the title", () => {
  const { bytes } = blockModelToVtk(model, "EPSG:3156");
  const text = new TextDecoder("latin1").decode(bytes);
  assert.match(text.split("\n")[1], /DOMAIN_CODE: 1 = Oxide, 2 = Sulphide\./);
  assert.match(text, /SCALARS DOMAIN_CODE float 1\nLOOKUP_TABLE default\n/);
});

test("#3179 OMF: a domain_code data array and the legend in the element's description", () => {
  const { element } = volumeElementFromModel(model);
  const d = element.data.find((x) => x.name === "domain_code");
  assert.ok(d, "domain_code array");
  assert.equal(d.values.filter((v) => v === 1).length, 6); assert.equal(d.values.filter((v) => v === 2).length, 4); assert.equal(d.values.filter(Number.isNaN).length, 2);
  assert.match(element.description, /DOMAIN_CODE: 1 = Oxide, 2 = Sulphide\./);
});
