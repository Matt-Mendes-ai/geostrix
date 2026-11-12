// TASKS.csv #3056 — an assay with no classes is labelled "(size = grade)": assays can be drawn along the hole as well as spheres (#2932).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the legend's unclassed assay label does not say sphere", () => {
  const s = fs.readFileSync("src/lib/legendGroups.js", "utf8");
  assert.match(s, /`\$\{sym\} \(size = grade\)`/);
  assert.doesNotMatch(s, /sphere size = grade/);
});
