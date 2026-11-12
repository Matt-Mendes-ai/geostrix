// TASKS.csv #2836 / #2844 (GSC geophysics review) — the proposed contour levels followed a soil-geochemistry rule on every grid: the upper
// tail of the POSITIVE values, so a Bouguer grid (all negative) got none and a magnetic grid no lows, while the tooltip said 'the grid's
// percentiles'. A field grid now gets a round interval across its 2–98 % range (the zero line on a signed grid); geochemistry keeps its rule,
// worded honestly; the box takes 'every 5'. SYNTHETIC grids only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldContourLevels, levelsEvery, everyInterval, p2p98 } from "../src/lib/gridContourLevels.js";
import { suggestedContourLevels } from "../src/lib/sampleGrid.js";

// a deterministic grid of n values evenly spread over [lo, hi]
const ramp = (lo, hi, n = 1001) => Float32Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

test("a Bouguer grid, all negative: the old rule proposed nothing; now round levels across its 2–98 % range", () => {
  const g = ramp(-60, -10);
  assert.deepEqual(suggestedContourLevels(g), []); // the bug
  const f = fieldContourLevels(g);
  assert.equal(f.interval, 5);
  assert.equal(f.levels[0], -55);
  assert.equal(f.levels.at(-1), -15);
  assert.ok(f.levels.every((v) => v < 0));
});

test("a signed magnetic grid: lows and highs, with the zero line", () => {
  const g = ramp(-300, 700);
  const f = fieldContourLevels(g);
  assert.ok(f.levels.includes(0));
  assert.ok(f.levels[0] < 0 && f.levels.at(-1) > 0);
  assert.equal(f.interval, 100);
  // the old rule: four levels, all in the positive tail
  assert.ok(suggestedContourLevels(g).every((v) => v > 400));
});

test("'every N' and its limits", () => {
  assert.equal(everyInterval("every 5"), 5);
  assert.equal(everyInterval(" Every 0.5 "), 0.5);
  assert.equal(everyInterval("5, 10"), null);
  assert.equal(everyInterval("every 0"), null);
  assert.deepEqual(levelsEvery(0.5, -1.2, 1.1), [-1, -0.5, 0, 0.5, 1]);
  assert.deepEqual(levelsEvery(1, 0, 1000), []); // too many: refused, not truncated
  assert.deepEqual(p2p98([NaN, 1, 2, 3]), [1, 3]);
  assert.equal(fieldContourLevels(new Float32Array([4, 4, 4])), null); // flat grid
});

test("wired: geochemistry keeps its rule; any other grid the interval; tooltips say which", () => {
  const c = readFileSync(new URL("../src/components/GridContourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /values && !raster\.geochem \? fieldContourLevels\(values\) : null/);
  assert.match(c, /field \? field\.levels : suggestedContourLevels\(values\)/);
  assert.match(c, /every \? \(r98 \? levelsEvery\(every, r98\[0\], r98\[1\]\) : \[\]\)/);
  assert.match(c, /percentiles of the grid's positive values/);
  assert.match(c, /across the grid's 2–98 % range/);
  assert.match(c, /du: unit \? " " \+ unit : ""/); // never 'every 2 the grid's unit'
  assert.doesNotMatch(c, /blank: the grid's 75th/);
});
