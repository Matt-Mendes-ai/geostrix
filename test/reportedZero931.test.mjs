// TASKS.csv #931 — a public layer's 0 (BC RGS: no below-detection marker) is not a grade, but not "not analysed" either:
// the sample keeps it (`nd`), and the censored shares and threshold populations count it beside n instead of dropping it.
import test from "node:test";
import assert from "node:assert/strict";
import { parseBcRgs } from "../src/lib/publicGeochem.js";
import { censoredShares } from "../src/lib/surfaceQaqc.js";
import { populations } from "../src/lib/thresholds.js";

const BC = [
  "FID,MASTER_ID,MATERIAL,LATITUDE,LONGITUDE,ELEVATION,GOLD_FA_PPB,COPPER_AAS_PPM,GEOMETRY",
  'a.1,S1,Stream Sediment,54.1,-127.1,,0,30,"POINT (0 0)"',
  'a.2,S2,Stream Sediment,54.2,-127.2,,0.0,31,"POINT (0 0)"',
  'a.3,S3,Stream Sediment,54.3,-127.3,,3,0,"POINT (0 0)"',
  'a.4,S4,Stream Sediment,54.4,-127.4,,12,33,"POINT (0 0)"',
].join("\r\n") + "\r\n";

test("#931: BC RGS zeros stay empty cells but are listed per row, never as a header", () => {
  const t = parseBcRgs(BC);
  assert.deepEqual(t.rows.map((r) => r.zeroReported || []), [["Au_FA_ppb"], ["Au_FA_ppb"], ["Cu_AAS_ppm"], []]);
  assert.equal(t.rows[0].Au_FA_ppb, "");
  assert.ok(!t.headers.includes("zeroReported"));
  assert.equal(t.notes[0].n, 3);
});

test("#931: the probe's four sites (Au 0, 0, 3, 12): n = 2 and 2 reported at 0, not n = 2 and nothing said", () => {
  const samples = [{ values: {}, nd: ["Au"] }, { values: {}, nd: ["Au"] }, { values: { Au: 3 } }, { values: { Au: 12 } }];
  const [au] = censoredShares(samples, [{ symbol: "Au", unit: "ppb" }]);
  assert.deepEqual({ n: au.n, bdl: au.bdl, zero: au.zero }, { n: 2, bdl: 0, zero: 2 });
  const pops = populations(samples.map((s, i) => ({ ...s, medium: i < 3 ? "a" : "b" })), { valueOf: (s) => s.values.Au ?? null, zeroOf: (s) => !!s.nd?.includes("Au"), keyOf: (s) => s.medium });
  assert.deepEqual(pops.map((p) => [p.key, p.values.length, p.zero]), [["a", 1, 2], ["b", 1, 0]]);
  // a survey without the marker: unchanged
  const plain = censoredShares([{ values: { Au: 3 } }, { values: {} }], [{ symbol: "Au", unit: "ppb" }])[0];
  assert.equal(plain.zero, 0);
});
