// TASKS.csv #3985 — more faults than GemPy takes (6): the ones that matter picked, each with its reason; collinear pieces merged first; the
// fault's type and a dip default from it. Made-up faults and units.
import test from "node:test";
import assert from "node:assert/strict";
import { faultType, faultMajor, dipDefault, mergeCollinear, joinPieces, modelArea, lengthInside, unitPolys, unitsOffset, pickFaults } from "../src/lib/faultPick.js";

const F = (attrs) => ({ attributes: attrs });
test("#3985 the fault's type, major or minor, and the dip a type suggests", () => {
  assert.equal(faultType(F({ desc: "Thrust fault, teeth on hanging wall" })), "thrust");
  assert.equal(faultType(F({ type: "Normal fault" })), "normal");
  assert.equal(faultType(F({ name: "dextral strike-slip" })), "strike-slip");
  assert.equal(faultType(F({ desc: "Fault" })), "fault");
  assert.equal(faultMajor(F({ desc: "Continuous fault mapped across the sheet" })), true);
  assert.equal(faultMajor(F({ desc: "One of several small faults" })), false);
  assert.equal(faultMajor(F({ desc: "Fault" })), null);
  assert.equal(faultMajor(F({ desc: "Continuous fault makes a lineament; appears to be steeply dipping reverse fault" })), true); // 'appears to' is about the dip
  assert.equal(faultMajor(F({ desc: "Thrust fault" })), true);
  assert.equal(faultMajor(F({ desc: "Fault, inferred" })), false);
  assert.deepEqual([dipDefault("thrust"), dipDefault("normal"), dipDefault("fault")], [30, 60, 45]);
});

test("#3985 collinear pieces of one fault are merged (same type, strike within 15 degrees, ends within 200 m) and joined in order", () => {
  const fs = [{ i: 0, type: "thrust", line: [[0, 0], [0, 1000]] }, { i: 1, type: "thrust", line: [[50, 1150], [80, 2500]] }, { i: 2, type: "normal", line: [[0, 1100], [0, 2000]] }, { i: 3, type: "thrust", line: [[2000, 0], [2000, 900]] }];
  assert.deepEqual(mergeCollinear(fs).map((g) => g.sort()), [[0, 1], [2], [3]]);
  assert.deepEqual(joinPieces([[[50, 1150], [80, 2500]], [[0, 1000], [0, 0]]]), [[0, 0], [0, 1000], [50, 1150], [80, 2500]]);
});

test("#3985 the model area, the length inside it, the units a trace offsets", () => {
  assert.deepEqual(modelArea([{ x: 0, y: 0 }, { x: 400, y: 400 }]), [-1000, -1000, 1400, 1400]);
  assert.deepEqual(modelArea([], { bbox: [1, 2, 3, 4] }), [1, 2, 3, 4]);
  assert.equal(Math.round(lengthInside([[-500, 0], [500, 0]], [0, -10, 100, 10])), 100);
  const layer = { features: [{ attributes: { u: "A" }, parts: [[[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]]] }, { attributes: { u: "B" }, parts: [[[1000, 0], [2000, 0], [2000, 1000], [1000, 1000], [1000, 0]]] }] };
  const polys = unitPolys(layer, "u");
  assert.equal(unitsOffset([[1000, 100], [1000, 900]], polys), 1); // along the A | B contact
  assert.equal(unitsOffset([[300, 100], [300, 900]], polys), 0); // inside A
});

test("#3985 the pick: inside the area first, then the longest inside, then the most units offset, then mapped as major; within the limit: no offer", () => {
  const mk = (i, x, len, extra = {}) => ({ i, line: [[x, 0], [x, len]], type: "fault", major: null, ...extra });
  const faults = [mk(0, 100, 900), mk(1, 300, 400), mk(2, 50000, 5000) /* far outside */, mk(3, 500, 400, { major: true }), mk(4, 700, 200), mk(5, 900, 150), mk(6, 1100, 120), mk(7, 1300, 100)];
  const p = pickFaults({ faults, collars: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], max: 6 });
  assert.equal(p.before, 8);
  assert.deepEqual(p.keep.map((e) => e.ids[0]), [0, 3, 1, 4, 5, 6]); // 0 longest; 3 = 1 in length, ahead as mapped major
  assert.deepEqual(p.drop.map((e) => e.ids[0]), [7, 2]); // the outside one last, whatever its length
  assert.equal(p.drop[1].insideM, 0);
  assert.equal(pickFaults({ faults: faults.slice(0, 6), collars: [] }), null);
  // seven pieces of which two are one fault: six faults, so the offer merges them and leaves none out (the engine gets six traces)
  const pieces = [...faults.slice(0, 5), mk(8, 900, 400), { i: 9, line: [[900, 450], [900, 900]], type: "fault", major: null }];
  const m = pickFaults({ faults: pieces, collars: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }] });
  assert.equal(m.before, 6); assert.equal(m.drop.length, 0);
  assert.deepEqual(m.keep.find((e) => e.pieces === 2).ids.sort(), [8, 9]);
});
