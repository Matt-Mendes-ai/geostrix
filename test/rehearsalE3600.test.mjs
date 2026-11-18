// TASKS.csv #3600 / #3604 / #3605 / #3610 / #3601 / #3602 / #3599 (Fireweed rehearsal, run E) — a positive planned dip is said to point up, the Maps plan keeps its
// set-up and follows the checked holes, the rig sheet's convergence has Maps' sign, the Layout drill plan keeps planned holes under a field term,
// draws a planned hole along its planned trace and tells a never-assayed hole from a barren one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { keptGet, keptSet, planScope } from "../src/lib/planKept.js";
import { publishHoleVisibility, holeVisibilityNow, hiddenIn, checkedOnly } from "../src/lib/holeVisibilityShare.js";
import { filterHoles, filterSuggestion, plannedAsCollars, drillPlanPlanned, traceCaption } from "../src/lib/drillPlan.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3604: the plan's choices are kept per project for the session (keyed by name and collar count)", () => {
  const a = planScope({ name: "Macpass" }, new Array(559)), b = planScope({ name: "Macpass" }, new Array(560));
  assert.notEqual(a, b);
  keptSet(a, "colourBy", "f:prospect");
  assert.equal(keptGet(a, "colourBy"), "f:prospect");
  assert.equal(keptGet(b, "colourBy"), undefined);
  const src = read("../src/components/MapsPlanView.jsx");
  for (const n of ["view", "colourBy", "showIds", "tracesPicked", "colourAt", "shapeBy", "sizeBy", "breaksText"]) assert.match(src, new RegExp(`useKept\\(scope, "${n}"`), n);
});

test("#3605: the checked holes are shared, the plan and a new drill plan follow them", () => {
  const cs = [{ hole_id: "A" }, { hole_id: "B" }, { hole_id: "C" }];
  publishHoleVisibility({ B: false });
  assert.equal(hiddenIn(cs, holeVisibilityNow()), 1);
  assert.deepEqual(checkedOnly(cs, holeVisibilityNow()).map((c) => c.hole_id), ["A", "C"]);
  assert.equal(checkedOnly(cs, {}), cs);
  const f = (c) => ({ x: 1, y: 1, ...c });
  assert.deepEqual(filterHoles(cs.map(f), "", { B: false }).map((c) => c.hole_id), ["A", "C"]);
  publishHoleVisibility({});
  assert.match(read("../src/modules/ViewerModule.jsx"), /useEffect\(\(\) => publishHoleVisibility\(visibleHoles\), \[visibleHoles\]\);/);
  assert.match(read("../src/components/MapsPlanView.jsx"), /Only the \{shown\} of \{total\} holes checked in StrixViewer/);
  const lm = read("../src/modules/LayoutModule.jsx");
  assert.match(lm, /if \(chk\) base\.onlyChecked = true;/);
  assert.match(lm, /checkedOnly\(collars, vis\), \.\.\.plannedAsCollars\(plannedHoles\)/);
});

test("#3610: the rig sheet's convergence is Maps' grid convergence (source pin; the numbers are in core.test.mjs)", () => {
  const r = read("../src/lib/rigExport.js");
  assert.match(r, /convergence_deg: Number\.isFinite\(conv\) \? r2\(-conv\) : ""/);
  assert.match(r, /"true = grid \+ convergence_deg; magnetic = true - declination_deg"/);
});

test("#3601: a planned hole skips field terms and answers id terms; 'prospect=Tom West' suggests prospect=Tom_West", () => {
  const drilled = [{ hole_id: "TS1", x: 1, y: 1, attrs: { prospect: "Tom West" } }, { hole_id: "TS2", x: 2, y: 2, attrs: { prospect: "Jason" } }];
  const planned = plannedAsCollars([{ name: "E-A", x: 3, y: 3, azimuth: 0, dip: 60, length: 100 }, { name: "E-B", x: 4, y: 4, azimuth: 0, dip: 60, length: 100 }]);
  const all = [...drilled, ...planned];
  assert.deepEqual(filterHoles(all, "prospect=Tom_West").map((c) => c.hole_id), ["TS1", "E-A", "E-B"]);
  assert.deepEqual(filterHoles(all, "prospect=Tom_West E-A").map((c) => c.hole_id), ["E-A"], "an id term picks the planned hole; a drilled hole must match the field term AND the id (TS1 has no E-A)");
  assert.equal(filterHoles(all, "E-A").map((c) => c.hole_id).join(), "E-A");
  assert.equal(filterHoles(all, "").length, 4);
  assert.equal(filterSuggestion(drilled, "prospect=Tom West"), "prospect=Tom_West");
  assert.equal(filterSuggestion(drilled, "prospect=Tom_West"), null);
  assert.equal(filterSuggestion(drilled, "prospect=Nowhere Land"), null);
});

test("#3602: a planned hole with lift or drift is drawn along its planned trace, not straight; the caption says which", () => {
  const el = { w: 800, h: 600, scale: 2000, centre: { x: 0, y: 0 } };
  const straight = { name: "E-B", x: 0, y: 0, z: 1000, azimuth: 355, dip: 89.4, length: 882.7 };
  const dev = { ...straight, lift: -2.25, drift: 0 };
  const s = drillPlanPlanned(el, [straight])[0], d = drillPlanPlanned(el, [dev])[0];
  assert.ok(s && d);
  assert.equal(s.deviated, false);
  assert.equal(d.deviated, true);
  const len = (h) => Math.hypot(h.bx - h.ax, h.by - h.ay);
  const dlen = d.path ? Math.hypot(d.path[d.path.length - 1][0] - d.path[0][0], d.path[d.path.length - 1][1] - d.path[0][1]) : len(d);
  assert.ok(dlen > len(s) * 3, `trace ${dlen} vs straight ${len(s)}`);
  assert.match(traceCaption({ planned: 1, plannedDeviated: 1 }), /planned holes along their planned trace/);
  assert.match(traceCaption({ planned: 2, plannedDeviated: 1 }), /where they have lift or drift/);
  assert.match(traceCaption({ planned: 1 }), /planned holes straight from their design/);
});

test("#3599: a never-assayed hole is a dashed grey trace, an assayed hole under the cut-off a solid grey one (source pin)", () => {
  const e = read("../src/components/DrillPlanElement.jsx");
  assert.match(e, /const traceInk = \(s\) => \(s\.cross \? "#8a8f98" : s\.hollow \? "#5f6670" : s\.colour\);/);
  assert.equal((e.match(/stroke=\{traceInk\(styles\.get\(hh\.id\)\)\}/g) || []).length, 2);
  assert.equal((e.match(/strokeDasharray=\{styles\.get\(hh\.id\)\.cross \?/g) || []).length, 2);
});

test("#3600: a positive dip under the Dip field says it points up (source pin)", () => {
  const f = read("../src/components/PlannedHoleParts.jsx");
  assert.match(f, /Number\(draft\.dip\) > 0 && Number\(draft\.dip\) <= 90/);
  assert.match(f, /A positive dip points UP \(negative = down\): this hole would rise from the collar into the air\. For a hole going down at \{d\}°, type -\{d\}\./);
});
