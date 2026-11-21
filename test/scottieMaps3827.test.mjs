// TASKS.csv #3827 (a boundary's area counted an open line), #3835 (a Common service fetched before the button), #3831 (the collar legend's unit and statistic), #3828 (plan text
// at print size), #3830 (rock samples on the plan; Fit not framed by far ones), #3833, #3836, #3837 (5). Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closedPartsOf } from "../src/lib/areaBoundary.js";
import { boundaryAreaHectares } from "../src/lib/geoprocessing.js";
import { printTextPt, recaptureSpec, PLAN_TEXT_PX } from "../src/lib/planRecapture.js";
import { farSampleCount, planDataExtent, planFarLayers } from "../src/lib/mapsPlan.js";
import { ang, creditSentence } from "../src/lib/projectKmz.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };
const sq = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];

test("#3827 two polygons and a three-point road: the area is the polygons'; the road is counted as left out", () => {
  const b = { polylines: [sq(0, 0, 1000, 1000) /* 100 ha */, sq(2000, 0, 1000, 500) /* 50 ha */, [{ x: 0, y: 3000 }, { x: 1500, y: 3500 }, { x: 3000, y: 3000 }]], closedFlags: [true, true, false] };
  assert.ok(boundaryAreaHectares(b.polylines) > 150.1, "the old rule closes the road into a triangle (75 ha here)");
  const cp = closedPartsOf(b);
  assert.equal(cp.open, 1); assert.equal(cp.polylines.length, 2);
  assert.ok(Math.abs(boundaryAreaHectares(cp.polylines) - 150) < 1e-6);
  assert.deepEqual(closedPartsOf({ polylines: [sq(0, 0, 10, 10)] }).open, 0); // no flags: closed, as before
  assert.equal(closedPartsOf({ polylines: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], closedFlags: [false] }).open, 0); // a two-point line is no area candidate to mention
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const cp = closedPartsOf\(b\), ga = groundArea\(boundaryAreaHectares\(cp\.polylines\), cp\.polylines,/);
  assert.match(g, /\{n\} open line\(s\) not counted/);
  assert.match(read("../src/components/ZonalStatsBox.jsx"), /zonalStats\(raster\.grid, closedPartsOf\(b\)\.polylines/);
  hasKeys(["{n} open line(s) not counted"]);
});

test("#3835 choosing a Common service only fills the URL: no request until Fetch layers", () => {
  const m = read("../src/components/AddWebLayerModal.jsx");
  const onChange = m.match(/aria-label=\{tr\("Common services"\)\}[^\n]*\n\s*onChange=\{([^\n]*)\}>/)[1];
  assert.doesNotMatch(onChange, /fetchCapabilities/);
  assert.match(onChange, /setUrl\(p\[s\]\); wantRef\.current = p\.layer \|\| null;/);
  assert.match(m, /const fetchCapabilities = async \(svc = service, u = url, want = wantRef\.current\) => \{/);
  assert.match(m, /onClick=\{\(\) => fetchCapabilities\(\)\}/); // the button, and Enter in the URL box
  hasKeys(["Choosing a service only fills the URL. Nothing goes online until you press Fetch layers."]);
});

test("#3831 the collar legend says the statistic and the unit as the Grade tools do, on the plan and on the sheet", () => {
  const m = read("../src/components/MapsPlanView.jsx");
  assert.match(m, /const collarTitle = collarHeading\(\);/g);
  assert.equal((m.match(/collarHeading\(\)/g) || []).length >= 3, true);
  assert.match(m, /const unit = assayElements\.find\(\(e\) => e\.symbol === key\)\?\.unit, lbl = unit \? gradeUnitLabel\(key, unit\) : "";/);
  assert.match(m, /tr\("Highest \{el\} in the hole \(\{unit\}, single sample, uncut\)"/);
  assert.match(read("../src/components/HoleValueGridPanel.jsx"), /gradeUnitLabel\(source\.symbol, unit\)/);
  hasKeys(["Highest {el} in the hole ({unit}, single sample, uncut)"]);
});

test("#3828 a plan snapshot's text: its print size, and the plan drawn again at the frame's own size", () => {
  // the review's plan: 1,614 px wide, placed in a 185.2 mm frame (700 layout px)
  const el = { id: "m1", mapsView: true, w: 700, h: 350, targetWorld: { x: 100, y: 200 }, naturalW: 4961, mapsCapture: { mPerPx: 10, cssW: 1614 } };
  assert.equal(PLAN_TEXT_PX, 10);
  assert.ok(printTextPt(el) > 3 && printTextPt(el) < 3.5, String(printTextPt(el))); // about 3 pt
  const s = recaptureSpec(el, 300, { printText: true });
  assert.equal(s.ok, true); assert.equal(s.textPrint, true);
  assert.equal(s.w, 700); assert.equal(s.h, 350);
  assert.ok(Math.abs(s.view.mPerPx - (10 * 1614) / 700) < 1e-9); // the same ground across the frame's width
  assert.equal(s.ratio, 300 / 96);
  // drawn again at that size, the text prints at its screen size: 10 px of a 700 px plan in 700 layout px = 7.5 pt
  assert.equal(printTextPt({ ...el, mapsCapture: { mPerPx: s.view.mPerPx, cssW: s.w } }), 7.5);
  assert.equal(recaptureSpec({ ...el, mapsCapture: undefined }, 300, { printText: true }).reason, "old");
  assert.equal(printTextPt({}), null);
  const c = read("../src/components/MapRedrawControl.jsx");
  assert.match(c, /recaptureSpec\(sel, RECAPTURE_DPI, \{ printText: true \}\)/);
  hasKeys(["Draw it again with the text at print size", "The hole ids and labels on this picture print at about {pt} pt."]);
});

test("#3830 samples far from the drilling do not set Fit; they are counted for the note; the plan draws and switches them", () => {
  const collars = [{ x: 0, y: 0 }, { x: 1000, y: 800 }];
  const samples = [...Array.from({ length: 5 }, (_, i) => ({ x: 200 + i * 50, y: 300 })), ...Array.from({ length: 3 }, (_, i) => ({ x: 400 + i, y: 11000 + i }))]; // 3 of 8 lie ~10 km north
  const f = farSampleCount(samples, collars);
  assert.equal(f.far, 3); assert.ok(f.distM > 10000 && f.distM < 11000);
  assert.deepEqual(farSampleCount(samples, []), { far: 0, distM: 0 });
  const ext = planDataExtent({ collars, surfaceSamples: samples });
  assert.ok(ext[3] < 2000, `the extent's north edge ${ext[3]} is the drilling's, not the samples' 11,000`);
  const far = planFarLayers({ collars, surfaceSamples: samples });
  assert.equal(far.length, 1); assert.equal(far[0].kind, "surface samples"); assert.match(far[0].name, /^3 of 8 surface samples$/);
  assert.deepEqual(planFarLayers({ collars, surfaceSamples: samples.slice(0, 5) }), []);
  const m = read("../src/components/MapsPlanView.jsx");
  assert.match(m, /ctx\.arc\(px, py, r, 0, 6\.2832\)/); assert.match(readFileSync(new URL("../src/lib/sampleMapStyle.js", import.meta.url), "utf8"), /: 2\.5\);/); /* #3883 (#3830): the radius from sampleDotRadius, 2.5 px unless sized */ assert.doesNotMatch(m, /ctx\.fillRect\(X\(s\.x\) - 1, Y\(s\.y\) - 1, 2, 2\)/);
  assert.match(m, /if \(samplesOn\) surfaceSamples\.forEach/); assert.match(m, /aria-label=\{tr\("Show the surface samples on the plan"\)\}/);
  hasKeys(["{far} of {n} surface samples", "Show the surface samples on the plan", "Surface samples ({n})", "Classed by element or field in Geochem › Plan map."]);
});

test("#3833 the drop answer says what is not read and where an X Y Z table goes", () => {
  assert.match(read("../src/modules/RasterModule.jsx"), /An X Y Z table \(\.xyz, \.tx\) goes to Geophysics › Point survey \(or save it as \.csv with a header\)/);
  hasKeys(["{names}: not read here. An X Y Z table (.xyz, .tx) goes to Geophysics › Point survey (or save it as .csv with a header); other formats to Boundaries, Terrain, Web layers or Geological Mapping."]);
});

test("#3836 the KMZ writes angles to two decimals, the credit once, and a sample's own fields", () => {
  assert.equal(ang(106.60342752645522), 106.6); assert.equal(ang("105.714"), 105.71); assert.ok(Number.isNaN(ang("")));
  assert.equal(creditSentence("BC ARIS assessment reports"), " Data: BC ARIS assessment reports");
  assert.equal(creditSentence("Data: BC ARIS assessment reports."), " Data: BC ARIS assessment reports.");
  assert.equal(creditSentence(""), "");
  const k = read("../src/lib/projectKmz.js");
  assert.match(k, /azimuth: ang\(c\.azimuth\), dip: ang\(c\.dip\)/);
  assert.match(k, /\.\.\.Object\.fromEntries\(collarAttrPairs\(s, \["medium", \.\.\.Object\.keys\(s\.values \|\| \{\}\)\]\)\)/);
});

test("#3837 (5) one area figure when the ground and grid areas agree", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.equal((g.match(/ga\.groundHa != null && f\(ga\.groundHa\) !== f\(ga\.gridHa\)/g) || []).length, 2);
});
