// TASKS.csv #867 — which explicit surfaces feed an implicit run of a unit, and with which points (Matt: "feed it
// automatically"): upper contacts of the unit only; picks, section lines tagged with the surface's name, image lines.
import test from "node:test";
import assert from "node:assert/strict";
import { explicitInterfacePoints } from "../src/lib/explicitUnits.js";

const defs = [
  { id: "a", name: "Top of DACT", unit: "DACT", picks: [{ x: 0, y: 0, z: 100 }, { x: 50, y: 0, z: 98 }, { x: 0, y: 50, z: NaN }], lines: [{ imageId: "i", pts: [{ x: 0, y: 100, z: 90 }, { x: 60, y: 100, z: 90 }] }] },
  { id: "b", name: "Base of DACT", unit: "DACT", contact: "lower", picks: [{ x: 0, y: 0, z: 40 }] },
  { id: "c", name: "Top of AND", unit: "AND", picks: [{ x: 0, y: 0, z: 10 }] },
  { id: "d", name: "DACT", picks: [{ x: 9, y: 9, z: 99 }] }, // made before #830: its unit is its name
];
const sections = [{ name: "S1", contacts: [{ unit: "Top of DACT", kind: "contact", isUpperContact: true, points: [{ x: 0, y: 200, z: 80 }, { x: 100, y: 200, z: 80 }] }, { unit: "DACT", kind: "contact", isUpperContact: true, points: [{ x: 0, y: 300, z: 70 }, { x: 10, y: 300, z: 70 }] }] }];

test("#867 upper contacts of the unit feed it; the lower contact is named and left out; other units are not touched", () => {
  const r = explicitInterfacePoints(defs, sections, new Set(["DACT"]));
  assert.deepEqual(r.used.map((u) => u.name), ["Top of DACT", "DACT"]);
  assert.deepEqual(r.lower, ["Base of DACT"]);
  const a = r.used[0].points;
  // 2 finite picks + the 100 m section line densified every 25 m (5 points) + the 60 m image line (4 points)
  assert.equal(a.length, 2 + 5 + 4);
  assert.ok(a.every((p) => Number.isFinite(p.z)));
});

test("#867 section lines the run already took (tagged with a unit name) are not added twice", () => {
  const r = explicitInterfacePoints(defs, sections, new Set(["DACT"]), { sectionLinesTaken: true });
  assert.equal(r.used.find((u) => u.name === "DACT").points.length, 1, "only its pick: its section line is tagged DACT, already in the run");
  assert.equal(r.used.find((u) => u.name === "Top of DACT").points.length, 11, "its own name is not a run tag, so its line still counts");
});
