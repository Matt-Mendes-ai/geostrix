// TASKS.csv #1475 — a section snapshot's legend carries the grade classes it draws (first) and its mineralization
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionAssayLegend, sectionMineralLegend, groupSectionLegend } from "../src/lib/sectionLegend.js";

test("only the elements the section draws; hidden-below rows left out; minerals one row each without their %", () => {
  const groups = [
    { key: "assay_Zn", label: "Zn (%)", items: [["≤ 0.5 %", "#aaa"], ["0.5–2 %", "#f80"], ["> 2 %", "#c00"], ["below 0.1 % hidden", "transparent"]] },
    { key: "assay_Ag", label: "Ag (ppm)", items: [["≤ 30 ppm", "#ccc"]] },
  ];
  const points = [{ assay: { sym: "Zn" } }, { label: "Mineralization: SPH (5%)", color: "#123" }];
  const rows = sectionAssayLegend(points, groups);
  assert.deepEqual(rows.map((r) => r[0]), ["Zn (%): ≤ 0.5 %", "Zn (%): 0.5–2 %", "Zn (%): > 2 %"]);
  const min = sectionMineralLegend([{ label: "Mineralization: PY (2%)", color: "#ff0" }, { label: "Mineralization: PY (10.5%)", color: "#ff0" }, { label: "Lithology: LMST", color: "#00f" }], points);
  assert.deepEqual(min, [["Mineralization: PY", "#ff0"], ["Mineralization: SPH", "#123"]]);
  const grouped = groupSectionLegend([...rows, ["Lithology: LMST", "#00f"], ...min]);
  assert.deepEqual(grouped[0], ["Zn (%)", null, { heading: true }]);
  assert.deepEqual(sectionAssayLegend([], groups), []);
});
