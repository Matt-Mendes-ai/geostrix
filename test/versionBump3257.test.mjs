// TASKS.csv #3257 — the PROJECT_VERSION bump to 29 (voxel models' optional keys as columns): a version-28 file, raw cell objects included, still
// loads; and a file from a NEWER GeoStrix is opened with a warning (#342's checkProjectFile: { ok: true, newer }), not refused.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECT_VERSION, fieldsFromPayload, payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

test("a version-28 file with an estimate saved as raw cells (the #3257 regression's files) loads, every cell as it was", () => {
  const cells = Array.from({ length: 50 }, (_, i) => ({ x: 1000 + i * 10, y: 2000, z: 300, dx: 10, dy: 10, dz: 10, value: 0.1 * i, nSamples: 4, nHoles: 1 + (i % 2), ...(i % 7 === 0 ? { beyond: "above" } : {}) }));
  const v28 = { ...payloadFromFields(emptyFields()), version: 28, voxelModels: [{ id: "e1", name: "Cu IDW", source: "estimate-idw2", cells }] };
  const loaded = fieldsFromPayload(JSON.parse(JSON.stringify(v28)), "old.geostrix.json");
  assert.equal(loaded.voxelModels.length, 1);
  assert.deepEqual(loaded.voxelModels[0].cells, cells);
  // and saved again it is written as columns (version 29), coming back the same
  const again = fieldsFromPayload(JSON.parse(JSON.stringify(payloadFromFields(loaded))), "old.geostrix.json");
  assert.equal(JSON.parse(JSON.stringify(payloadFromFields(loaded))).version, PROJECT_VERSION);
  assert.ok(JSON.parse(JSON.stringify(payloadFromFields(loaded))).voxelModels[0].compactCells);
  assert.equal(again.voxelModels[0].cells.length, 50);
  assert.equal(again.voxelModels[0].cells[7].beyond, "above"); assert.ok(!("beyond" in again.voxelModels[0].cells[1]));
});

test("#342 a file from a newer GeoStrix is opened with a warning, not refused; an older or current one opens plainly", () => {
  const src = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("export function checkProjectFile(data) {");
  const body = src.slice(start, src.indexOf("\n}\n", start) + 2).replace("export function", "function");
  const checkProjectFile = new Function("PROJECT_VERSION", `${body}; return checkProjectFile;`)(PROJECT_VERSION);
  assert.deepEqual(checkProjectFile({ version: PROJECT_VERSION + 1, collars: [] }), { ok: true, newer: PROJECT_VERSION + 1 }, "an older GeoStrix opening a v29 file: ok, with newer");
  assert.deepEqual(checkProjectFile({ version: 28, collars: [] }), { ok: true });
  assert.deepEqual(checkProjectFile({ version: PROJECT_VERSION, collars: [] }), { ok: true });
  assert.equal(checkProjectFile({ name: "package" }).ok, false, "not a project");
  // the store turns `newer` into the warning (a tab opened from a newer format), it does not stop the load
  assert.match(src, /const newerFormatTabsRef = useRef\(new Set\(\)\); \/\/ TASKS\.csv #342/);
});

test("an older GeoStrix (no presence bitsets) reading a v29 model sees null for an absent text key, not another cell's word", async () => {
  const { compactVoxelModels } = await import("../src/lib/projectFields.js");
  const cells = [{ x: 1, value: 1, beyond: "above" }, { x: 2, value: 2 }, { x: 3, value: 3, beyond: "below" }];
  const [c] = compactVoxelModels([{ id: "m", cells }]);
  const col = c.compactCells.cols.beyond;
  const idx = Array.from(new Float32Array(Uint8Array.from(Buffer.from(col.b64, "base64")).buffer));
  assert.deepEqual(idx.map((i) => col.dict[i]), ["above", null, "below"], "the old expand (dict[index]) gives null for the cell without it");
});

test("an older GeoStrix reading a v29 model sees NaN (missing) for an absent number, never 0: the value included", async () => {
  const { compactVoxelModels, expandVoxelModels } = await import("../src/lib/projectFields.js");
  const cells = [{ x: 1, value: 1.5, fromLog: 0.25 }, { x: 2 }, { x: 3, value: 0.7, fromLog: null }];
  const [c] = compactVoxelModels([{ id: "m", cells }]);
  const f64 = (b64) => Array.from(new Float64Array(Uint8Array.from(Buffer.from(b64, "base64")).buffer));
  const f32 = (b64) => Array.from(new Float32Array(Uint8Array.from(Buffer.from(b64, "base64")).buffer));
  const v = c.compactCells.cols.value, fl = c.compactCells.cols.fromLog;
  assert.ok(v.has && v.f64); assert.ok(fl.has && fl.nul);
  // the old expand: arr[i] + base, no bitsets
  const oldValue = f64(v.b64).map((x) => x + v.base), oldFromLog = f32(fl.b64).map((x) => x + fl.base);
  assert.equal(oldValue[0], 1.5); assert.ok(Number.isNaN(oldValue[1]), "the cell with no value reads NaN, not 0"); assert.equal(oldValue[2], 0.7);
  assert.equal(oldFromLog[0], 0.25); assert.ok(Number.isNaN(oldFromLog[1]) && Number.isNaN(oldFromLog[2]), "absent and null read NaN");
  // this version: the bitsets, exactly
  assert.deepEqual(expandVoxelModels([JSON.parse(JSON.stringify(c))])[0].cells, cells);
});
