// TASKS.csv #2728 — the surface import dialog names the columns it leaves out of the sample attributes (too many different values)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfaceAttrLeftOut, surfaceAttrColumns, SURFACE_ATTR_MAX_DISTINCT } from "../src/lib/geochem.js";

const N = SURFACE_ATTR_MAX_DISTINCT + 20;
const rows = Array.from({ length: N }, (_, i) => ({ E: 600000 + i, N: 6200000 + i, Au: i / 100, Sample: `S${i}`, Lab_job: `J${i}`, Colour: i % 3 ? "red" : "brown", Empty: "", Comments: `note ${i}` }));
const headers = ["E", "N", "Au", "Sample", "Lab_job", "Colour", "Empty", "Comments"];
const mapping = { x: "E", y: "N", sample_id: "Sample" };
const elements = [{ symbol: "Au", header: "Au" }];

test("a column with too many different values is listed; kept, mapped, element, empty, note and excluded columns are not", () => {
  assert.deepEqual(surfaceAttrColumns(headers, rows, mapping, elements), ["Colour", "Comments"]);
  assert.deepEqual(surfaceAttrLeftOut(headers, rows, mapping, elements), ["Lab_job"]);
  assert.deepEqual(surfaceAttrLeftOut(headers, rows, mapping, elements, ["Lab_job"]), []);
});

test("wired into the dialog with the limit", () => {
  const m = readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /surfaceAttrLeftOut\(modal\.headers, modal\.allRows, modal\.mapping, modal\.elements, modal\.attrExclude\)/);
  assert.match(m, /tr\("Not kept as sample attributes \(more than \{max\} different values; not a note or an id\): \{list\}", \{ max: SURFACE_ATTR_MAX_DISTINCT,/);
});
