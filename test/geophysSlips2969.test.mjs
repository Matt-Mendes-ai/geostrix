// TASKS.csv #2969 (WA iron review #2876, geophys-10) — small slips in the Geophysics tab: an ordinal ('every 22th'), the Range boxes read
// coarser than the Stretch beside them, unlabelled icon buttons on a block model's row, a planned grid that opened over its own cap, the
// stored grid convergence's sign not stated, a cell budget that did not say what it costs, and a CRS list that missed the neighbouring zone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitPlannedSpacing, generatePlannedStations, DEFAULT_PLANNED } from "../src/lib/plannedGrid.js";
import { crsCodesForCollars } from "../src/lib/crsForCollars.js";
import { reprojectXY } from "../src/lib/reproject.js";
import { readableValues, rangeText } from "../src/lib/layers.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("the planned grid opens on a spacing its cap accepts; a typed spacing is kept", () => {
  const ext = { xmin: 0, ymin: 0, xmax: 21600, ymax: 17400 }; // the review's 21.6 x 17.4 km field
  assert.equal(generatePlannedStations({ ...ext, ...DEFAULT_PLANNED }).stats.capped, true, "100 x 25 m: about 151,000 stations");
  const fit = fitPlannedSpacing(ext, { ...DEFAULT_PLANNED });
  assert.deepEqual(fit, { line: 400, station: 100 });
  const g = generatePlannedStations({ ...ext, ...DEFAULT_PLANNED, ...fit });
  assert.ok(!g.stats.capped && g.stats.n <= 20000 && g.stats.n > 5000, `${g.stats.n} stations`);
  assert.deepEqual(fitPlannedSpacing(ext, { line: 50, station: 10, dir: "NS" }), {}, "a typed spacing is the user's");
  assert.deepEqual(fitPlannedSpacing({ xmin: 0, ymin: 0, xmax: 2000, ymax: 2000 }, { ...DEFAULT_PLANNED }), {}, "a small field keeps the default");
  assert.deepEqual(fitPlannedSpacing(null, { ...DEFAULT_PLANNED }), {});
  const p = read("components/InversionPanel.jsx");
  assert.match(p, /\{ \.\.\.p, open: true, \.\.\.fitPlannedSpacing\(plannedExtent, p\) \}/);
});

test("the CRS list: the zones the collars reach, not only their centre's (a field across 120° E lists MGA zone 51)", () => {
  // collars in GDA94 / MGA zone 50 at about 22.5 S whose eastern end crosses 120° E
  const collars = [];
  for (let x = 700000; x <= 840000; x += 10000) collars.push({ x, y: 7510000 });
  const east = reprojectXY(840000, 7510000, 28350, 4326), mid = reprojectXY(770000, 7510000, 28350, 4326);
  assert.ok(east.x > 120 && mid.x < 120, `the centre at ${mid.x.toFixed(3)} E, the east end at ${east.x.toFixed(3)} E`);
  const codes = crsCodesForCollars(collars, 28350);
  const z50 = [7850, 28350], z51 = [7851, 28351]; // GDA2020 / GDA94 MGA zones 50 and 51
  assert.ok(z50.includes(codes[0]), `the centre's zone first (${codes[0]})`);
  assert.ok(z51.some((c) => codes.includes(c)), "the neighbouring zone the collars reach");
  assert.ok(Math.min(...z51.map((c) => codes.indexOf(c)).filter((i) => i >= 0)) > Math.max(...z50.map((c) => codes.indexOf(c))), "after the centre's zone");
  assert.deepEqual(crsCodesForCollars([], 28350), []);
  const picker = read("components/CrsPicker.jsx");
  assert.match(picker, /if \(crsSet && projectEpsg\) return crsCodesForCollars\(collars \|\| \[\], projectEpsg\);/);
  assert.match(picker, /\.\.\.\(world\.length \? crsCodesForCollars\(world, tie\.epsg\) : \[\]\)/);
  assert.doesNotMatch(read("lib/projectCrs.js"), /crsCodesForCollars/, "not in the startup bundle (#3159)");
});

test("the Range boxes read at the Stretch's precision; the ordinal is gone; the row's icons are labelled; the budget says its cost; the convergence says its sign", () => {
  // the review's point survey: min 52,986.4 / max 53,168.2 read 53000 / 53200 in the boxes and 52,986 to 53,168 beside them
  const min = 52986.4, max = 53168.2, m = Math.max(Math.abs(min), Math.abs(max));
  assert.deepEqual(readableValues([min, max]), [53000, 53200]);
  assert.deepEqual(readableValues([min, max], Math.max(3, Math.floor(Math.log10(m)) + 1)), [52986, 53168]);
  assert.deepEqual(rangeText(min, max, true), ["52,986", "53,168"]);
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /return readableValues\(\[model\.min, model\.max\], Math\.max\(3, m >= 1 \? Math\.floor\(Math\.log10\(m\)\) \+ 1 : 3\)\);/);
  assert.match(g, /aria-label=\{tr\("Show or hide \{name\}", \{ name: model\.name \}\)\} aria-pressed=\{model\.visible !== false\}/);
  assert.match(g, /title=\{tr\("Edit colour legend \/ range \/ classification"\)\} aria-label=\{tr\("Edit colour legend \/ range \/ classification"\)\}/);
  assert.match(g, /tr\("A model of \{cells\} cells takes about \{gb\} GB of memory while it is open\./);
  const d = read("components/DownholeLogsPane.jsx");
  assert.match(d, /pairs drawn \(one in every \{s\}, and the extremes\)/);
  assert.doesNotMatch(d, /every \{s\}th/);
  for (const f of ["components/InversionPanel.jsx", "modules/RasterModule.jsx"]) assert.match(read(f), /gridConvergenceMeaning: "the bearing of true north measured from grid north \(\+ = east of grid north\); the surveying convergence is the same angle with the opposite sign"/, f);
});
