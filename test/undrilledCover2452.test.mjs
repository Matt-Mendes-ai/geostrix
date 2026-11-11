// TASKS.csv #2452 (review #2325, WA uranium) — Undrilled zones' "Covered within" starts at half the drill-site spacing, not 25 m
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultCoverM } from "../src/lib/undrilledZones.js";
import { medianSiteSpacing } from "../src/lib/evidenceSources.js";

test("half the site spacing, to 5 m", () => {
  assert.equal(defaultCoverM(77), 40); // the WA grid: sites 77 m apart along lines
  assert.equal(defaultCoverM(200), 100);
  assert.equal(defaultCoverM(6), 5);
  assert.equal(defaultCoverM(null), 25); // fewer than two sites: as before
});

test("on a 77 m x 200 m grid the spacing is 77 m and the cover 40 m; the pane starts there and says so", () => {
  const collars = [];
  for (let l = 0; l < 4; l++) for (let k = 0; k < 10; k++) collars.push({ x: k * 77, y: l * 200 });
  assert.equal(medianSiteSpacing(collars), 77);
  const s = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.match(s, /useState\(\(\) => was\?\.coverM \?\? defaultCoverM\(siteSpacing\)\)/ /* #1732: a restored result\'s own cover first */);
  assert.match(s, /Drill sites are typically \{s\} m apart/);
});
