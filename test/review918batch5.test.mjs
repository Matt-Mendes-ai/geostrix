// Review #918 Lows: #978 block sizes print rounded, #974 NGSA negatives read like the USGS / CDoGS ones.
import test from "node:test";
import assert from "node:assert/strict";
import { blockModelRows } from "../src/lib/blockModelExport.js";
import { parseNgsa } from "../src/lib/publicGeochem.js";
import { readAssayCell } from "../src/lib/geochem.js";

test("#978: Float32 block sizes (a saved and reloaded project) print as the size, not 3.3329999446868896", () => {
  const f = (v) => Math.fround(v);
  const [r] = blockModelRows({ property: "Au", cells: [{ x: 1, y: 2, z: 3, dx: f(3.333), dy: f(3.333), dz: f(1.6666), value: 1 }] });
  assert.deepEqual([r.XINC, r.YINC, r.ZINC], [3.333, 3.333, 1.6666]);
});

test("#974: an NGSA limit of 100 ppm or more is below detection, not a no-data code", () => {
  const head = "FID,SITE_ID,SAMPLE_ID,SUBSAMPLE_ID,LAT_GDA94,LONG_GDA94,CU_PPM,ARS_PPM";
  const t = parseNgsa([head, "x,2007191138,2007191138001 Coarse,AR,-31.39,140.01,-100,-0.01", "x,2007191139,2007191139001 Coarse,AR,-31.4,140.0,-9999,3"].join("\n"));
  const [a, b] = t.rows;
  assert.equal(a.Cu_ppm, "<100");
  assert.deepEqual(readAssayCell(a.Cu_ppm), { value: 50, qualifier: "<", kind: null });
  assert.equal(a.As_ppm, "<0.01");
  assert.equal(b.Cu_ppm, ""); // -9999: no data
});

test("#970: the 3D panel's IP verdict uses the #682 rule: an unfitted resistivity model makes the IP fit unfinished", async () => {
  const { ipFitOf } = await import("../src/lib/inversion.js");
  const unfit = ipFitOf({ phi_d: 11.8 * 100, target: 100, reachedTarget: false, iterations: 12, ip: { phi_d: 99, reachedTarget: true, iterations: 3 } });
  assert.equal(unfit.dcUnfitted, true); assert.equal(unfit.reachedTarget, false);
  const fit = ipFitOf({ phi_d: 98, target: 100, reachedTarget: true, iterations: 6, ip: { phi_d: 99, reachedTarget: true, iterations: 3 } });
  assert.equal(fit.dcUnfitted, undefined); assert.equal(fit.level, "ok");
});

test("#979: Micromine column names on export, and the block-model import maps them back without help", async () => {
  const { guessBlockModelMapping } = await import("../src/lib/blockModelCsv.js");
  const model = { property: "Au", cells: [{ x: 500000, y: 6000000, z: 900, dx: 10, dy: 10, dz: 5, value: 1.2 }, { x: 500010, y: 6000000, z: 900, dx: 10, dy: 10, dz: 5, value: 0.4 }] };
  const rows = blockModelRows(model, "micromine");
  assert.deepEqual(Object.keys(rows[0]).slice(0, 6), ["EAST", "NORTH", "RL", "_EAST", "_NORTH", "_RL"]);
  const headers = Object.keys(rows[0]);
  const { mapping } = guessBlockModelMapping(headers, rows); // numbers, as Papa's dynamic typing reads them
  assert.deepEqual(mapping, { x: "EAST", y: "NORTH", z: "RL", dx: "_EAST", dy: "_NORTH", dz: "_RL" });
  assert.deepEqual(Object.keys(blockModelRows(model)[0]).slice(0, 3), ["XC", "YC", "ZC"]); // the default is unchanged
});

