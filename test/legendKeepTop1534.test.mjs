// TASKS.csv #1534 — a legend group cut short keeps the top grade classes and the most frequent categories
import test from "node:test";
import assert from "node:assert/strict";
import { allocateLegendRows, assayLegendGroups } from "../src/lib/legendGroups.js";

test("an Au group cut to two rows keeps the two highest classes", () => {
  const [au] = assayLegendGroups({ assays: [{}], assayElements: [{ symbol: "Au", unit: "g/t" }], assayVisible: true, assayDisplayElements: ["Au"],
    assayStyle: { Au: { breaks: [{ max: 0.012, color: "#eee" }, { max: 0.24, color: "#c80" }, { max: 136, color: "#800" }] } } });
  assert.equal(au.grade, true);
  const litho = { key: "litho", label: "Lithology", items: [["Cong", "#111"], ["Felsic Dyke", "#222"], ["V-Hbl-Intermed", "#333"]], counts: [4, 13, 644] };
  const { rows } = allocateLegendRows([au, litho], 4);
  assert.deepEqual(rows.map((r) => r.label), ["0.012–0.24 g/t", "> 0.24 g/t", "Felsic Dyke", "V-Hbl-Intermed"]);
});

test("a group that fits is untouched", () => {
  const g = { key: "x", label: "X", items: [["a", "#1"], ["b", "#2"]] };
  assert.deepEqual(allocateLegendRows([g], 5).rows.map((r) => r.label), ["a", "b"]);
});
