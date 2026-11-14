// TASKS.csv #3347 (review #3195, Galore Creek) — a new planned hole was named PLAN-1 on a project numbered GC23-0956 to GC23-0988, and the cost
// was metres times a rate only. The project's next id is offered for a blank name; per-hole and per-new-pad amounts can join the cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextHoleId } from "../src/lib/holeSeries.js";
import { fixedCosts, FIXED_KEYS } from "../src/lib/drillProgram.js";

test("nextHoleId: the commonest series, one past its highest, at its usual width; planned names count", () => {
  const ids = [...Array.from({ length: 33 }, (_, i) => `GC23-${String(956 + i).padStart(4, "0")}`), "CC23-0048", "CC23-0049", "PD23-012", "PD23-013"];
  assert.equal(nextHoleId(ids), "GC23-0989");
  assert.equal(nextHoleId([...ids, "GC23-0989"]), "GC23-0990");
  assert.equal(nextHoleId(["18STRC001", "18STRC002", "19STDD001"]), "18STRC003");
  assert.equal(nextHoleId(["A1", "A9", "A10"]), "A11", "width: the commonest (1 digit), longer numbers kept");
  assert.equal(nextHoleId(["DDH-7", "DDH-12", "RC-3"]), "DDH-13");
  assert.equal(nextHoleId(["Paydirt", "Central"]), null);
  assert.equal(nextHoleId([]), null);
});

test("fixedCosts: per hole and per new pad; a collar on a drilled pad or on an earlier planned one is no new pad", () => {
  const drilled = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
  const planned = [{ x: 3, y: 0 }, { x: 200, y: 0 }, { x: 204, y: 2 }, { x: 900, y: 0 }];
  const r = fixedCosts(planned, drilled, { [FIXED_KEYS.perHole]: 1000, [FIXED_KEYS.perPad]: 25000 });
  assert.deepEqual([r.holes, r.newPads, r.fixed], [4, 2, 4 * 1000 + 2 * 25000]);
  assert.equal(fixedCosts(planned, drilled, {}).fixed, null);
  assert.equal(fixedCosts(planned, drilled, { [FIXED_KEYS.perPad]: 10 }).fixed, 20);
});

test("wiring: the form offers the next id; the checks take per-hole and per-pad amounts; keys", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const nameOffer = useMemo\(\(\) => nextHoleId\(\[\.\.\.\(collars \|\| \[\]\)\.map\(\(c\) => c\.hole_id\), \.\.\.\(plannedSoFar \|\| \[\]\)\.map\(\(h\) => h\.name\)\]\)/);
  assert.match(p, /placeholder=\{nameOffer \? tr\("Hole name \(blank: \{id\}\)", \{ id: nameOffer \}\) : tr\("Hole name \(optional\)"\)\}/);
  assert.match(p, /const fixed = useMemo\(\(\) => fixedCosts\(plannedHoles, collars, rates\), \[plannedHoles, collars, rates\]\);/);
  const keys = ["Hole name (blank: {id})", "Per hole ($)", "Per new pad ($)", "optional", "Fixed: {n} hole(s) × ${h} + {p} new pad(s) × ${c} = ${f}{t}", "; program est. ${t}"];
  for (const k of keys) assert.ok(p.includes(`tr("${k}"`), k);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
