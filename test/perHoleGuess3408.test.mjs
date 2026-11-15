// TASKS.csv #3408 (#2399) — a per-hole table with no coordinates whose ids are all existing holes, one row each, is guessed as Collars (a join), not a Custom layer.
// SYNTHETIC calibration table. The rule is checked with the real guessers; the wiring from the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { guessTargetFor, guessMapping } from "../src/lib/layersImport.js"; // TASKS.csv #3590
import { perHoleJoinOf } from "../src/lib/perHoleJoin.js";
const headers = ["Hole_ID", "Probe", "K_factor", "Dead_time_us", "Date_logged"];
const rows = [{ Hole_ID: "H1", Probe: "GR-12", K_factor: "1.02", Dead_time_us: "5.1", Date_logged: "2024-03-01" }, { Hole_ID: "H2", Probe: "GR-12", K_factor: "1.01", Dead_time_us: "5.0", Date_logged: "2024-03-02" }];
const collars = [{ hole_id: "H1", x: 1, y: 2 }, { hole_id: "H2", x: 3, y: 4 }, { hole_id: "H3", x: 5, y: 6 }];
const rule = (target, rws, cs) => { if (target !== "custom") return target; const m = guessMapping("collars", headers); return m.hole_id && !(m.x && m.y) && perHoleJoinOf(rws, m, cs)?.noXY ? "collars" : target; };
test("every id an existing hole, once: Collars; an unknown id or a repeated hole stays as guessed", () => {
  const g = guessTargetFor(headers, "calibration.csv", rows);
  assert.equal(g, "custom", "the guess alone has no route to a join");
  assert.equal(rule(g, rows, collars), "collars");
  assert.equal(rule(g, [...rows, { Hole_ID: "NEW" }], collars), "custom");
  assert.equal(rule(g, [...rows, rows[0]], collars), "custom");
  assert.equal(rule("lithology", rows, collars), "lithology", "only a Custom guess is changed");
});
test("wired at the three guess sites", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.equal((s.match(/perHoleTarget\(guessTargetFor\(/g) || []).length, 3);
  assert.ok(s.includes('perHoleJoinOf(rows, m, importStateRef.current?.collars || [])?.noXY ? "collars" : target'));
});
