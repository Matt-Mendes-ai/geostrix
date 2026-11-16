// TASKS.csv #3710 — an Atlas with its defaults on a project whose only downhole data are assays and densities (Macpass) made a page per
// hole holding the credit and nothing else: the strip log is built only from logs, and the assay tracks started at 'none'. Now the
// first assay track starts on the element the 3D View shows, the logged density / susceptibility are drawn as the strip-log window
// draws them, and a page that still has no strip log is said (before and after the run).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const collars = [{ hole_id: "JS17-003", x: 0, y: 0, z: 0, length: 120 }, { hole_id: "EZ18-001", x: 10, y: 10, z: 0, length: 80 }];
const layers = { sg: [{ hole_id: "JS17-003", from: 0, to: 10, value: 2.6 }, { hole_id: "JS17-003", from: 10, to: 20, value: 3.1 }] }; // density only: no litho, alteration, veins

test("with no logs and no assay track the strip log is empty (the bug); the logged density gives it a track", () => {
  assert.equal(buildStripLogSvgMarkup({ holeId: "JS17-003", collars, layers }), null);
  const withLogs = buildStripLogSvgMarkup({ holeId: "JS17-003", collars, layers, logTracks: true });
  assert.ok(withLogs?.svg.includes("Density (t/m³)"), "the density track");
  assert.equal(buildStripLogSvgMarkup({ holeId: "EZ18-001", collars, layers, logTracks: true }), null); // a hole with none of it: no page image, said in the notice
});

test("the logged tracks are not added to a strip log unless asked (the window's own and older callers)", () => {
  const before = buildStripLogSvgMarkup({ holeId: "JS17-003", collars, layers: { ...layers, litho: [{ hole_id: "JS17-003", from: 0, to: 20, value: "BAS" }] } });
  assert.ok(before && !before.svg.includes("Density"));
});

test("a depth-only density reading is drawn as a short interval, a non-number is left out", () => {
  const m = buildStripLogSvgMarkup({ holeId: "JS17-003", collars, layers: { sg: [{ hole_id: "JS17-003", depth: 5, value: "2.7" }, { hole_id: "JS17-003", depth: 6, value: "n/a" }] }, logTracks: true });
  assert.ok(m?.svg.includes("Density (t/m³)"));
});

test("wired: the atlas asks for the logged tracks, counts pages with no strip log, defaults the first assay track, says it before", () => {
  const a = read("../src/lib/atlas.js"), m = read("../src/components/GenerateAtlasModal.jsx");
  assert.match(a, /logTracks: true \/\* #3710 \*\//);
  assert.match(a, /noStripLog = includeStripLog && !stripLogFailed && !elements\.some\(isStripLogImage\)/);
  assert.match(m, /viewerUiState\?\.assayDisplayElements/);
  assert.match(m, /return \[shown\[0\] \|\| have\[0\] \|\| "", "", "", "", ""\];/);
  assert.match(m, /const noLog = pages\.filter\(\(pg\) => pg\.noStripLog\)\.length;/);
  assert.match(m, /gradeUnitLabel\(e\.symbol, e\.unit\)/); // 'Ag (g/t)', as the strip-log window's own list
  for (const k of [
    "{n} of the selected holes has no logs and no density, and no assay track is chosen: its page will have no strip log. Choose an assay track above.",
    "{n} of the selected holes have no logs and no density, and no assay track is chosen: their pages will have no strip log. Choose an assay track above.",
    "{n} page has no strip log: that hole has no logs and no density, and no assay track was chosen.",
    "{n} pages have no strip log: those holes have no logs and no density, and no assay track was chosen.",
  ]) { assert.ok(m.includes(JSON.stringify(k)), k.slice(0, 40)); for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`); }
});
