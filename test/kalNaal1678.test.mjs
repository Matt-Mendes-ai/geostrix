// TASKS.csv #1678 — the molar K/Al vs Na/Al diagram
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAGRAMS } from "../src/lib/geochemDiagrams.js";

test("minerals land on their nodes", () => {
  const d = DIAGRAMS.kal_naal, u = { K: "%", Na: "%", Al: "%" };
  // K-feldspar KAlSi3O8: K 14.05 %, Al 9.69 % -> K/Al 1; albite NaAlSi3O8: Na 8.77 %, Al 10.29 % -> Na/Al 1
  const ksp = d.project({ values: { K: 14.05, Na: 0, Al: 9.69 } }, u), ab = d.project({ values: { K: 0, Na: 8.77, Al: 10.29 } }, u);
  assert.ok(Math.abs(ksp.y - 1) < 0.01 && ksp.x === 0, JSON.stringify(ksp));
  assert.ok(Math.abs(ab.x - 1) < 0.01 && ab.y === 0, JSON.stringify(ab));
  // muscovite KAl3Si3O10(OH)2: K 9.82 %, Al 20.32 % -> K/Al 1/3
  assert.ok(Math.abs(d.project({ values: { K: 9.82, Na: 0, Al: 20.32 } }, u).y - 1 / 3) < 0.01);
  assert.equal(d.project({ values: { K: 1, Na: 1 } }, u), null);
  assert.deepEqual(d.nodes.map((n) => n.label), ["K-feldspar / biotite", "muscovite / sericite", "albite", "kaolinite"]);
});
