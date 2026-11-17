// TASKS.csv #3874 (#3716 (6)) — a section picture arrived 176 mm wide on a 432 mm sheet, right of the title, at no round scale, and the scale list offered scales that made it
// larger than the page. Now it arrives at the largest picture a round scale gives that fits the room, at the left margin below the title, and a scale that does not fit is greyed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { roundScaleSize, sectionFitsPage, sectionWidthForScale } from "../src/lib/layoutGeometry.js";
import { starterBand, spotInBand } from "../src/lib/layoutPlace.js";

const SCALES = [500, 1000, 2000, 2500, 5000, 10000, 25000, 50000];
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3874 the first placement is the smallest round denominator whose picture fits the room (the largest picture that does)", () => {
  const world = 3000; // metres across at capture (synthetic)
  const fit = roundScaleSize({ worldWidthAtCaptureM: world, aspect: 2 }, SCALES, 900, 400);
  assert.ok(fit && SCALES.includes(fit.n));
  assert.ok(fit.w <= 900 && fit.h <= 400 && Math.abs(fit.w / fit.h - 2) < 1e-9);
  assert.equal(fit.w, sectionWidthForScale({ worldWidthAtCaptureM: world }, fit.n)); // exact, not rounded to whole pixels (#3022)
  // the next smaller denominator does not fit; the next larger one does and is smaller
  const smaller = SCALES[SCALES.indexOf(fit.n) - 1];
  if (smaller) { const w = sectionWidthForScale({ worldWidthAtCaptureM: world }, smaller); assert.ok(w > 900 || w / 2 > 400); }
  // nothing in the list fits a tiny room, or the picture has no known width
  assert.equal(roundScaleSize({ worldWidthAtCaptureM: world, aspect: 2 }, SCALES, 10, 10), null);
  assert.equal(roundScaleSize({ worldWidthAtCaptureM: null, aspect: 2 }, SCALES, 900, 400), null);
  assert.equal(roundScaleSize({ worldWidthAtCaptureM: world, aspect: 0 }, SCALES, 900, 400), null);
});

test("#3874 the picture goes to the left margin of the starter page's free band, under the title", () => {
  const A4 = { w: 1123, h: 794 };
  const els = [{ id: "title", type: "text", x: 40, y: 40, w: 400, h: 50 }, { id: "scalebar", type: "scale", x: 40, y: 730, w: 260, h: 24 }];
  const band = starterBand(els, A4);
  const fit = roundScaleSize({ worldWidthAtCaptureM: 2000, aspect: 1.8 }, SCALES, A4.w - 80, band.bottom - band.top);
  assert.ok(fit);
  const spot = spotInBand(els, Math.ceil(fit.w), Math.ceil(fit.h), A4, band);
  assert.ok(spot && spot.x === 40 && spot.y === band.top, JSON.stringify([band, spot]));
});

test("#3874 a scale that makes the picture larger than the page is greyed in the list, the current one is not", () => {
  const el = { worldWidthAtCaptureM: 2500, aspect: 1.5 };
  const pageW = 1123, pageH = 794;
  const fits = SCALES.map((n) => [n, sectionFitsPage(el, n, pageW, pageH)]);
  assert.equal(fits[0][1], false, "1 : 500 is larger than the page");
  assert.equal(fits.at(-1)[1], true);
  // monotone: once a scale fits, every smaller picture (larger denominator) fits
  assert.ok(fits.every(([, f], i) => !f || fits.slice(i).every(([, g]) => g)));
  // tall pictures are held by the height too
  assert.equal(sectionFitsPage({ worldWidthAtCaptureM: 1000, aspect: 0.2 }, 2000, 1123, 794), sectionWidthForScale({ worldWidthAtCaptureM: 1000 }, 2000) / 0.2 <= 794);
  const lm = src("../src/modules/LayoutModule.jsx");
  assert.match(lm, /disabled=\{!fits\}/);
  assert.match(lm, /tr\("\{scale\} \(larger than the page\)"/);
  assert.match(lm, /roundScaleSize\(\{ worldWidthAtCaptureM: img\.worldWidthAtCaptureM, aspect \}, SCALE_PRESETS/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(j["{scale} (larger than the page)"].includes("{scale}") && j["Larger than the page at this scale"], lang);
  }
});
