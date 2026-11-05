// TASKS.csv #1675 — pXRF readings paired with the lab interval that holds them; sample types listed
import { test } from "node:test";
import assert from "node:assert/strict";
import { pxrfLabPairs, pxrfVsLab, sampleTypesSeen } from "../src/lib/pxrfVsLab.js";

const lab = [], pxrf = [];
for (let i = 0; i < 40; i++) {
  const cu = 20 + i * 5, k = 2 + (i % 7) * 0.4;
  lab.push({ hole_id: "H1", from: i * 2, to: i * 2 + 2, values: { Cu: cu, K: k }, sample_type: "HCore" });
  pxrf.push({ hole_id: "H1", from: i * 2 + 1, to: i * 2 + 1, source: "pXRF", values: { Cu: i % 2 ? cu * 0.85 : 400 - cu, K: k * 0.9 }, sample_type: "XRF" });
}
pxrf.push({ hole_id: "H9", from: 5, to: 5, source: "pXRF", values: { Cu: 10, K: 1 } }); // no lab hole
pxrf.push({ hole_id: "H1", from: 500, to: 500, source: "pXRF", values: { Cu: 10, K: 1 } }); // below the last interval

test("each reading pairs with the lab interval holding its depth; readings outside any are not paired", () => {
  const p = pxrfLabPairs([...lab, ...pxrf]);
  assert.equal(p.length, 40);
  assert.equal(p[3].lab.from, 6);
});
test("per element: K tracks the lab (rho 1, ratio 0.9), Cu does not", () => {
  const r = pxrfVsLab([...lab, ...pxrf], [{ symbol: "Cu", unit: "ppm" }, { symbol: "K", unit: "%" }], { Cu: "ppm", K: "%" });
  assert.equal(r.readings, 42); assert.equal(r.pairs, 40);
  const k = r.rows.find((x) => x.symbol === "K"), cu = r.rows.find((x) => x.symbol === "Cu");
  assert.ok(Math.abs(k.rho - 1) < 1e-9 && Math.abs(k.medianRatio - 0.9) < 1e-9, JSON.stringify(k));
  assert.ok(cu.rho < 0.5, JSON.stringify(cu));
  assert.equal(r.rows[0].symbol, "K", "best agreement first");
});
test("sample types seen, most common first", () => {
  assert.deepEqual(sampleTypesSeen([...lab, ...pxrf]), [["HCore", 40], ["XRF", 40], ["pXRF", 2]]);
});
