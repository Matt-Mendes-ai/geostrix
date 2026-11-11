// TASKS.csv #2076 — readings with a valid resistivity but no chargeability (MX '*') were dropped from both inversions, said only as '5 row(s)
// skipped (missing A/M, non-positive resistivity or no chargeability)'. They are now counted and the way to keep them is said.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDcipRows } from "../src/lib/dcip.js";

const rows = [
  { A: "0", B: "25", M: "50", N: "75", RHO: "120", MX: "6.1" },
  { A: "0", B: "25", M: "275", N: "300", RHO: "22.5", MX: "*" }, // deep n, resistivity only
  { A: "0", B: "25", M: "300", N: "325", RHO: "19.4", MX: "*" },
  { A: "0", B: "25", M: "", N: "", RHO: "100", MX: "5" }, // no potential electrode: a bad row, not 'no chargeability'
  { A: "25", B: "50", M: "75", N: "100", RHO: "-3", MX: "*" }, // non-positive resistivity
];
const mapping = { a: "A", b: "B", m: "M", n: "N", rho: "RHO", ip: "MX" };

test("resistivity-only readings are counted apart from bad rows", () => {
  const p = parseDcipRows(rows, mapping);
  assert.equal(p.readings.length, 1);
  assert.equal(p.skipped, 4);
  assert.equal(p.noIp, 2);
  const dcOnly = parseDcipRows(rows, { ...mapping, ip: null });
  assert.equal(dcOnly.readings.length, 3); // with no chargeability column the two come back
  assert.equal(dcOnly.noIp, 0);
});

test("the read notice says so", () => {
  const src = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /p\.noIp \? " " \+ tr\("\{n\} of them have a resistivity but no chargeability: they are left out of the resistivity inversion too\./);
});
