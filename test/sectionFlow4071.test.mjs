// TASKS.csv #4071 — the guided 3-step georeferencing flow (Figure, Points, Place). Made-up numbers (the mock Mock Creek sections: eastings 534,000-535,200, a line at
// 6,312,000 N, elevations 700-1,300), each worked by hand. What is pinned: what the typed numbers say, which line follows, the one recommended saved section, the one
// short hint, and that EVERY capability of the old dialog is still reachable (Move, RL offset, datum, 2 and 3+ point fits, a reversed figure, a drawn or a typed line).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectExtent, detectHKind, sectionLineFor, nearestSection, flowHint } from "../src/lib/sectionGeorefFlow.js";
import { fitSectionTransform, sectionFitSummary, sectionImageCorners, moveSectionImage, sectionLine } from "../src/lib/sectionGeoref.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const collars = [{ x: 534400, y: 6312000 }, { x: 534600, y: 6312000 }, { x: 534800, y: 6312150 }, { x: 534500, y: 6312450 }];
const sections = [{ id: "s1", name: "L1", ax: 534000, ay: 6312000, bx: 535200, by: 6312000 }, { id: "s4", name: "L4", ax: 534000, ay: 6312450, bx: 535200, by: 6312450 }];
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("#4071 the values are detected from the numbers: eastings, northings or distances, with or without the project's frame", () => {
  const ext = projectExtent({ collars, sections });
  assert.ok(ext.x[0] < 534000 && ext.x[1] > 535200 && ext.y[0] < 6312000 && ext.y[1] > 6312450);
  assert.equal(detectHKind(["534000", "535200"], ext), "easting");
  assert.equal(detectHKind(["6312000", 6312450], ext), "northing");
  assert.equal(detectHKind(["0", "1200"], ext), "distance");
  assert.equal(detectHKind(["534000", "535200"], null), "easting", "six digits");
  assert.equal(detectHKind(["6312000"], null), "northing", "seven digits");
  assert.equal(detectHKind(["0", "850"], null), "distance");
  assert.equal(detectHKind(["", "abc"], ext), null, "nothing usable typed yet");
  assert.equal(projectExtent({}), null);
});

test("#4071 eastings alone give an east-west line at ONE typed northing; northings alone a north-south line at one easting", () => {
  const pts = [{ px: 100, h: "534000" }, { px: 1900, h: "535200" }];
  const r = sectionLineFor({ hKind: "easting", points: pts, cross: "6312000" });
  assert.equal(r.via, "cross"); near(r.line.a.x, 534000); near(r.line.a.y, 6312000); near(r.line.b.x, 535200); near(r.line.azimuth, 90);
  assert.equal(sectionLineFor({ hKind: "easting", points: pts, cross: "" }).need, "cross", "the northing is asked for");
  const n = sectionLineFor({ hKind: "northing", points: [{ px: 1, h: "6312000" }, { px: 2, h: "6312450" }], cross: "534000" });
  near(n.line.azimuth, 0); near(n.line.a.x, 534000); near(n.line.b.y, 6312450);
  // the placement itself: two corners of the figure, as the old dialog computed it
  const fit = fitSectionTransform([{ px: 100, py: 900, hKind: "easting", h: 534000, z: 700 }, { px: 1900, py: 100, hKind: "easting", h: 535200, z: 1300 }], r.line);
  const c = sectionImageCorners(fit, r.line, 2000, 1000); // top-left
  near(c[0][0], 534000 - 100 * (1200 / 1800), 1e-6); near(c[0][1], 6312000); near(c[0][2], 700 + 900 * (600 / 800), 1e-6);
  assert.equal(fit.kind, "scale");
});

test("#4071 an easting AND a northing on the points give the line itself: nothing is asked, left of the figure first", () => {
  const pts = [{ px: 1800, h: "534800", h2: "6312600" }, { px: 200, h: "534000", h2: "6312000" }];
  const r = sectionLineFor({ hKind: "easting", points: pts, cross: "" });
  assert.equal(r.via, "points"); assert.equal(r.need, null);
  near(r.line.a.x, 534000); near(r.line.a.y, 6312000); near(r.line.b.x, 534800); near(r.line.b.y, 6312600);
  near(r.distances[1], 0); near(r.distances[0], 1000); // 3-4-5: 800 east, 600 north = 1000 m
  assert.equal(sectionLineFor({ hKind: "distance", points: pts }).need, "line", "distances alone need a line");
  assert.ok(sectionLineFor({ hKind: "easting", points: [{ px: 1, h: "5", h2: "5" }, { px: 2, h: "5", h2: "5" }] }).error, "two points on one spot cannot make a line");
});

test("#4071 the recommended saved section is the one nearest the holes", () => {
  assert.equal(nearestSection(sections, collars).id, "s1", "three of the four holes lie on or near L1");
  assert.equal(nearestSection(sections, []).id, "s1", "no holes: the first");
  assert.equal(nearestSection([], collars), null);
});

test("#4071 one short hint, in the order a person fixes things", () => {
  assert.deepEqual(flowHint({ rows: [{ h: "1", z: "2" }] }), { id: "two" });
  assert.deepEqual(flowHint({ rows: [{ h: "1", z: "2" }, { h: "", z: "3" }], hKind: "easting" }), { id: "value", n: 2 });
  assert.deepEqual(flowHint({ rows: [{ h: "1", z: "2" }, { h: "3", z: "" }], hKind: "easting" }), { id: "elevation", n: 2 });
  assert.deepEqual(flowHint({ rows: [{ h: "1", z: "2" }, { h: "3", z: "4" }], hKind: "easting", need: "cross" }), { id: "northing" });
  assert.deepEqual(flowHint({ rows: [{ h: "1", z: "2" }, { h: "3", z: "4" }], hKind: "northing", need: "cross" }), { id: "easting" });
  assert.deepEqual(flowHint({ rows: [{ h: "1", z: "2" }, { h: "3", z: "4" }], hKind: "distance", lineOk: false }), { id: "line" });
  assert.equal(flowHint({ rows: [{ h: "1", z: "2" }, { h: "3", z: "4" }], hKind: "distance", lineOk: true }), null);
});

test("#4071 every capability of the old dialog is still reachable", () => {
  const m = read("src/components/SectionGeorefModal.jsx");
  // 2 points: a scale; 3+ points: a full affine (a rotated scan); a figure drawn looking the other way is placed (mirrored)
  const line = sectionLine({ x: 0, y: 0 }, { x: 1000, y: 0 });
  assert.equal(fitSectionTransform([{ px: 0, py: 0, hKind: "distance", h: 0, z: 100 }, { px: 100, py: 100, hKind: "distance", h: 500, z: 0 }], line).kind, "scale");
  const three = fitSectionTransform([{ px: 0, py: 0, hKind: "distance", h: 0, z: 100 }, { px: 100, py: 10, hKind: "distance", h: 500, z: 90 }, { px: 100, py: 100, hKind: "distance", h: 500, z: 0 }], line);
  assert.equal(three.kind, "affine");
  const rev = fitSectionTransform([{ px: 0, py: 0, hKind: "easting", h: 1000, z: 100 }, { px: 100, py: 100, hKind: "easting", h: 0, z: 0 }], line);
  assert.equal(sectionFitSummary(rev, 100, 100).mirrored, true);
  assert.ok(m.includes("onImport({") && m.includes("corners: sectionImageCorners(fit, line, img.width, img.height)"));
  // the RL offset: typed as the figure's RL, placed at the elevation the terrain and the collars use
  assert.ok(m.includes("z: rlOffset ? Number(p.z) - rlOffset : p.z"));
  assert.ok(m.includes('rlOffset ? tr("RL (m)") : tr("Elevation (m)")'));
  assert.ok(m.includes('tr("Type it as the figure shows, above the datum.")') && m.includes('tr("Type the RL as the figure shows it.")'));
  // Move to another line: one screen, the figure keeps its place along the line
  assert.ok(m.includes("moveSectionImage(moveImage, line)") && m.includes("onMove?.(m.patch, line.name || null)"));
  const im = { id: "i", corners: [[0, 0, 900], [100, 0, 900], [100, 0, 800], [0, 0, 800]], line: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } } };
  const moved = moveSectionImage(im, sectionLine({ x: 0, y: 50 }, { x: 100, y: 50 }));
  assert.deepEqual(moved.patch.corners[1], [100, 50, 900]);
  // a drawn line (two clicks on the plan) and a typed line (its ends)
  assert.ok(m.includes("onDrawn={(a, b) =>") && m.includes('setLineSrc("manual")'));
  assert.ok(m.includes('cell("ax"') && m.includes('cell("by"') && m.includes('tr("Type the ends")') && m.includes('tr("Draw on the plan")'));
  // a saved section; a figure already on the line is said; a figure is never put on a line by default
  assert.ok(m.includes("useState(\"\"); // TASKS.csv #3924") && !m.includes("sections[0].id"));
  assert.ok(m.includes("imagesOnLine(images, line, moveImage?.id)") && m.includes('already stands on this line'));
});

test("#4071 three steps, one on screen at a time, one primary button; the Help card holds the long text", () => {
  const m = read("src/components/SectionGeorefModal.jsx");
  assert.equal((m.match(/gs-btn--primary/g) || []).length, 1, "one primary: Next / Next / Place in 3D / Move are one element");
  for (const t of ['tr("Figure")', 'tr("Points")', 'tr("Place")', 'tr("Next: points")', 'tr("Next: place")', 'tr("Place in 3D")']) assert.ok(m.includes(t), t);
  assert.ok(m.includes("{!moveImage && step === 1 && (") && m.includes("{!moveImage && step === 2 && img && (") && m.includes("{!moveImage && step === 3 && ("));
  assert.ok(m.includes("<details open") && m.includes('tr("How it works")'), "the Help card");
  assert.ok(m.includes('aria-current={on ? "step" : undefined}'), "the step bar");
  // the figure comes first: step 1 loads it; the line is no longer asked up front
  assert.ok(!m.includes("1. Where is this section on the map?"));
  const strings = [...m.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  assert.ok(strings.every((s) => s.split(/\s+/).length <= 14), "no sentence over 14 words: " + strings.filter((s) => s.split(/\s+/).length > 14).join(" | "));
  // the mount is unchanged
  const vm = read("src/modules/ViewerModule.jsx");
  assert.ok(/<SectionGeorefModal sections=\{sections\} rlOffset=\{rlOffsetOf\(project\)\} onClose=\{\(\) => setSectionGeorefOpen\(false\)\} collars=\{collars\} images=\{sectionImages\}/.test(vm));
});

test("#4071 its messages are in every language", () => {
  const m = read("src/components/SectionGeorefModal.jsx");
  const keys = [...m.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)].map((x) => x[1].replace(/\\"/g, '"'));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`src/locales/${l}.json`));
    const missing = keys.filter((k) => !d[k]);
    assert.deepEqual(missing, [], l);
  }
});
