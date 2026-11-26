// TASKS.csv #3948 (Matt, 2026-11-21: "yes fold the samples, delete the dead card. Show Macpass and Mount Raymond") — the empty 3D View's card shows
// Macpass then Mount Raymond, each with its description, Macpass as the filled button; every other sample is under a closed "More samples". And
// RasterModule's own empty card, never shown since it is mounted only inside Maps (#749), is gone with its strings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleCardsFor, sampleListFor, SAMPLES_IN_VIEW, SAMPLE_RANK } from "../src/lib/sampleCards.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ids = (cs) => cs.map((c) => c.id);

test("Macpass is the 3D View's first pick, on every tab but Surface Geology, which leads with its mapping samples (#1120); every offered sample is a row, in the list's order", () => {
  assert.deepEqual(SAMPLES_IN_VIEW, ["yk_macpass", "mount_raymond"]);
  for (const mode of ["viewer", "surface", "modelling", "targeting"]) {
    const cards = sampleCardsFor(mode), { rows, first } = sampleListFor(mode);
    assert.deepEqual(ids(rows), ids(cards).filter((id) => ids(rows).includes(id)), mode); // the list's own order
    assert.equal(rows.length, cards.length, mode + ": no sample dropped");
    assert.equal(first, mode === "surface" ? "qc_rouyn_noranda" : "yk_macpass", mode);
  }
  // the File menu keeps the rank (#3192)
  assert.deepEqual(ids(sampleCardsFor("viewer")), SAMPLE_RANK.filter((id) => ids(sampleCardsFor("viewer")).includes(id)));
});

test("the card (#4094): the samples are one table with one gold button, every row opens through loadSample (a BC sample asks first, #3133)", () => {
  const b = read("../src/modules/viewer/SampleList.jsx");
  assert.match(b, /export default function SampleList\(\{ rows = \[\], first = null, onLoad, loading = false \}\)/);
  assert.match(b, /className="gs-btn gs-btn--primary" data-sample-open=""/);
  assert.equal((b.match(/gs-btn--primary/g) || []).length, 1, "one gold button");
  assert.match(b, /onDoubleClick=\{\(\) => open\(r\)\}/); assert.match(b, /e\.key === "Enter"/);
  assert.match(b, /const open = \(r\) => \{ if \(r && !loading\) onLoad\(r\.id\); \};/);
  const v = read("../src/modules/ViewerModule.jsx");
  const card = v.slice(v.indexOf("<EmptyState\n            onClose={() => setEmptyCardClosed(true)}"), v.indexOf("</EmptyState>", v.indexOf("onClose={() => setEmptyCardClosed(true)}")));
  assert.ok(card.length > 100);
  assert.doesNotMatch(card, /actionLabel=|onAction=/, "no separate filled button: the table's own is the one");
  assert.match(card, /secondary=\{<SampleList key=\{mode\} rows=\{sampleList\.rows\} first=\{sampleList\.first\} onLoad=\{loadSample\} loading=\{sampleLoading\} \/>\}/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.equal(loc["Loading sample project…"], undefined, `${lang}: the old button text is gone`);
  }
});

test("RasterModule has no empty card of its own any more, and its strings are gone from every locale", () => {
  const r = read("../src/modules/RasterModule.jsx");
  assert.doesNotMatch(r, /<EmptyState|EmptyState\.jsx|<DropDiagram|dragOver|ge-main/);
  assert.match(read("../src/modules/MapsModule.jsx"), /\{pane === "raster" && <RasterModule embedded \/>\}/); // its only mount
  const gone = ["No rasters yet", "Import GeoTIFF / GXF…", "Reprojected to the project CRS on import.", "Drop a GeoTIFF or grid here", "A georeferenced image or grid",
    "A GeoTIFF or a grid dropped here is draped over the terrain.", "Drag your GeoTIFF or grid here to start.", "Drop GeoTIFF / .gxf / .grd files to import",
    "Imagery, geology maps and geophysical grids, draped over the terrain in {sv}.", "{rasters} raster loaded", "{rasters} rasters loaded",
    "Pick a georeferenced raster — a GeoTIFF, a Geosoft .gxf grid or a Geosoft / Surfer .grd grid"];
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of gone) assert.equal(loc[k], undefined, `${lang}: ${k}`);
  }
});
