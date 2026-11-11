// TASKS.csv #2567 — Model from map on stacked pegmatite sheets: every contact into and out of P fed one 'Top of P', and nothing said the
// unit repeats down the holes. The contact count now names a repeating unit and points to the vein / dyke tool.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeContacts } from "../src/lib/holeMapContacts.js";

const rows = [];
// hole H1: A, P, A, P, A, P, A (three sheets); H2: A over P once; H3: A only
for (let k = 0; k < 7; k++) rows.push({ hole_id: "H1", from: k * 10, to: k * 10 + 10, value: k % 2 ? "PEG" : "AMP" });
rows.push({ hole_id: "H2", from: 0, to: 20, value: "AMP" }, { hole_id: "H2", from: 20, to: 40, value: "PEG" });
rows.push({ hole_id: "H3", from: 0, to: 40, value: "AMP" });
const codeUnit = { PEG: "P", AMP: "A" };

test("a unit met in several runs down one hole is counted as repeating", () => {
  const r = holeContacts(rows, codeUnit);
  assert.equal(r.contacts.length, 7, "6 in H1 + 1 in H2");
  assert.deepEqual(r.repeats.get("P"), { holes: 1, runs: 3, maxRuns: 3, metres: 30 });
  assert.deepEqual(r.repeats.get("A"), { holes: 1, runs: 4, maxRuns: 4, metres: 40 });
  const plain = holeContacts(rows.filter((x) => x.hole_id !== "H1"), codeUnit);
  assert.equal(plain.repeats.size, 0, "a unit met once per hole does not repeat");
});

test("the pane warns and the pick check names stacked sheets", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /tr\("\{unit\} is met \{r\} times in \{h\} hole\(s\), up to \{max\} in one: it repeats down the holes/);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /or stacked sheets of an intrusion \(model those as veins \/ dykes\);/);
});
