// TASKS.csv #3217 (surface-sample follow-up) — a second surface-sample import opens with the units the user set last time, and a conversion that
// would put readings over 100 % is refused. Synthetic rock-chip table.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedFromProject, conversionsOver100 } from "../src/lib/assayReimport.js";
import { pickElementColumns } from "../src/lib/geochem.js";

const headers = ["SAMPLE", "EAST", "NORTH", "Cu_pct", "Zn_ppm"];
const rows = Array.from({ length: 30 }, (_, i) => ({ SAMPLE: `R${i}`, EAST: String(500000 + i), NORTH: String(6200000 + i), Cu_pct: String(120 + i * 300) /* ppm under a _pct name */, Zn_ppm: String(40 + i) }));

test("a rock-chip re-import opens with the unit set by hand last time, and nothing is converted", () => {
  const picked = pickElementColumns(headers.slice(3), rows).map((e) => ({ ...e, mainHeader: e.header, checked: e.n > 0 }));
  assert.equal(picked.find((e) => e.symbol === "Cu").unit, "%");
  const project = [{ symbol: "Cu", header: "Cu_pct", unit: "ppm", unitChosen: true }, { symbol: "Zn", header: "Zn_ppm", unit: "ppm" }];
  const { elements } = seedFromProject(picked, project, headers);
  const cu = elements.find((e) => e.symbol === "Cu");
  assert.equal(cu.unit, "ppm"); assert.equal(cu.asLastTime, true);
  assert.deepEqual(conversionsOver100(rows, elements.filter((e) => project.find((p) => p.symbol === e.symbol).unit !== e.unit)), []);
  assert.deepEqual(conversionsOver100(rows, [picked.find((e) => e.symbol === "Cu")]).map((b) => b.symbol), ["Cu"], "the unseeded % reading is caught");
});

test("the surface import is wired to seed, keep the hand choice and refuse", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/surfaceElements, headers\)\.elements/g) || []).length, 2, "the file dialog and the public-survey dialog");
  assert.equal((g.match(/conversionsOver100\(allRows, converted\)/g) || []).length, 2, "drill assays and surface samples");
  const m = fs.readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /unit, unitChosen: true/, "a unit set by hand is kept as chosen");
  assert.match(m, /As last time in this project/);
  assert.match(m, /conversionsOver100\(/);
});
