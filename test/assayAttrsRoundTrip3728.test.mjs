// TASKS.csv #3728 (Main's check before the merge) — a sample's kept fields (row.attrs: Zone, Target) and a marked '>' (#3729) must survive the
// project file and the autosave: the assays are saved as a column table from 2,000 rows (#555), opened as a Table (#3424), and saved again from
// that Table. Every path here is the app's own: projectJson (Save), projectPartsSliced (the autosave), expandPayloadSliced + fieldsFromPayload
// (Open / restore), with the column table and the plain rows (under 2,000) both. Synthetic rows.
import test from "node:test";
import assert from "node:assert/strict";
import { projectJson, projectPartsSliced, joinParts, expandPayloadSliced, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";
import { rowsOf } from "../src/lib/rowTable.js";
import { mergeAssayRows } from "../src/lib/geochem.js";

const make = (n) => Array.from({ length: n }, (_, i) => ({
  hole_id: `SG-${i % 7}`, from: i, to: i + 1, source: "assay",
  ...(i % 3 ? { attrs: { Zone: i % 2 ? "Blueberry" : "Gully", ...(i % 10 === 1 ? { Target: "T1" } : {}) } } : {}),
  values: { Au: i / 100, Fe: i % 5 === 0 ? 15 : 3.25 },
  ...(i % 5 === 0 ? { qualifiers: { Fe: ">" } } : {}),
}));
const same = (got, want) => {
  assert.equal(got.length, want.length);
  want.forEach((w, i) => {
    assert.deepEqual(got[i].attrs, w.attrs, `row ${i} attrs`);
    assert.deepEqual(got[i].qualifiers, w.qualifiers, `row ${i} qualifiers`);
    assert.deepEqual(got[i].values, w.values, `row ${i} values`);
  });
};
const open = async (text) => fieldsFromPayload(await expandPayloadSliced(JSON.parse(text), async () => {}), "test");

for (const n of [2500, 40]) { // a column table, and plain rows
  test(`${n} assays: Save -> Open, then the opened project saved again -> Open`, async () => {
    const rows = make(n);
    const text = projectJson({ ...emptyFields(), assays: rows });
    if (n >= 2000) assert.match(text, /"assays":\{"__compactTable"/);
    const a = await open(text);
    same(rowsOf(a.assays), rows);
    const b = await open(projectJson({ ...emptyFields(), assays: a.assays })); // saved from the Table the open made
    same(rowsOf(b.assays), rows);
  });
  test(`${n} assays: autosave -> restore`, async () => {
    const rows = make(n);
    const text = joinParts(await projectPartsSliced({ ...emptyFields(), assays: rows }, {}, async () => {}));
    same(rowsOf((await open(text)).assays), rows);
  });
}

test("a re-import onto opened rows keeps their fields and adds the new ones", async () => {
  const rows = make(2500);
  const opened = rowsOf((await open(projectJson({ ...emptyFields(), assays: rows }))).assays);
  const merged = mergeAssayRows(opened, [{ hole_id: "SG-1", from: 1, to: 2, source: "assay", values: { Cu: 5 }, attrs: { Target: "T9" } }]);
  const all = merged.rows || merged, r = all.find((x) => x.hole_id === "SG-1" && x.from === 1);
  assert.equal(all.length, rows.length, "merged in place, not added");
  assert.deepEqual(r.values, { Au: 0.01, Fe: 3.25, Cu: 5 });
  assert.deepEqual(r.attrs, { Zone: "Blueberry", Target: "T9" });
});
