// TASKS.csv #2984 (WA iron review) — the Maps plan offered no collar field to colour by on an imported project: collarMapStyle read only a
// collar's top-level keys, while an import keeps the collar file's other columns in collar.attrs (#1504, useImportPipeline). The collars
// here are built the way the import builds them (lib/geochem.js surfaceAttrColumns / surfaceAttrs into attrs). SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { surfaceAttrColumns, surfaceAttrs } from "../src/lib/geochem.js";
import { collarColourFields, collarColouring, collarFieldValue } from "../src/lib/collarMapStyle.js";

const rows = Array.from({ length: 30 }, (_, i) => ({
  HOLE: `WI${String(i + 1).padStart(3, "0")}`, EAST: String(400000 + 50 * i), NORTH: String(7400000 + 30 * i), RL: "420",
  HOLE_TYPE: ["RC", "DD", "RC", "AC"][i % 4], PROSPECT: i < 15 ? "North" : "South", YEAR: String(2008 + (i % 3)), DEPTH_M: String(40 + 7 * i),
}));
const mapping = { hole_id: "HOLE", x: "EAST", y: "NORTH", z: "RL" };
const cols = surfaceAttrColumns(Object.keys(rows[0]), rows, mapping);
const collars = rows.map((r) => ({ hole_id: r.HOLE, x: +r.EAST, y: +r.NORTH, z: +r.RL, ...surfaceAttrs(r, cols) })); // surfaceAttrs returns { attrs }

test("an imported project's kept columns are offered to colour by", () => {
  assert.ok(collars[0].attrs.HOLE_TYPE, "the import keeps HOLE_TYPE in attrs"); // the precondition the old test never built
  const f = collarColourFields(collars);
  const keys = f.map((x) => x.key);
  assert.ok(keys.includes("HOLE_TYPE") && keys.includes("PROSPECT") && keys.includes("YEAR"), keys.join(","));
  assert.ok(!keys.includes("attrs"));
  assert.equal(f.find((x) => x.key === "HOLE_TYPE").kind, "category");
  assert.equal(f.find((x) => x.key === "DEPTH_M").kind, "number");
});

test("colouring by an attrs field works, with a legend counted per value", () => {
  const c = collarColouring(collars, { field: "HOLE_TYPE" });
  assert.equal(c.kind, "category");
  assert.deepEqual(c.legend.map((l) => l.label), ["RC (15)", "AC (7)", "DD (8)"].sort((a, b) => +b.match(/\d+/) - +a.match(/\d+/) || a.localeCompare(b)));
  assert.ok(collars.every((h) => c.colourOf(h)));
  const n = collarColouring(collars, { field: "DEPTH_M" });
  assert.equal(n.kind, "number");
  assert.ok(collars.every((h) => n.colourOf(h)));
});

test("a top-level field still wins over attrs; an object is never a value", () => {
  assert.equal(collarFieldValue({ type: "RC", attrs: { type: "DD" } }, "type"), "RC");
  assert.equal(collarFieldValue({ attrs: { type: "DD" } }, "type"), "DD");
  assert.equal(collarFieldValue({ attrs: { a: 1 } }, "attrs"), undefined);
});
