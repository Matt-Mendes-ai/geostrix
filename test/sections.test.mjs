// TASKS.csv #393 — typed section definitions and round-spaced, grid-named fence lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionFromCentre, sectionThroughHole, fenceLines } from "../src/lib/sectionDefs.js";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("sectionFromCentre: east-west line centred on the point", () => {
  const s = sectionFromCentre({ e: 1000, n: 5000, azimuth: 90, length: 400 });
  near(s.ax, 800); near(s.bx, 1200); near(s.ay, 5000); near(s.by, 5000);
  assert.equal(s.azimuth, 90);
  assert.equal(sectionFromCentre({ e: 0, n: 0, azimuth: -90, length: 10 }).azimuth, 270);
});

test("sectionThroughHole: runs along the hole's bearing; vertical hole uses the fallback", () => {
  const s = sectionThroughHole([100, 150, 200], [100, 100, 100]);
  near(s.azimuth, 90); assert.equal(s.vertical, false);
  near((s.ax + s.bx) / 2, 150); near(s.ay, 100);
  const v = sectionThroughHole([100, 100], [100, 100.2], { fallbackAzimuth: 30 });
  assert.equal(v.vertical, true); near(v.azimuth, 30);
  assert.equal(sectionThroughHole([], []), null);
});

test("fenceLines: round spacing covering the span, named by grid line", () => {
  const ns = fenceLines(412330, 412990, 100, 0);
  assert.deepEqual(ns.map((l) => l.name), ["412300E", "412400E", "412500E", "412600E", "412700E", "412800E", "412900E", "413000E"]);
  // every data offset falls inside some slab of width 100 centred on a line
  for (const t of [412330, 412651, 412990]) assert.ok(ns.some((l) => Math.abs(l.t - t) <= 50));
  assert.deepEqual(fenceLines(-6254720, -6254310, 100, 90).map((l) => l.name), ["6254700N", "6254600N", "6254500N", "6254400N", "6254300N"]);
  assert.equal(fenceLines(-10, 10, 50, 45).map((l) => l.name).join(","), "Line 0 m");
});
