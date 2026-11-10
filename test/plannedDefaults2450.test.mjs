// TASKS.csv #2450 / #2451 (review #2325, WA uranium) — a planned hole starts from the drilling (median dip, azimuth when inclined, length);
// a typed E / N with no Elev is offered the ground there
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drilledDefaults } from "../src/lib/plannedDefaults.js";

test("430 vertical holes 33-93 m deep: dip -90, az 0, about 60 m", () => {
  const collars = Array.from({ length: 430 }, (_, i) => ({ hole_id: `H${i}`, length: 33 + (i * 37) % 61 }));
  const survey = collars.map((c) => ({ hole_id: c.hole_id, depth: 0, azimuth: 0, dip: 90 })); // stored below horizontal (#339)
  const d = drilledDefaults(collars, survey);
  assert.equal(d.dip, -90);
  assert.equal(d.azimuth, 0);
  assert.ok(d.length >= 55 && d.length <= 70, String(d.length));
  assert.equal(d.n, 430);
});

test("inclined holes: their dip and a circular-mean azimuth across north", () => {
  const collars = [355, 5, 10, 350, 0].map((az, i) => ({ hole_id: `I${i}`, dip: 55, azimuth: az, length: 200 + i }));
  const d = drilledDefaults(collars, []);
  assert.equal(d.dip, -55);
  assert.ok(d.azimuth === 0 || d.azimuth === 360 || d.azimuth <= 2, String(d.azimuth));
  assert.equal(d.length, 202);
  assert.equal(drilledDefaults([{ hole_id: "a", length: 10 }], []), null); // too few: the form keeps az 0 / -60 / 100
  // the first survey station counts, not a deeper one
  assert.equal(drilledDefaults([1, 2, 3].map((i) => ({ hole_id: `S${i}`, length: 50 })), [1, 2, 3].flatMap((i) => [{ hole_id: `S${i}`, depth: 40, dip: 70 }, { hole_id: `S${i}`, depth: 0, dip: 60 }])).dip, -60);
});

test("the form seeds from it, keeps the last hole, offers the Elev and says why Add is off", () => {
  const s = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(s, /azimuth: seed\?\.azimuth \?\? 0, dip: seed\?\.dip \?\? -60, length: seed\?\.length \?\? 100/);
  assert.match(s, /azimuth: p\.azimuth, dip: p\.dip, length: p\.length \}\)\); \/\/ #2450/);
  assert.match(s, /const zOffer = useMemo/);
  assert.match(s, /\+ Add hole needs E, N and Elev as numbers/);
});
