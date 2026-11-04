// TASKS.csv #1808 (review #1646, Kodiak) — two visible block models in the same cells are named on each other's range row
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coincidentModels, modelBox } from "../src/lib/voxelOverlap.js";

const grid = (x0, n, extra = {}) => ({ name: "m", ...extra, cells: Array.from({ length: n * n }, (_, i) => ({ x: x0 + 30 * (i % n), y: 30 * Math.floor(i / n), z: 1500, dx: 30, dy: 30, dz: 20, value: 1 })) });

test("#1808 the same mesh (even with fewer cells: air left out) coincides; a model beside it or a hidden one does not", () => {
  const res = { ...grid(0, 10), id: "res", name: "3dmesh_utm", property: "Resistivity (ohm·m)" };
  const chg = { ...grid(0, 10), id: "chg", name: "3dmesh_utm", property: "Chargeability (mV/V)" };
  chg.cells = chg.cells.slice(0, 95);
  const beside = { ...grid(600, 10), id: "far" };
  assert.deepEqual(modelBox(res), [-15, -15, 1490, 285, 285, 1510]);
  assert.deepEqual(coincidentModels(res, [res, chg, beside]).map((m) => m.id), ["chg"]);
  assert.deepEqual(coincidentModels(chg, [res, chg, beside]).map((m) => m.id), ["res"]);
  assert.deepEqual(coincidentModels(res, [res, { ...chg, visible: false }]), []);
  assert.deepEqual(coincidentModels({ ...res, visible: false }, [res, chg]), []);
});

test("#1808 both range rows (3D sidebar and Geophysics card) get the other models", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("onShell={makeVoxelShell} others={voxelModels} />"));
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("others={others} />{/* others: #1808 */}") && g.includes("others={voxelModels} /* #1808 */"));
});
