// TASKS.csv #3379 (#3195, Galore Creek review) — the Stereonet offered 'Add as structural trend' for a mean it had just called 'No preferred
// orientation (k = 2.5, at the level of random planes)', and printed a second verdict ('Weak clustering (k 3.0): a broad set') under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fisherStats } from "../src/lib/stereonet.js";

const src = fs.readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("random planes are flagged, a cluster is not (the condition the button reads)", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const random = Array.from({ length: 107 }, () => ({ dip: (Math.acos(1 - rnd()) * 180) / Math.PI, azimuth: rnd() * 360 })); // SYNTHETIC, like the review's 107 contacts
  assert.equal(fisherStats(random).noPreferred, true);
  const set = Array.from({ length: 30 }, (_, i) => ({ dip: 55 + (i % 5), azimuth: 120 + (i % 7) }));
  assert.equal(fisherStats(set).noPreferred, false);
});

test("the button is disabled with its reason when there is no preferred orientation, not behind a confirm", () => {
  assert.match(src, /const noTrend = !!stats\?\.noPreferred && !isGirdle;/);
  assert.match(src, /disabled=\{isGirdle \|\| pooledTypes \|\| noTrend\}/);
  assert.match(src, /: noTrend \? tr\("Disabled: these picks show no preferred orientation \(k = \{k\}, at the level of random planes\)/);
  assert.ok(!src.includes("Add their mean plane as a structural trend anyway?"));
});

test("one verdict per mean: no 'Weak clustering' line under 'No preferred orientation'", () => {
  const i = src.indexOf('tr("Shape not assessed: the picks are of several types.")');
  const after = src.slice(i, i + 400);
  assert.match(after, /: stats\?\.noPreferred && !isGirdle \? tr\("No shape to speak of: the picks are spread as random planes would be\."\)/);
  assert.ok(after.indexOf("noPreferred") < after.indexOf("Weak / no preferred") || after.indexOf("Weak / no preferred") < 0);
});
