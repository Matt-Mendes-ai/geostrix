// TASKS.csv #3851 (4) (Matt, 2026-11-20) — a reading with no type is a plain grey dip tick; breccia has its own small cross (map and 3D share the symbol).
import test from "node:test";
import assert from "node:assert/strict";
import { defaultFamily, symbolForReading, symbolGeometry, FAMILIES } from "../src/lib/structureSymbols.js";

test("no type -> the dip tick; breccia by class or word -> the cross; other types as before", () => {
  for (const t of ["", "  ", null, undefined, "unknown", "Untyped", "N/A", "-", "?"]) assert.equal(defaultFamily(t, "other"), "dipTick", String(t));
  assert.equal(defaultFamily("BX", "breccia"), "breccia");
  assert.equal(defaultFamily("Hydrothermal breccia", "other"), "breccia");
  assert.equal(defaultFamily("Foo", "other"), "bedding", "an unrecognised type keeps the plain strike-and-dip fallback");
  assert.equal(defaultFamily("vein", "vein"), "vein");
  assert.equal(defaultFamily("fault", "fault"), "fault");
});

test("the symbols: a tick alone (no strike line) for an inclined untyped reading, a cross for breccia whatever its dip", () => {
  const tickGeo = symbolGeometry(symbolForReading({ type: "", cls: "other", dip: 40 }).symbol);
  assert.equal(tickGeo.segments.length, 1, "one segment: the tick");
  const [u1, v1, u2, v2] = tickGeo.segments[0];
  assert.ok(u1 === 0 && u2 === 0 && v1 === 0 && v2 > 1, "from the point along the dip");
  const a = symbolForReading({ type: "BX", cls: "breccia", dip: 10 }).symbol, b = symbolForReading({ type: "BX", cls: "breccia", dip: 90 }).symbol;
  assert.equal(a, b);
  assert.equal(symbolGeometry(a).segments.length, 2);
  for (const f of ["dipTick", "breccia"]) for (const k of ["inclined", "vertical", "horizontal"]) assert.ok(FAMILIES[f][k]);
});
