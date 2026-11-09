// TASKS.csv #2221 (review #2174, WA gold) — 'Between holes only' takes its lag from the drill-site spacing, and a run whose lags stop short
// of that spacing says so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteSpacingLag, lagsShortOfSpacing } from "../src/lib/variogram.js";
import { holeSpacingSummary } from "../src/lib/holeSpacing.js";

// four underground sites (fans of 3 holes each, collars 0.5 m apart) 45, 45 and 226 m from each other
const sites = [[0, 0], [45, 0], [90, 0], [316, 0]];
const collars = sites.flatMap(([x, y], s) => [0, 0.5, 1].map((d, k) => ({ hole_id: `S${s}H${k}`, x: x + d, y })));

test("the site spacing, not the fan's collar spacing", () => {
  const sp = holeSpacingSummary(collars);
  assert.equal(sp.sites, 4);
  assert.ok(Math.abs(sp.nearestM - 45) < 1 && Math.abs(sp.farthestM - 226) < 1, JSON.stringify(sp));
  const s = siteSpacingLag(sp);
  assert.equal(s.lag, Math.round(sp.medianM / 2)); // half the typical site spacing (23 m here, not 4.6 m)
  assert.ok(s.lag * s.nLags >= sp.farthestM, `${s.lag} x ${s.nLags}`);
  assert.equal(siteSpacingLag(null), null);
});

test("the note: 12 lags of 5 m (60 m) stop short of 45 m-apart sites' typical spacing only when shorter", () => {
  const sp = { sites: 26, nearestM: 27, medianM: 45, farthestM: 226 };
  assert.equal(lagsShortOfSpacing(5, 8, sp), true); // 40 m < 45 m
  assert.equal(lagsShortOfSpacing(5, 12, sp), false); // 60 m reaches the typical spacing
  assert.equal(lagsShortOfSpacing(5, 8, null), false);
});

test("the modal uses them for Between holes only and says where the lag came from", () => {
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /const site = holeMode === "between" \? siteSpacingLag\(spacing\) : null;/);
  assert.match(v, /suggested \{suggested\} m from the drill-site spacing/);
  assert.match(v, /lagsShortOfSpacing\(result\.lag, result\.nLagsUsed, result\.spacing\)/);
});
