// TASKS.csv #2351 — Correlation pre-ticked a fixed sulphide suite on a uranium project and left U out; QAQC opened on Co (the first element
// in import order). The defaults now come from the data: the lead commodity, then the elements with the most values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlationDefaults, MIN_PAIRS } from "../src/lib/preferredElement.js";

const syms = ["Co", "Sc", "Cu", "Mo", "Bi", "Te", "U", "Pb", "Ni", "V", "Th", "S"];
const counts = { Co: 9000, Sc: 9000, Cu: 9700, Mo: 46, Bi: 46, Te: 46, U: 9733, Pb: 8436, Ni: 9000, V: 2796, Th: 9000, S: 9000 };

test("the lead commodity first, then by number of values; the 46-sample elements last", () => {
  const d = correlationDefaults(syms, 9, { lead: "U", counts });
  assert.equal(d[0], "U");
  assert.deepEqual(d.slice(1, 3), ["Cu", "S"], "9,700 values, then the 9,000s broken by the suite (S is in it)");
  for (const s of ["Mo", "Bi", "Te"]) assert.ok(!d.includes(s), s);
  assert.ok(MIN_PAIRS >= 10);
  assert.ok(!correlationDefaults(["U", "X"], 12, { lead: "U", counts: { U: 100, X: 3 } }).includes("X"), "fewer than MIN_PAIRS values: left out");
});

test("without counts the old order stays, the lead put first when given", () => {
  assert.deepEqual(correlationDefaults(["Ag", "Cu", "Zn"], 12), ["Cu", "Ag", "Zn"]);
  assert.deepEqual(correlationDefaults(["Ag", "Cu", "U"], 12, { lead: "U" }), ["U", "Cu", "Ag"]);
});

test("Correlation and QAQC open from the data", () => {
  const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(c, /correlationDefaults\(syms, 12, \{ lead, counts: countsOf\(rows, syms\) \}\)/);
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /useState\(\(\) => preferredElement\(assayElements\.map\(\(e\) => e\.symbol\), null, lead\)\)/);
});
