// TASKS.csv #3948 (Matt, 2026-11-21: "yes fold the samples, delete the dead card. Show Macpass and Mount Raymond") — the empty 3D View's card shows
// Macpass then Mount Raymond, each with its description, Macpass as the filled button; every other sample is under a closed "More samples". And
// RasterModule's own empty card, never shown since it is mounted only inside Maps (#749), is gone with its strings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleCardsFor, emptyCardSamples, SAMPLES_IN_VIEW, SAMPLE_RANK } from "../src/lib/sampleCards.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ids = (cs) => cs.map((c) => c.id);

test("Macpass then Mount Raymond in view, on every tab; the rest folded, in the list's order; no sample dropped", () => {
  assert.deepEqual(SAMPLES_IN_VIEW, ["yk_macpass", "mount_raymond"]);
  for (const mode of ["viewer", "surface", "modelling", "targeting"]) {
    const cards = sampleCardsFor(mode), { shown, more } = emptyCardSamples(cards);
    assert.deepEqual(ids(shown), ["yk_macpass", "mount_raymond"], mode);
    assert.deepEqual(ids(more), ids(cards).filter((id) => !SAMPLES_IN_VIEW.includes(id)), mode);
    assert.equal(shown.length + more.length, cards.length, mode);
  }
  // the File menu and the footnote keep the rank (#3192)
  assert.deepEqual(ids(sampleCardsFor("viewer")), SAMPLE_RANK.filter((id) => ids(sampleCardsFor("viewer")).includes(id)));
  // a list with neither: its first card is shown, the rest folded
  const other = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(ids(emptyCardSamples(other).shown), ["a"]); assert.deepEqual(ids(emptyCardSamples(other).more), ["b", "c"]);
  assert.deepEqual(emptyCardSamples(null), { shown: [], more: [] });
  // one of the two missing: the other alone
  assert.deepEqual(ids(emptyCardSamples([{ id: "x" }, { id: "mount_raymond" }]).shown), ["mount_raymond"]);
});

test("the card: the samples in view as buttons with their description, the first filled; the rest in a closed More samples fold", () => {
  const b = read("../src/modules/viewer/SampleButtons.jsx");
  assert.match(b, /export default function SampleButtons\(\{ shown = \[\], more = \[\], onLoad, loading \}\)/);
  assert.match(b, /\{buttons\(shown, onLoad, loading, true\)\}/);
  assert.match(b, /<MoreFold data-more-samples="" summary=\{tr\("More samples"\)\} style=\{\{ flexBasis: "100%", marginBottom: 0 \}\}>/);
  assert.match(b, /\{buttons\(more, onLoad, loading, false\)\}/);
  assert.doesNotMatch(b, /<details[^>]*\bopen\b/); // closed until asked for (MoreFold has no open)
  assert.doesNotMatch(read("../src/components/MoreFold.jsx"), /\bopen[=\s}]/);
  const v = read("../src/modules/ViewerModule.jsx");
  const card = v.slice(v.indexOf("<EmptyState\n            onClose={() => setEmptyCardClosed(true)}"), v.indexOf("</EmptyState>", v.indexOf("onClose={() => setEmptyCardClosed(true)}")));
  assert.ok(card.length > 100);
  assert.doesNotMatch(card, /actionLabel=|onAction=/, "no separate filled button: the first sample is SampleButtons' filled one");
  assert.match(card, /secondary=\{<SampleButtons \{\.\.\.emptyCardSamples\(sampleCards\)\} onLoad=\{loadSample\} loading=\{sampleLoading\} \/>\}/);
  // a sample that needs a download still asks first (#3133): every button goes through loadSample
  assert.match(b, /onClick=\{\(\) => onLoad\(c\.id\)\}/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(loc["More samples"], `${lang}: More samples`);
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
