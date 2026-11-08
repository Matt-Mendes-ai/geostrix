// TASKS.csv #1689 — an artificially closed body's note is worded for its kind (grade shell, unit body, alteration envelope).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the note branches on the body's type; the grade-shell text stays for grade shells", () => {
  const c = read("src/modules/viewer/ClosureNote.jsx");
  assert.match(c, /type === "unit_body"/);
  assert.match(c, /type === "alteration_envelope"/);
  assert.match(c, /not a logged contact with another code/);
  assert.match(c, /not a logged alteration boundary/);
  assert.match(c, /Part of its boundary is not a grade boundary/);
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /\{s\.closure === "artificial" && <ClosureNote type=\{s\.type\} \/>\}/);
  assert.ok(!v.includes("Part of its boundary is not a grade boundary"));
});
