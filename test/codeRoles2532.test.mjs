// TASKS.csv #2532 — P set cross-cutting in Modelling codes was still offered first by the Strat. stack (and ran a three-layer cake through
// the pegmatites, P reproduced 0 %), listed twice by the Implicit picker, and auto-numbered into 'stratigraphic' P1 ... P32.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stackRepeats } from "../src/lib/stackOrderFromHoles.js";
import { inheritNumberedRoles } from "../src/lib/modellingCodes.js";

test("alternating units are counted before a stack run", () => {
  const kOf = new Map([["P", 0], ["A", 1], ["D", 2]]);
  const rows = [];
  for (let h = 0; h < 4; h++) { let d = 0; for (const v of ["A", "P", "A", "P", "D", "P", "A"]) { rows.push({ hole_id: `H${h}`, from: d, to: d + 5, value: v }); d += 5; } }
  rows.push({ hole_id: "L1", from: 0, to: 10, value: "A" }, { hole_id: "L1", from: 10, to: 12, value: "A" }, { hole_id: "L1", from: 12, to: 30, value: "D" }); // layered: touching A rows merge
  const r = stackRepeats(rows, kOf, 3);
  assert.equal(r.holes, 5); assert.equal(r.repeating, 4);
  assert.deepEqual(r.byUnit, [4, 4, 0]); assert.equal(r.maxRuns, 3);
  assert.deepEqual(stackRepeats(rows.filter((x) => x.hole_id === "L1"), kOf, 3), { holes: 1, repeating: 0, byUnit: [0, 0, 0], maxRuns: 0 });
});

test("numbered children take the base code's role unless they have their own", () => {
  const codes = inheritNumberedRoles({ codes: [{ name: "P", role: "cross-cutting" }, { name: "P2", role: "stratigraphic" }, { name: "P3" }] }, { a: "P1", b: "P2", c: "P3", d: "P10", e: "PX1", f: "Q1" }, ["P"]);
  const role = Object.fromEntries(codes.map((c) => [c.name, c.role]));
  assert.equal(role.P1, "cross-cutting"); assert.equal(role.P10, "cross-cutting"); assert.equal(role.P3, "cross-cutting");
  assert.equal(role.P2, "stratigraphic", "a role set by hand stays");
  assert.ok(!("PX1" in role) && !("Q1" in role));
  assert.deepEqual(inheritNumberedRoles({ codes: [{ name: "P" }] }, { a: "P1" }, ["P"]), [{ name: "P" }], "no role on the base: nothing to inherit");
});

test("wired: both pickers resolve a raw code's role through Modelling codes and list it once; the stack run asks on repeats", () => {
  const s = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(s, /const rawRole = \(u\) => mcodeRole\.get\(u\) \|\| roleForLithology\(u\);/);
  assert.equal((s.match(/litho_units\)?\.filter\(\(u\) => !mcodeRole\.has\(u\)/g) || []).length, 2); // #2926: the stack's picker sorts first
  assert.match(s, /!isCrossCuttingRole\(rawRole\(u\)\)/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const rep = stackRepeats\(layers\.litho \|\| \[\], kOf, specs\.length\);/);
  assert.match(r, /rep\.holes >= 3 && rep\.repeating >= rep\.holes \/ 2/);
  const p = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(p, /codes: inheritNumberedRoles\(base, assign, numberCodes\)/);
});
