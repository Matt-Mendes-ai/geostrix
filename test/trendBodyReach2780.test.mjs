// TASKS.csv #2780 (split from #2538; DECISION 2026-11-12, Matt: 'follow your recommendations') — under a trend, a closed body's automatic
// search took the logged runs' reach as the ellipsoid's long axis, so the ratios shrank it across the layer (5 : 5 : 1: a 4 m search, 0.8 m
// across). Now the runs' reach is the reach across the layer, times the trend's ratio along it, and at least the hole spacing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trendBodyReach } from "../src/lib/trendBodyReach.js";
import { trendSearchScales } from "../src/lib/trend.js";

test("the runs' reach is the reach across the layer; along it, times the ratio, at least the hole spacing", () => {
  const s = trendSearchScales({ ratios: { max: 5, int: 5, min: 1 } });
  const r = trendBodyReach(4, s, 10); // runs give a 4 m search; holes 10 m apart
  assert.equal(r.acrossM, 4); assert.equal(r.alongM, 20);
  assert.equal(r.oldAlongM, 4); assert.ok(Math.abs(r.oldAcrossM - 0.8) < 1e-12, "before: 0.8 m across");
  const far = trendBodyReach(4, s, 76); // WA-like spacing: the hole spacing sets the long axis, and the across reach grows with it
  assert.equal(far.alongM, 76); assert.ok(Math.abs(far.acrossM - 15.2) < 1e-9);
  assert.equal(far.bySpacing, true); assert.equal(r.bySpacing, false); assert.equal(far.runsAcrossM, 4); // the notice says which set the reach
  const flat = trendBodyReach(4, trendSearchScales({ ratios: { max: 1, int: 1, min: 1 } }), 0);
  assert.deepEqual([flat.alongM, flat.acrossM], [4, 4], "a 1 : 1 : 1 trend changes nothing");
  assert.equal(trendBodyReach(0, s, 10), null);
});

test("the run uses it only for a body sized from its logged runs with no typed search, and says the old and new reach", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /if \(anisotropy\.enabled && isCode && autoB\.fromRuns && !\(searchSetting > 0\)\) \{\r?\n\s*const tr2780 = trendBodyReach\(autoB\.radius, scl, autoB\.spacing\);/);
  assert.match(m, /radius = tr2780\.alongM;/);
  assert.equal(m.split("Before, the runs' reach was the long axis: {oldAlong} m along and {oldAcross} m across. A body of {code} saved earlier was built with the old reach and differs from one built now.").length - 1, 2, "both cases say the old reach");
  const call = m.slice(m.indexOf("notice(tr2780.bySpacing ? "), m.indexOf("notice(tr2780.bySpacing ? ") + 1400);
  assert.ok(call.includes("(the {s} m hole spacing, so a node between two holes reaches one)") && call.includes("the logged runs of {code} alone give {runs} m"), "the spacing case says the spacing set the reach");
  assert.ok(call.includes("{across} m across the layer (from the logged runs of {code}) and {along} m along it (that times the trend's ratio)"), "the runs case");
  // the reach is set before the grid's padding and the search radius read it
  assert.ok(m.indexOf("radius = tr2780.alongM;") < m.indexOf("const pad = anisotropy.enabled ? radius * scl.major : radius;"));
});
