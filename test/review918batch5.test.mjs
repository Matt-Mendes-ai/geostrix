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
