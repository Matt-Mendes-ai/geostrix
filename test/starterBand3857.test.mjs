// TASKS.csv #3857 (Scottie Gold review) — on a portrait page a strip log sent from the 3D View went to a new 'Snapshot N' page and left the empty starter page behind: sized to the
// sheet's height less 160 px it could not fit between the starter title and the starter scale bar. Synthetic starter page and pictures.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_LAYOUT_ELEMENTS } from "../src/lib/projectFields.js";
import { refitStarter } from "../src/lib/layoutCredits.js";
import { pagePx } from "../src/lib/pageFormats.js";
import { freeSpot, spotIsFree, starterBand, spotInBand } from "../src/lib/layoutPlace.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const portrait = { size: "a4", orientation: "portrait" }, landscape = { size: "a4", orientation: "landscape" };
const starterOn = (fmt) => refitStarter(DEFAULT_LAYOUT_ELEMENTS.map((e) => ({ ...e })), landscape, fmt, "");
// the placement the Layout effect now makes: the old size first, then the band-fitted size
function place(els, page, aspect) {
  const maxW = page.w - 160, maxH = page.h - 160;
  let w = Math.round(Math.min(maxW, 700, maxH * aspect)), h = Math.round(w / aspect);
  let spot = freeSpot(els, w, h, page), free = spotIsFree(els, spot, w, h), fitted = false;
  if (!free) {
    const band = starterBand(els, page), bandH = band.bottom - band.top;
    if (bandH >= 120 && bandH < h) {
      const w2 = Math.round(Math.min(maxW, 700, bandH * aspect)), h2 = Math.round(w2 / aspect), s2 = spotInBand(els, w2, h2, page, band);
      if (s2) { w = w2; h = h2; spot = s2; free = true; fitted = true; }
    }
  }
  return { w, h, spot, free, fitted };
}

test("A4 portrait starter page: the old sizing finds no room; the band-fitted picture lands on the open page", () => {
  const page = pagePx(portrait), els = starterOn(portrait);
  const band = starterBand(els, page);
  assert.ok(band.top >= 40 && band.bottom < page.h - 40 && band.bottom - band.top > 600, JSON.stringify(band));
  // a strip log (165 x 255 mm: aspect 0.647) and a tall section (aspect 0.5)
  for (const aspect of [0.647, 0.5, 0.8]) {
    const r = place(els, page, aspect);
    assert.equal(r.free, true, `aspect ${aspect}: ${JSON.stringify(r)}`);
    assert.ok(r.spot.y >= band.top - 1 && r.spot.y + r.h <= band.bottom + 1, `inside the band: ${JSON.stringify(r)} ${JSON.stringify(band)}`);
  }
  assert.equal(place(els, page, 0.647).fitted, true, "the old 963 px sizing could not fit");
});

test("A4 landscape keeps its sizing; a page with the user's own content is left to the new-page rule", () => {
  const page = pagePx(landscape), els = starterOn(landscape);
  const r = place(els, page, 0.647);
  assert.equal(r.free, true);
  assert.equal(r.fitted, false, "landscape needed no refit");
  // an element that is not starter furniture does not move the band
  const withUser = [...starterOn(portrait), { id: "image_1", type: "image", x: 40, y: 150, w: 700, h: 700 }];
  assert.deepEqual(starterBand(withUser, pagePx(portrait)), starterBand(starterOn(portrait), pagePx(portrait)));
  assert.equal(place(withUser, pagePx(portrait), 0.647).free, false);
});

test("wiring: the effect fits to the band first and shows the new-page notice in the page bar", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /const band = starterBand\(placedSoFar, A4\)/);
  assert.match(m, /setSyncNotice\(whereNote\); setExportNote\(\{ text: whereNote, error: false \}\)/);
});
