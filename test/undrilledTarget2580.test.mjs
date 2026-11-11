// TASKS.csv #2580 — Undrilled zones printed each zone's centroid (25-91 m from the point its Plan button hands over), and said nothing when
// the unit was a grade shell closed where its estimate ended. The row now prints the hand-over point, and a closed-off shell is named.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the zone row prints the point handed over, and an artificially closed unit is named", () => {
  const p = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.match(p, /\{z\.target \? tr\("\{i\}\. \{v\}: a hole aims at E \{x\}, N \{y\}, elevation \{z\} \(the zone's point farthest from the drilling\)\."/);
  assert.match(p, /x: Math\.round\(z\.target\.x\)/);
  assert.match(p, /onPlanTo\(z\.target \|\| z\.centre\)/);
  assert.match(p, /\{\(unit\?\.closure === "artificial" \|\| unit\?\.params\?\.closure === "artificial"\) && <div/); // the solids carry it in params
  // the cover default from the drilling stays (#2452)
  assert.match(p, /useState\(\(\) => was\?\.coverM \?\? defaultCoverM\(siteSpacing\)\)/ /* #1732: a restored result\'s own cover first */);
});
