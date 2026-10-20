// TASKS.csv #529 — block-model exports carry the grade unit, CRS, app version and the not-a-resource statement.
import test from "node:test";
import assert from "node:assert/strict";
import { blockModelRows, blockModelParamLines, valueColumnName } from "../src/lib/blockModelExport.js";
import { stampLines } from "../src/lib/provenance.js";
import { buildModelExportZip } from "../src/lib/modelExport.js";
import { readZipEntries } from "../src/lib/shapefile.js";

const cells = [];
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
  cells.push({ x: 500 + i * 10, y: 600 + j * 10, z: 100 + k * 10, dx: 10, dy: 10, dz: 10, value: 0.5 + i, nSamples: 6, nHoles: 2, support: k ? "interpolated" : "extrapolated", supportIndex: 0.25 * (i + j + k) });
const model = { name: "Au estimate", source: "estimate-idw", cells, params: { tool: "Grade estimation", element: "Au", unit: "ppm", capValue: 5, capUnit: "ppm" } };

test("#529 CSV: value column Au_ppm, numeric support code + index, unit/cap/version/CRS/disclaimer in the header", () => {
  assert.equal(valueColumnName(model), "Au_ppm");
  assert.equal(valueColumnName({ params: { element: "Au", unit: "g/t" } }), "Au_gpt");
  assert.equal(valueColumnName({ property: "Resistivity (ohm·m)" }), "Resistivity_ohm_m_"); // properties keep their own name
  const r = blockModelRows(model)[0];
  assert.equal(r.Au_ppm, 0.5); assert.equal(r.SUPPORT, "extrapolated"); assert.equal(r.SUPPORT_CODE, 1); assert.equal(r.SUPPORT_INDEX, 0);
  const head = stampLines({ tool: "Block model export", version: "0.1.30", epsg: 3156, params: blockModelParamLines(model) }).join("\n");
  for (const want of [/not a Mineral Resource/, /GeoStrix 0\.1\.30/, /Project CRS: EPSG:3156/, /Values: Au_ppm in ppm; cap 5 ppm/, /SUPPORT_CODE: 0 = unsupported, 1 = extrapolated, 2 = interpolated/]) assert.match(head, want);
});

test("#529 package: provenance.txt and the OMF state the unit and the disclaimer; OMF has support codes + index", async () => {
  const { zip } = await buildModelExportZip(model, 3156);
  const e = await readZipEntries(zip, /.*/);
  const prov = new TextDecoder().decode(e["provenance.txt"]);
  assert.match(prov, /CRS: EPSG:3156/); assert.match(prov, /Values: Au in ppm; capped at 5 ppm/); assert.match(prov, /not a Mineral Resource/);
  const omfName = Object.keys(e).find((n) => n.endsWith(".omf"));
  const omf = Buffer.from(e[omfName]).toString("latin1");
  assert.match(omf, /Au_ppm/); assert.match(omf, /support_index/); assert.match(omf, /values in ppm/); assert.match(omf, /not a Mineral Resource/);
});
