// TASKS.csv #2514 — Isocon's filter takes a second log condition (AND): fresh pegmatite (rock P and weathering FR) against weathered
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { domainOfInterval } from "../src/lib/domainLayers.js";

test("two logs at the interval's middle, both required", () => {
  const rock = [{ hole_id: "A", from: 0, to: 20, value: "P" }];
  const wx = [{ hole_id: "A", from: 0, to: 8, value: "W" }, { hole_id: "A", from: 8, to: 20, value: "FR" }];
  const r = domainOfInterval(rock), w = domainOfInterval(wx);
  const samples = [{ hole_id: "A", from: 2, to: 3 }, { hole_id: "A", from: 10, to: 11 }, { hole_id: "A", from: 15, to: 16 }];
  const fresh = samples.filter((a) => r(a) === "P" && w(a) === "FR");
  const weathered = samples.filter((a) => r(a) === "P" && w(a) === "W");
  assert.equal(fresh.length, 2);
  assert.equal(weathered.length, 1);
});

test("wired: the second layer / code and the AND in the match", () => {
  const m = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");
  assert.match(m, /const codeOf2 = flt\.code2 && domainRows2 \? codeFn\(domainRows2\) : null;/); // the shared rule since #2766
  assert.match(m, /if \(codeOf2 && codeOf2\(a\) !== flt\.code2\) return false;/);
  assert.match(m, /aria-label=\{tr\("Second layer"\)\}/);
  assert.match(m, /\[rows, flt, domainRows, domainRows2, elementUnits\]/);
});
