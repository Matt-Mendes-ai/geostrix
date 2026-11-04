// TASKS.csv #1880 — a waste dump / stockpile from a footprint, a crest and an angle of repose
import test from "node:test";
import assert from "node:assert/strict";
import { dumpFromFootprint, looseTonnes } from "../src/lib/dumpDesign.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

const square = [[0, 0, 1000], [100, 0, 1000], [100, 100, 1000], [0, 100, 1000]];

// a dump within distance d of a square footprint of side a, falling 1:1 from h at the edge: the area at distance d is
// (a + 2d)^2 - (4 - pi) d^2 (rounded corners), so the volume is the integral of that over d from 0 to h
function squareDumpVolume(a, h) { let v = 0; const n = 2000; for (let k = 0; k < n; k++) { const d = ((k + 0.5) / n) * h; v += ((a + 2 * d) ** 2 - (4 - Math.PI) * d * d) * (h / n); } return v; }

test("flat ground, 45 degrees: the toe reaches the crest height out, the volume matches the integral, the solid is closed", () => {
  const r = dumpFromFootprint(square, { crestZ: 1020, reposeDeg: 45, flatZ: 1000 });
  assert.ok(Math.abs(r.toeReach - 20) < 1e-9); assert.ok(Math.abs(r.maxHeight - 20) < 1e-9);
  assert.ok(Math.abs(r.footprintArea - 10000) < 10000 * 0.03, `footprint ${r.footprintArea}`);
  const expect = squareDumpVolume(100, 20);
  assert.ok(Math.abs(r.volume - expect) < expect * 0.02, `volume ${r.volume} vs ${expect}`);
  assert.ok(Math.abs(r.meshVolume - r.volume) < r.volume * 0.02, `mesh ${r.meshVolume}`);
  assert.ok(isMeshClosed(r.positions, r.indices).closed);
  assert.equal(r.aboveCrestShare, 0);
});

test("a sloping ground: the toe runs farther downhill, and a footprint partly above the crest is reported", () => {
  const g = (x, y) => 1000 + x * 0.1; // rising east
  const r = dumpFromFootprint(square, { crestZ: 1005, reposeDeg: 40, groundAt: g }); // the ground under the footprint runs 1,000 to 1,010
  assert.ok(r.aboveCrestShare > 0.4 && r.aboveCrestShare < 0.6, `above crest ${r.aboveCrestShare}`); // the east half of the footprint is above 1,005
  assert.ok(isMeshClosed(r.positions, r.indices).closed);
  // the west toe lies farther out than the east toe: the dump cells' x extent is wider to the west of the footprint
  const xs = []; for (let i = 0; i < r.positions.length; i += 3) xs.push(r.positions[i]);
  assert.ok(Math.min(...xs) < -4 && Math.min(...xs) > -10 && Math.max(...xs) < 100 + 2 * r.cell, `x ${Math.min(...xs)} to ${Math.max(...xs)}`); // 5 m / tan 40 = 6 m west, nothing east
  assert.ok(Math.abs(looseTonnes(1000, 2.6, 1.3) - 2000) < 1e-9);
  assert.equal(dumpFromFootprint(square, { crestZ: 990, reposeDeg: 45, flatZ: 1000 }).volume, 0, "a crest below the ground holds nothing");
});
