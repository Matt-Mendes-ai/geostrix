// TASKS.csv #547 — outcrop dip directions / strikes from true or magnetic north to grid north.
import test from "node:test";
import assert from "node:assert/strict";
import { bearingsToGrid, northRefText, azimuthToGridOffset, loadIgrf } from "../src/lib/azimuthRef.js";

const rows = [{ x: 420000, y: 6260000, dipDir: 90, strike: 0, dip: 60 }, { x: 420050, y: 6260050, dipDir: 355, strike: 265, dip: 40 }, { x: NaN, y: 0, dipDir: 10, dip: 5 }];

test("#547 grid north leaves rows alone", () => {
  assert.equal(bearingsToGrid(rows, "grid", 3156).rows, rows);
});

test("#547 true and magnetic north: every bearing turned by that location's offset, strike with it", async () => {
  await loadIgrf();
  for (const [ref, date] of [["true", null], ["magnetic", "2021-06-19"]]) {
    const o = azimuthToGridOffset(ref, 420000, 6260000, 3156, date);
    const r = bearingsToGrid(rows, ref, 3156, date);
    assert.equal(r.converted, 2); assert.equal(r.failed, 1); // no location -> left as is, counted
    assert.ok(Math.abs(r.rows[0].dipDir - ((90 + o.offset + 360) % 360)) < 0.006);
    assert.ok(Math.abs(r.rows[0].strike - ((0 + o.offset + 360) % 360)) < 0.006);
    assert.ok(Math.abs(r.rows[1].dipDir - ((355 + o.offset + 360) % 360)) < 0.006); // wraps past 360
    assert.equal(r.rows[2], rows[2]);
    assert.equal(rows[0].dipDir, 90); // input not mutated
    if (ref === "magnetic") { assert.ok(o.declination > 15 && o.declination < 20, String(o.declination)); assert.match(northRefText(ref, date, r.example), /IGRF-14 at 2021-06-19: declination \+1\d\.\d\d°/); }
  }
});
