// TASKS.csv #2852 (review GSC geophysics) — three Bathurst rasters all read 'bathurst_megatem…': the differing tail is kept, the full name on hover
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nameTail } from "../src/lib/middleName.js";
test("the tail kept", () => {
  assert.equal(nameTail("bathurst_megatem_all_cond.GRD"), "egatem_all_cond.GRD".slice(-16));
  assert.equal(nameTail("bathurst_megatem_all_mag_res.GRD — Tilt derivative"), " — Tilt derivative");
  assert.equal(nameTail("short.tif"), "");
  const r = fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8"), v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(r.includes("<MiddleName name={r.name}") && v.includes("<MiddleName name={r.name}"));
  assert.ok(fs.readFileSync(new URL("../src/components/MiddleName.jsx", import.meta.url), "utf8").includes("title={s}"));
});
