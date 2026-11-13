// TASKS.csv #3112 (split from #2917, WA iron) — 'Add unit volumes' built the unit under a run's last top as a body although nothing models
// its base (it runs to the model box's floor). It is left out unless the user asks, and when built it is named for what it is.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isOpenUnit, openUnitText } from "../src/lib/viewer/openUnitVolume.js";

test("the open unit is the run's lowest unit as #2917 records it", () => {
  const ob = { unit: "TNAM", top: "Top of TNAM", floorRL: 340 };
  assert.equal(isOpenUnit(ob, "TNAM"), true);
  assert.equal(isOpenUnit(ob, "BIF"), false);
  assert.equal(isOpenUnit(null, "TNAM"), false);
  assert.equal(isOpenUnit({ unit: null }, "null"), false);
});

test("its name, tooltip and note say 'below Top of X, to the box floor at RL n' (no RL in a trend's warped frame)", () => {
  const t = openUnitText({ unit: "TNAM", top: "Top of TNAM", floorRL: 340 }, "TNAM", "stack Top of TNAM", "13 Nov 14:02");
  assert.equal(t.where, "below Top of TNAM, to the box floor at RL 340");
  assert.equal(t.name, "TNAM volume, below Top of TNAM, to the box floor at RL 340 (Top of TNAM, 13 Nov 14:02)");
  assert.match(t.tip, /^TNAM: no base modelled — this solid is everything below Top of TNAM, to the box floor at RL 340, not the unit's own body$/);
  assert.equal(openUnitText({ unit: "X", top: "Top of X", floorRL: null }, "X", "m", "w").where, "below Top of X, to the box floor");
});

test("wiring: addUnitVolumes asks before building the open unit, names it, and says when it was left out", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const f = v.slice(v.indexOf("const addUnitVolumes = async () => {"), v.indexOf("// TASKS.csv #1139 — the undrilled zones of a unit"));
  assert.match(f, /const ob = lb\.openBelow, openLabel = lb\.block\.labels\.find\(\(l\) => l != null && isOpenUnit\(ob, l\)\)/);
  assert.match(f, /const \{ isOpenUnit, openUnitText \} = await import\("\.\.\/lib\/viewer\/openUnitVolume\.js"\);/, "loaded on use, not at startup");
  assert.match(f, /const withOpen = openLabel != null && window\.confirm\(tr\("\{unit\} has no modelled base: /);
  assert.match(f, /if \(ot && !withOpen\) return;/);
  assert.match(f, /name: ot \? ot\.name : /);
  assert.match(f, /notice\("\{unit\} was left out: no base is modelled/);
  assert.match(f, /if \(openLabel == null \|\| withOpen\) setNotices/, "no 'no modelled unit cells' notice when the open unit was the only one and left out");
});
