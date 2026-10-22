// TASKS.csv #817 — the suggested stratigraphic order of a geological map's units
import test from "node:test";
import assert from "node:assert/strict";
import { classifyUnitRole, suggestPileOrder, fitTracePlane } from "../src/lib/pileOrder.js";

test("#817 roles from the code and description", () => {
  assert.equal(classifyUnitRole("QzDio", "Quartz Diorite"), "intrusion");
  assert.equal(classifyUnitRole("MicDio"), "intrusion");
  assert.equal(classifyUnitRole("DioF", "Diorite Fine"), "intrusion");
  assert.equal(classifyUnitRole("FP", "Feldspar porphyry"), "intrusion");
  assert.equal(classifyUnitRole("HBx", "Hydrothermal Breccia"), "cross-cutting");
  assert.equal(classifyUnitRole("Hfs", "Hornfels"), "other");
  assert.equal(classifyUnitRole("SS", "Sedimentary Sandstone"), "stratigraphic");
  assert.equal(classifyUnitRole("And", "Andesite Volcanics"), "stratigraphic");
});

// three units in east-west bands (C north, B middle, A south), beds dipping NORTH: C is the youngest
const band = (unit, y0, y1) => ({ attributes: { u: unit }, parts: [[[0, y0], [3000, y0], [3000, y1], [0, y1], [0, y0]]] });
const layer = { features: [band("A", 0, 1000), band("B", 1000, 2000), band("C", 2000, 3000)] };
const beds = [];
for (let x = 200; x < 3000; x += 400) for (const y of [900, 1100, 1900, 2100]) beds.push({ x, y, dip: 30, dipDir: 0 });

test("#817 bedding dipping north across E-W contacts: north is younger (C > B > A)", () => {
  const r = suggestPileOrder({ layer, field: "u", bedding: beds });
  assert.deepEqual(r.order, ["C", "B", "A"]);
  const ab = r.pairs.find((p) => [p.a, p.b].sort().join() === "A,B");
  assert.equal(ab.younger, "B");
  assert.ok(ab.agreement > 0.99);
});

test("#817 a contact that follows a mapped fault casts no vote", () => {
  const r = suggestPileOrder({ layer, field: "u", bedding: beds.map((b) => ({ ...b, dipDir: b.y < 1500 ? 180 : 0 })), faults: [[[0, 1030], [3000, 1030]]] });
  const ab = r.pairs.find((p) => [p.a, p.b].sort().join() === "A,B");
  assert.equal(ab.faulted, true);
  assert.equal(ab.weight, 0);
});

test("#817 a contact's own dip from its trace draped on terrain (rule of V's), and its vote", () => {
  // a plane dipping 30° north: z = 1000 - tan30 * y ... the trace of z = ground where ground undulates
  const pts = [];
  for (let x = 0; x <= 1000; x += 20) { const yy = 500 + 80 * Math.sin(x / 120); pts.push([x, yy, 1000 - Math.tan(Math.PI / 6) * yy]); }
  const pl = fitTracePlane(pts);
  assert.ok(Math.abs(pl.dip - 30) < 0.5 && Math.abs(pl.dipDir - 0) < 0.5, JSON.stringify(pl));
  assert.equal(fitTracePlane(pts.map(([x, y]) => [x, 500, 900])), null, "a straight, flat trace fixes no plane");
  // a contact dipping 30° north, z = 1300 - tan30 * (y - 1500), against undulating ground: its map trace is where the two
  // meet (found by bisection for each x), and the ground north of it is ABOVE the contact - the younger unit's side
  const ground = (x, y) => 1300 - 0.05 * (y - 1500) + 60 * Math.sin(x / 150);
  const plane = (y) => 1300 - Math.tan(Math.PI / 6) * (y - 1500);
  const edge = Array.from({ length: 151 }, (_, i) => {
    const x = i * 20;
    let lo = 0, hi = 3000; // ground - plane rises with y
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (ground(x, m) - plane(m) > 0) hi = m; else lo = m; }
    return [x, (lo + hi) / 2];
  });
  const L = { features: [
    { attributes: { u: "Lower" }, parts: [[[0, 0], [3000, 0], ...edge.slice().reverse(), [0, 0]]] },
    { attributes: { u: "Upper" }, parts: [[...edge, [3000, 3000], [0, 3000], edge[0]]] },
  ] };
  const r = suggestPileOrder({ layer: L, field: "u", groundAt: ground });
  const p = r.pairs[0];
  assert.ok(p.trace.planes > 0, "planes fitted");
  assert.equal(p.younger, "Upper", JSON.stringify({ trace: p.trace, planes: p.fittedPlanes.slice(0, 2) }));
  for (const q of p.fittedPlanes) assert.ok(Math.abs(q.dip - 30) < 2 && (q.dipDir < 3 || q.dipDir > 357), JSON.stringify(q)); // each stretch recovers 30° north
});
