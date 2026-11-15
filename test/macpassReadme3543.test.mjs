// TASKS.csv #3543 — the Macpass sample's README gave two counts that differ from its own files: the low-recovery flag (Y 2,886; sg.csv has 2,885, the source's extra one is in an
// interval with no density) and the holes whose last survey station is more than 1 m short of the hole (109; the files give 108, and 110 at 1 m or more).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rd = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
const readme = read("../sample_data/yk_macpass/README.md");

test("the README's low-recovery count is sg.csv's", () => {
  const y = rd("sg.csv").filter((r) => r.low_recovery === "Y").length;
  assert.equal(y, 2885);
  assert.ok(readme.includes(`(Y ${y.toLocaleString("en-US")} in this file; the source has ${(y + 1).toLocaleString("en-US")})`));
  assert.doesNotMatch(readme, /\(Y 2,886\)/);
});

test("the README's count of holes whose survey stops over 1 m short is the files'", () => {
  const collars = rd("collars.csv"), last = new Map();
  for (const s of rd("survey.csv")) last.set(s.hole_id, Math.max(last.get(s.hole_id) ?? -Infinity, s.depth));
  const gap = (c) => c.length - last.get(c.hole_id);
  const over = collars.filter((c) => last.has(c.hole_id) && gap(c) > 1).length, atLeast = collars.filter((c) => last.has(c.hole_id) && gap(c) >= 1).length;
  assert.equal(over, 108); assert.equal(atLeast, 110);
  assert.ok(readme.includes(`${over} holes' last station is more than 1 m short of the hole's length (${atLeast} at 1 m or more)`));
  assert.doesNotMatch(readme, /109 holes/);
});
