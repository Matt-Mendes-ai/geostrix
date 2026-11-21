// TASKS.csv #3918 — the start dialogs' follow-ups: screen 3's next-steps card with the data check's line, the place picker for a terrain with no
// coordinate system, "What is this?" for a file the import can't place, and Maps > Terrain's UTM-zone check shared with "make one for me".
// SYNTHETIC names and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qcLine, parseEpsgInput, whatIsThis } from "../src/lib/startChecklist.js";
import { MISFIT_ZONE_M } from "../src/lib/srtmFetch.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const d = read("../src/components/StartDialogs.jsx");

test("#3918 the data check's line: fine, or how many things to look at (notes do not count)", () => {
  assert.equal(qcLine({ error: 0, warning: 0, info: 7 }), "Check my data: your data looks fine.");
  assert.equal(qcLine({ error: 1, warning: 0 }), "Check my data: 1 thing to look at. Data QC on the StrixViewer ribbon lists it.");
  assert.equal(qcLine({ error: 2, warning: 3, info: 1 }), "Check my data: 5 things to look at. Data QC on the StrixViewer ribbon lists them.");
  assert.equal(qcLine(null), null);
});

test("#3918 screen 3: after Done a small card (not a dialog) with the data check, the green Model button and Layout's sheets", () => {
  assert.match(d, /if \(card\) return \( \/\/ #3918/);
  assert.match(d, /const \{ runDataQCSliced \} = await import\("\.\.\/lib\/dataQC\.js"\);/);
  assert.match(d, /setCard\(\{ qc: r \? qcLine\(r\.summary\) : null, checking: false \}\);/);
  assert.match(d, /Model: the green Model button, one step at a time\./); // #3939: three icon lines
  assert.match(d, /Sheet: Layout > Sheets, in one click\./); // #3939
  assert.match(d, /onClick=\{\(\) => \{ goTo\?\.\("layout"\); onClose\?\.\(\); \}\}/);
  assert.doesNotMatch(d.slice(d.indexOf("if (card) return"), d.indexOf("return (\n    <div data-start-dialog")), /aria-modal/);
});

test("#3918 the place picker: the project's coordinate system, or an EPSG code typed in plain words; the terrain re-read through it", () => {
  assert.deepEqual(["32609", "EPSG:32609", "epsg 26917", " 3005 ", "abc", "12", ""].map(parseEpsgInput), [32609, 32609, 26917, 3005, null, null, null]);
  assert.match(d, /setPicker\(parsed\.epsgTag \? null : \{ files: tifs, typed: "", error: null \}\);/);
  assert.match(d, /const parsed = await parseDEMFiles\(picker\.files, epsg, String\(code\), \{\}\);/);
  assert.match(d, /if \(!epsg \|\| Number\(code\) === Number\(epsg\)\) \{ if \(!epsg\) setEpsg\(code\);/);
  assert.match(d, /onClick=\{\(\) => pickCrs\(parseEpsgInput\(picker\.typed\)\)\}/);
});

test("#3918 'What is this?': a file the import reads goes in; one it can't place says what this step reads and where it might go", () => {
  for (const n of ["collars.csv", "assays.xlsx", "geology.zip", "map.gpkg", "dem.tif", "mag.gxf", "pit.dxf", "core.las", "ore.obj", "dem.tfw"]) assert.equal(whatIsThis(n), null, n);
  const png = whatIsThis("photo.png");
  assert.match(png.text, /^photo\.png: GeoStrix can't tell what this is\. Here GeoStrix reads tables/);
  assert.match(png.where, /Layout puts pictures on a page/);
  assert.match(whatIsThis("logs.txt").where, /save it as CSV or \.xlsx/);
  assert.match(whatIsThis("old.geostrix.json").where, /open it with Open/);
  assert.match(whatIsThis("mystery.bin").where, /Geophysics tab/);
  const gdb = whatIsThis("survey.gdb");
  assert.ok(gdb && gdb.where === null && /cannot read/.test(gdb.text), "a known unreadable format keeps its own advice (lib/unreadableFormats.js)");
  assert.match(d, /const odd = files\.map\(\(file\) => \(\{ file, \.\.\.\(whatIsThis\(file\.name\) \|\| \{\}\) \}\)\)\.filter\(\(x\) => x\.text\);/);
  assert.match(d, /onClick=\{\(\) => \{ sendFiles\(\[u\.file\]\); setUnplaced/);
  assert.equal((d.match(/requestModuleAction\(/g) || []).length, 1, "still the one import entry");
});

test("#3918 'make one for me' runs Maps > Terrain's own UTM-zone check (shared, not copied), with the same threshold", () => {
  assert.equal(MISFIT_ZONE_M, 100);
  assert.match(d, /const \{ collarGroundMisfit, findBetterUtmZone, MISFIT_ZONE_M \} = await import\("\.\.\/lib\/srtmFetch\.js"\);/);
  assert.match(d, /if \(better\) \{ setZoneAsk\(\{ better, misfit, parsed \}\); return; \}/);
  assert.match(d, /setEpsg\(code\); setZoneAsk\(null\); makeGround\(code\);/);
  assert.doesNotMatch(d, /neighbourUtmZones|fetchSRTMTerrain/, "no copy of the search");
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /if \(misfit && misfit\.medianDz > MISFIT_ZONE_M\) \{/);
  assert.doesNotMatch(g, /misfit\.medianDz > 100\b/);
});
