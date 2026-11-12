// TASKS.csv #3047 — the recovery banner groups repeated tab names and lists only the first few.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recoveryTabNames } from "../src/lib/recoveryNames.js";

test("35 recovered tabs read as two groups, not 35 names", () => {
  const names = [...Array(35).fill("Recovered: Untitled project"), "Recovered: WA palaeochannel uranium (sample)"];
  assert.equal(recoveryTabNames(names), "Recovered: Untitled project ×35, Recovered: WA palaeochannel uranium (sample)");
});

test("a few distinct names are listed as before; more than three groups end with an ellipsis", () => {
  assert.equal(recoveryTabNames(["A", "B"]), "A, B");
  assert.equal(recoveryTabNames(["A", "B", "C", "D", "D"]), "A, B, C, …");
  assert.equal(recoveryTabNames([]), "");
});

test("the banner uses it", () => {
  assert.match(fs.readFileSync("src/App.jsx", "utf8"), /names: recoveryTabNames\(recovery\.otherTabs\)/);
});
