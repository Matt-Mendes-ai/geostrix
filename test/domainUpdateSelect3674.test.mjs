// TASKS.csv #3674 — Update an imported domain: the new holes by a year, a typed list of hole ids or a collar date field; the prior's width and the new data's reach
// as settings; the block budget's cell said. SYNTHETIC collars.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeDate, collarDateFields, newHoleIds, parseIdList } from "../src/lib/viewer/domainUpdate.js";

const collars = [
  { hole_id: "DH-24-001", attrs: { drilled: "2024-06-30", note: "x" } }, { hole_id: "DH-25-002", attrs: { drilled: "2025-03-12" } },
  { hole_id: "DH-25-003", attrs: { drilled: "2025/11/02" } }, { hole_id: "OLD-1", attrs: { drilled: "n/a" } }, { hole_id: "OLD-2" },
];

test("a collar date, read as sortable text; a field of dates is offered, a text field is not", () => {
  assert.equal(holeDate(collars[1], "drilled"), "2025-03-12");
  assert.equal(holeDate(collars[2], "drilled"), "2025-11-02");
  assert.equal(holeDate({ attrs: { d: "2025-03" } }, "d"), "2025-03-01");
  assert.equal(holeDate({ attrs: { d: "2025" } }, "d"), "2025-01-01");
  assert.equal(holeDate({ attrs: { d: "2025-03-12T10:00:00Z" } }, "d"), "2025-03-12");
  assert.equal(holeDate({ attrs: { d: "13/03/2025" } }, "d"), null, "a day-first date is not guessed");
  assert.equal(holeDate(collars[3], "drilled"), null);
  assert.deepEqual(collarDateFields(collars), ["drilled"]);
});

test("the new holes: by year, by a typed list, by a date on or after", () => {
  assert.deepEqual(newHoleIds(collars, { mode: "year", year: 2025 }), ["DH-25-002", "DH-25-003"]);
  assert.deepEqual(newHoleIds(collars, { mode: "list", ids: ["DH-24-001", " OLD-2 ", "NOPE"] }), ["DH-24-001", "OLD-2"]);
  assert.deepEqual(newHoleIds(collars, { mode: "date", field: "drilled", date: "2025-03-12" }), ["DH-25-002", "DH-25-003"]);
  assert.deepEqual(newHoleIds(collars, { mode: "date", field: "drilled", date: "2025-06-01" }), ["DH-25-003"]);
  assert.deepEqual(parseIdList("A, B;C\nD  E,,A"), ["A", "B", "C", "D", "E"]);
});

test("wiring: the run takes the selection and the two settings; the pane offers them and the budget's cell", () => {
  const u = readFileSync(new URL("../src/modules/viewer/domainUpdateRun.js", import.meta.url), "utf8");
  assert.match(u, /select = null, priorWidthM = null, newReachM = null/);
  assert.match(u, /const isNew = \(q\) => selIds\.has\(q\.hole_id\);/);
  assert.match(u, /priorWidthM: Math\.round\(\(priorWidthM > 0 \? priorWidthM : S \/ 2\)/);
  const d = readFileSync(new URL("../src/modules/viewer/DomainUpdateSection.jsx", import.meta.url), "utf8");
  assert.match(d, /select, priorWidthM: Number\(widthText\) > 0 \? Number\(widthText\) : null, newReachM: Number\(reachText\) > 0 \? Number\(reachText\) : null/);
  assert.match(d, /The block budget \(\{budget\}\) makes \{cell\} m cells over this domain/);
});
