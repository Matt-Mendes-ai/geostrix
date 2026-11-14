// TASKS.csv #3299 (found by side session 4 on master, 2026-11-13; in v0.1.114's tree) — Geochem > Grade stats closed the Geochem tab
// ("Cannot read properties of undefined (reading 'length')") on a project with no saved drill threshold: a trailing comment held the
// loop's out.push, so the loop's body was the return, and the offers memo returned undefined. The push is its own statement again.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the threshold offers loop pushes, then the memo returns the list", () => {
  assert.ok(!/\/\/[^\n]*out\.push\(/.test(src), "no out.push inside a comment");
  // the push straight after the loop head, or on the next line after a comment (both shapes are right; side 4's fix is the first)
  assert.match(src, /\.slice\(0, 4\)\)(?: out\.push\(| \/\/[^\n]*\n\s+out\.push\()\{ key: "t:" \+ o\.key/);
  assert.match(src, /out\.push\(\{ key: "t:"[^\n]*\n\s+return out\.filter\(/);
});

test("no for / if / while in the components has its statement after a trailing comment on the same line", () => {
  // the shape of this bug: `for (...) // note statement;` — everything after // is a comment, and the next line becomes the body
  const bad = src.split("\n").filter((l) => /^\s*(for|if|while)\s*\(.*\)\s*\/\/.*\b(push|return|set[A-Z]\w*)\(/.test(l));
  assert.deepEqual(bad, []);
});
