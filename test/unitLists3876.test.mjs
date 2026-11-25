// TASKS.csv #3876 — #3780 / #3767's lists (one entry per unit; the Alteration lithology list offers groups) and #3771's thickness (the vein solid's
// measure for a steep pair; the true thickness at the holes where both walls are picked). Synthetic data, made-up hole ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interceptThickness } from "../src/lib/veinSolid.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

// two parallel walls dipping 75° towards the east, 10 m apart across them; holes drilled west-dipping at 50° cut both
function wallPicks() {
  const d = (75 * Math.PI) / 180, pole = [Math.sin(d), 0, Math.cos(d)]; // the walls' pole (east and up)
  const top = [], base = [];
  for (let h = 0; h < 6; h++) {
    const y = (h % 3) * 60, hole_id = `DH-23-00${h + 1}`;
    // the hole: from (x0, y, 0) towards the west and down at 50°, two rows of collars across the strike; the walls: pole . p = 0 and pole . p = -10
    const x0 = 100 + 150 * Math.floor(h / 3), dir = [-Math.cos((50 * Math.PI) / 180), 0, -Math.sin((50 * Math.PI) / 180)];
    const at = (k) => { const s = (k - (pole[0] * x0)) / (pole[0] * dir[0] + pole[2] * dir[2]); return { x: x0 + s * dir[0], y, z: s * dir[2], md: s, hole_id }; };
    top.push(at(0)); base.push(at(-10));
  }
  return { top, base };
}

test("the true thickness at the holes where both walls are picked: across the walls, beside the length down the hole", () => {
  const { top, base } = wallPicks();
  const r = interceptThickness(top, base);
  assert.equal(r.holes.length, 6);
  for (const h of r.holes) {
    assert.ok(Math.abs(h.trueM - 10) < 0.01, `${h.hole_id} ${h.trueM}`);
    assert.ok(h.downholeM > 10, String(h.downholeM)); // oblique: longer down the hole
  }
  assert.ok(Math.abs(r.median - 10) < 0.01 && r.min <= r.median && r.max >= r.median);
  assert.deepEqual(r.holes.map((h) => h.hole_id), top.map((p) => p.hole_id)); // by hole id
  // a hole with one wall only is left out; too few picks: nothing
  assert.equal(interceptThickness(top, base.slice(1)).holes.length, 5);
  assert.equal(interceptThickness(top.slice(0, 1), base.slice(0, 1)), null);
});

test("'Thickness between top and base' measures a steep pair as the vein solid does and says it at the holes", () => {
  const src = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.match(src, /const measureThickness = async \(\) => \{\s+const vs = await import\("\.\.\/lib\/veinSolid\.js"\);/);
  assert.match(src, /if \(!r \|\| \(r\.dipDeg != null && r\.dipDeg >= STEEP_DIP_DEG\)\) \{ try \{ solid = vs\.veinSolidFromSurfaces\(top, base\);/);
  assert.match(src, /const at = vs\.interceptThickness\(l\.upper\[0\]\.picks, l\.lower\[0\]\.picks\);/);
  assert.match(src, /measured across the walls as the vein solid measures it/);
});

test("one entry per unit: a group and its Modelling codes twin are listed once; the Alteration lithology list offers the groups", () => {
  const panes = modellingPanesSource();
  assert.match(panes, /const mcodeNames = useMemo\(\(\) => new Set\(\(modellingCodeList \|\| \[\]\)\.map\(\(c\) => c\.name\)\), \[modellingCodeList\]\);/);
  assert.match(panes, /\{lithoGroups\.filter\(\(g\) => !mcodeNames\.has\(g\.name\) && !leftOutCodes\.includes\(g\.name\)\)\.map\(\(g\) => \{/); // Implicit
  assert.match(panes, /lithoGroups\.filter\(\(g\) => !mcodeNames\.has\(g\.name\) \/\* #3876/); // Strat. stack
  assert.match(panes, /!twinInStack\(c\.name\) \/\* #3876 \(#3767\) \*\//);
  assert.match(panes, /altGroups\.map\(\(g\) => <option key=\{g\.name\} value=\{`mcode:\$\{g\.name\}`\}>/);
  assert.match(panes, /tr\("\{code\} \(in the group \{group\}\)"/);
  const sw = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(sw, /tagGroups = \(data\?\.unitTags\?\.groups \|\| \[\]\)\.filter\(\(g\) => !tagCodes\.includes\(g\) && !lithoUnits\.includes\(g\)\)/);
  // the run reads an 'mcode:<group>' target by the rows' effective code (a member's group): the group is one unit there
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(runs, /const isTargetRow = \(r\) => \(isCode \? effectiveCode\(r, modellingCodes, mcodeGroupOf\) === altValue/);
});
