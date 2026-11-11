// TASKS.csv #2350 (review #2325, WA uranium) — lab repeats with a method suffix (Au-Rp1_100) are found; numbered columns (Au2, Pt2) are offered
// as repeats when the data say so (they share samples with the element and agree), never by name alone and never ticked for the user
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repeatColumns, numberedRepeatCandidates } from "../src/lib/geochem.js";

const H = ["hole_id", "from", "to", "Au", "Au_100", "Au-Rp1", "Au-Rp1_100", "Au1", "Au2", "Au3", "Au2_100", "Pt", "Pt2", "Pd", "Pd2", "U", "U_103"];

test("a repeat column with a lab method suffix is a repeat; the element's own method columns are not", () => {
  const r = repeatColumns(H, [{ symbol: "Au", header: "Au" }]).map((x) => x.header);
  assert.deepEqual(r, ["Au-Rp1", "Au-Rp1_100"]);
  assert.ok(!r.includes("Au_100") && !r.includes("Au2")); // a method column, and a numbered one not chosen
  // ticked numbered repeats join the list
  assert.deepEqual(repeatColumns(H, [{ symbol: "Au", header: "Au" }], ["Au2", "Pt2"]).map((x) => x.header), ["Au-Rp1", "Au-Rp1_100", "Au2"]);
  assert.deepEqual(repeatColumns(H, [{ symbol: "U", header: "U" }]), []); // U_103 is a second method, not a repeat
});

test("numbered columns: offered from the data (shared samples that agree), against the main column or a method column", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    rows.push({ Au: i < 30 ? String(0.1 * (i + 1)) : "", Au_100: i >= 30 ? String(0.2 * i) : "", Au2: String(0.1 * (i + 1) * (i % 2 ? 1.04 : 0.97)), Au1: i >= 30 ? String(0.2 * i * 1.01) : "",
      Au3: i < 2 ? "1" : "", Pt: "0.05", Pt2: "0.3", Pd: i < 10 ? "0.02" : "", Pd2: i < 10 ? "0.021" : "" });
  }
  const c = numberedRepeatCandidates(H, rows, [{ symbol: "Au", header: "Au" }, { symbol: "Pt", header: "Pt" }, { symbol: "Pd", header: "Pd" }]);
  const by = Object.fromEntries(c.map((x) => [x.header, x]));
  assert.ok(by.Au2 && by.Au2.n === 40, JSON.stringify(c)); // 30 against Au, 10 against Au_100 (the sample's own original)
  assert.ok(Math.abs(by.Au2.medianRatio - 1) < 0.05);
  assert.ok(by.Au1 && by.Au1.n === 10); // only against Au_100
  assert.ok(!by.Au3); // 2 shared samples: too few to say
  assert.ok(!by.Pt2); // ratio 6: another analysis, not a repeat
  assert.ok(by.Pd2 && by.Pd2.n === 10);
});

test("the dialog offers them unticked and the commit keeps the ticked ones", () => {
  const d = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(d, /checked=\{\(modal\.numberedRepeats \|\| \[\]\)\.includes\(c\.header\)\}/);
  assert.match(d, /looks like a repeat of \{symbol\}: \{n\} samples have both, median ratio \{r\}/);
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /repeatColumns\(modal\.headers \|\| Object\.keys\(allRows\[0\] \|\| \{\}\), chosen, modal\.numberedRepeats \|\| \[\]\)/);
});
