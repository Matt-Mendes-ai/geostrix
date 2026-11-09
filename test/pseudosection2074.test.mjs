// TASKS.csv #2074 — the pre-inversion pseudosection: axes, a colour bar per field, the chargeability view and the convention
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { axisTicks, pseudoColourScale, pseudoFrame } from "../src/lib/pseudosectionPlot.js";
import { pseudoPositions } from "../src/lib/dcip.js";

test("axis ticks fall on a 1-2-5 step inside the range", () => {
  assert.deepEqual(axisTicks(1400, 3600, 5), [1500, 2000, 2500, 3000, 3500]);
  assert.deepEqual(axisTicks(0, 625, 4), [0, 200, 400, 600]);
  assert.deepEqual(axisTicks(5, 5), [5]);
  assert.deepEqual(axisTicks(NaN, 3), []);
});

test("resistivity on a log bar, chargeability on a linear one from zero; bad readings are left out", () => {
  const r = pseudoColourScale([17.7, 50, 224, 0, NaN], "resistivity");
  assert.equal(r.log, true);
  assert.equal(r.lo, 17.7); assert.equal(r.hi, 224);
  assert.equal(r.usable, 3);
  assert.ok(Math.abs(r.labels[1] - Math.sqrt(17.7 * 224)) < 1e-9, "the middle label is the geometric mean");
  assert.equal(r.unit, "ohm·m");
  const c = pseudoColourScale([0.7, 5, 13], "chargeability");
  assert.equal(c.log, false); assert.equal(c.lo, 0); assert.equal(c.hi, 13); assert.equal(c.labels[1], 6.5);
  assert.equal(c.unit, "mV/V");
  assert.equal(pseudoColourScale([NaN], "chargeability"), null);
});

test("the frame maps stations and pseudo-depths inside the margins", () => {
  // pole-dipole: B remote
  const pts = pseudoPositions([[1400, null, 1450, 1500], [1400, null, 1650, 1700], [3500, null, 3550, 3600]]);
  const f = pseudoFrame(pts);
  assert.equal(f.x(f.smin), f.left);
  assert.equal(f.x(f.smax), f.W - f.right);
  assert.equal(f.y(0), f.top);
  assert.equal(f.y(f.dmax), f.H - f.bottom);
  assert.ok(f.sTicks.length >= 3 && f.dTicks.length >= 2);
});

test("the panel draws the toggle, both axes, the colour bar and the convention", () => {
  const src = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const body = src.slice(src.indexOf("function Pseudosection("), src.indexOf("function SectionResult("));
  for (const s of ['tr("Chargeability")', 'tr("Distance along the line (m)")', 'tr("Pseudo-depth (m)")', "sc.bar.map", "Each reading is plotted at the mid-point", "pseudoColourScale(vals, field)"]) {
    assert.ok(body.includes(s), s);
  }
});
