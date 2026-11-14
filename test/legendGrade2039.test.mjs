// TASKS.csv #2039 (review #2013, Woodjam) — a classed assay element keeps all its classes in the 3D legend while the grade groups fit in
// half the rows; a cut one says how many classes it shows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocateLegendRows } from "../src/lib/legendGroups.js";

const G = (label, n, extra = {}) => ({ label, items: Array.from({ length: n }, (_, i) => [`${label}${i}`, "#000"]), ...extra });
const many = () => ["Lithology", "Alteration", "Veins", "Breccia", "Structural zones", "Mineralization", "Structure planes", "Surface samples", "IP lines"].map((l) => G(l, 10, { counts: Array(10).fill(1) }));

test("Cu and Au keep their four classes among nine busy groups", () => {
  const { rows } = allocateLegendRows([...many(), G("Cu (ppm)", 4, { grade: true }), G("Au (ppm)", 4, { grade: true })], 16);
  const by = (g) => rows.filter((r) => r.group === g).length;
  assert.equal(by("Cu (ppm)"), 4);
  assert.equal(by("Au (ppm)"), 4);
  assert.equal(rows.length, 16);
  assert.ok(by("Lithology") >= 1, "the rest still share the remaining rows");
  assert.ok(!rows.some((r) => r.classesShown));
});

test("grade groups that do not fit in half the rows are shared out as before (the lowest and top classes kept, #3306) and say so", () => {
  const { rows } = allocateLegendRows([G("Lithology", 10), G("Cu (ppm)", 5, { grade: true }), G("Au (ppm)", 5, { grade: true })], 7);
  const cu = rows.filter((r) => r.group === "Cu (ppm)");
  assert.equal(cu.length, 2);
  assert.deepEqual(cu.map((r) => r.label), ["Cu (ppm)0", "Cu (ppm)4"], "the lowest and the highest class (#3306)");
  assert.deepEqual(cu[0].classesShown, [2, 5]);
  assert.equal(rows.filter((r) => r.group === "Lithology").length, 3);
});

test("the overlay prints the count beside the heading", () => {
  const ov = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.ok(ov.includes('tr("({n} of {m} classes)", { n: it.classesShown[0], m: it.classesShown[1] })'));
});
