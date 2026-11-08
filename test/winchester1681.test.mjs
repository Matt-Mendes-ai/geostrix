// TASKS.csv #1681 — Winchester & Floyd reaches Zr/TiO2 = 1; a plot says how many points lie outside its axes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
import { DIAGRAMS } from "../src/lib/geochemDiagrams.js";
const read = (p) => readRaw(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the axis covers Copley's rhyolites (up to 0.16) and the high-Zr fields", () => {
  const w = DIAGRAMS.winchester;
  assert.deepEqual(w.yRange, [0.0001, 1]);
  const names = w.fields.map((f) => f.name);
  assert.ok(names.includes("Comendite/Pantellerite"));
  const rhy = w.fields.find((f) => f.name === "Rhyolite/Dacite").box;
  assert.equal(Math.max(rhy[0][1], rhy[1][1]), 1);
  const s = { values: { Zr: 260, Ti: 0.1, Nb: 8, Y: 30 } }; // Zr / TiO2 = 260 / (0.1 x 1.6683 x 10^4) = 0.156
  const p = w.project(s, { Zr: "ppm", Ti: "%", Nb: "ppm", Y: "ppm" });
  assert.ok(p.y > 0.1 && p.y < w.yRange[1], String(p.y));
});

test("x-y plots count the points beyond their axes", () => {
  const g = read("src/components/GeochemPlot.jsx");
  assert.match(g, /const offAxis = useMemo\(/);
  assert.match(g, /\{offAxis\.n > 0 && <text/);
});
