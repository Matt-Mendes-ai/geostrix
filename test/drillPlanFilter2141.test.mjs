// TASKS.csv #2141 — the drill plan's hole filter takes collar fields (year=2024) as well as id text, so a program's plan leaves out other
// properties' holes whose ids look alike
import test from "node:test";
import assert from "node:assert/strict";
import { filterHoles, fitDrillPlan } from "../src/lib/drillPlan.js";

const collars = [
  { hole_id: "DH24-01", x: 0, y: 0, attrs: { year: "2024", project: "Woodjam" } },
  { hole_id: "DH24-02", x: 200, y: 100, attrs: { year: "2024", project: "Woodjam" } },
  { hole_id: "RG24-15", x: 300, y: 22000, attrs: { year: "2024", project: "Redgold" } },
  { hole_id: "DH23-09", x: 50, y: 50, attrs: { year: "2023", project: "Woodjam" } },
];

test("id text still works; a field term picks the program", () => {
  assert.deepEqual(filterHoles(collars, "24-").map((c) => c.hole_id), ["DH24-01", "DH24-02", "RG24-15"]);
  assert.deepEqual(filterHoles(collars, "year=2024 project=Woodjam").map((c) => c.hole_id), ["DH24-01", "DH24-02"]);
  assert.equal(filterHoles(collars, "").length, 4);
  assert.equal(filterHoles([{ hole_id: "X" }], "").length, 0); // no coordinates: never drawn
});

test("the fit follows the filter: the Woodjam 2024 program alone fits at a far larger scale", () => {
  const P = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 250000, 500000];
  const all = fitDrillPlan(filterHoles(collars, "24-"), 700, 450, P).scale;
  const prog = fitDrillPlan(filterHoles(collars, "year=2024 project=Woodjam"), 700, 450, P).scale;
  assert.ok(prog < all / 10, `${prog} vs ${all}`);
});
