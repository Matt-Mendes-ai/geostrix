// TASKS.csv #1618 (review #1497, Lawyers) — a terrain edit that moves no surface sample keeps the same placed list
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const line = src.split("\n").find((l) => l.startsWith("const samePlacement = "));
const samePlacement = new Function(`${line.replace("const samePlacement = ", "return ")}`)();

test("the placed list is reused when no sample moved", () => {
  assert.ok(src.includes("if (prev && prev.src === surfaceSamples && samePlacement(prev.out, next)) return prev.out;"));
  const own = { x: 1, y: 2, z: 3 };
  const a = [own, { x: 5, y: 6, z: 100, zDraped: true }], b = [own, { x: 5, y: 6, z: 100, zDraped: true }];
  assert.equal(samePlacement(a, b), true, "same heights: same placement");
  assert.equal(samePlacement(a, [own, { x: 5, y: 6, z: 101, zDraped: true }]), false, "a new terrain height moves the sample");
  assert.equal(samePlacement(a, [own]), false, "a sample left the terrain");
});

test("the main build still depends only on the placed list, not the terrain", () => {
  assert.match(src, /placedSurfaceSamples \/\* #606 — and the no-drillhole camera anchor \*\/\]\);/);
});
