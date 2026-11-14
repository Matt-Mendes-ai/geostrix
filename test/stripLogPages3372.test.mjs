// TASKS.csv #3372 — a deep hole's strip log over as many Layout pages as its depth scale needs: the first page the title / caption / key
// band, the track headers and the first depths; every other page the headers again, its depths and the axis captions; no depth twice
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripLogSvgBox, stripLogGeometry, splitStripLog, stripLogSliceElements, wholeStripLog, pageWidthDenom, niceDenomUp, PAD_TOP, PAD_BOTTOM } from "../src/lib/stripLogPages.js";

const M = 0.0254 / 96;
// SYNTHETIC: the window's SVG export of a 694.2 m hole at 6 px/m, 13 tracks (1,000 px wide), a 120 px furniture band on top
function logEl({ depth = 694.2, ppm = 6, band = 120, width = 1000, from = 0, label = "Strip log — SYN-1" } = {}) {
  const H = PAD_TOP + depth * ppm + PAD_BOTTOM, total = band + H;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-band} ${width} ${total}" width="${width}" height="${total}" font-family="'Exo 2'"><rect width="10" height="10"/></svg>`;
  return { id: "log1", type: "image", label, src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, naturalW: width, naturalH: total, depthHeightAtCaptureM: total / ppm, x: 60, y: 60, w: 300, h: 300 * (total / width), aspect: width / total, keyDrawn: true, _from: from };
}

test("the picture's band, depth axis and size are read from its SVG", () => {
  const el = logEl();
  assert.deepEqual(stripLogSvgBox(el.src), { bandPx: 120, width: 1000, height: el.naturalH });
  const g = stripLogGeometry(el);
  assert.equal(g.ppm, 6); assert.equal(g.bodyTop, 160); assert.ok(Math.abs(g.d1 - 694.2) < 1e-9);
  assert.equal(stripLogGeometry({ ...el, src: "data:image/png;base64,AAAA" }), null, "a PNG (an Atlas log) is not split");
  assert.equal(stripLogGeometry(logEl({ label: "Strip log — SYN-1, 100-250 m", depth: 150 })).d0, 100);
});

test("the page's width sets the largest scale: about 1 : 1,000 on A4 portrait for 13 tracks", () => {
  assert.equal(niceDenomUp(882), 1000); assert.equal(niceDenomUp(1000), 1000); assert.equal(niceDenomUp(1001), 1250); assert.equal(niceDenomUp(2950), 3000);
  assert.equal(pageWidthDenom(logEl(), 794 - 80), 1000);
  // a 3-track log (270 px) is not offered more than its own size: 1 : 630 at 6 px/m, rounded to 1 : 800, not 1 : 250 with 18 pt labels
  assert.equal(pageWidthDenom(logEl({ width: 270 }), 794 - 80), 800);
});

test("split at 1 : 1,000 on A4 portrait: every depth once, headers and axis captions on each page, one key", () => {
  const el = logEl(), g = stripLogGeometry(el);
  const r = splitStripLog(el, { pageW: 794, pageH: 1123, denom: 1000, x: 40, y: 60 });
  assert.ok(!r.error, r.error);
  assert.ok(r.pages.length >= 3 && r.pages.length <= 4, `${r.pages.length} pages`);
  assert.ok(Math.abs(r.w - 1000 * r.k) < 1e-9 && r.w <= 794 - 80);
  // the depth scale reads 1 : 1,000 on every slice
  r.pages.forEach((p) => assert.ok(p.h + (p === r.pages[0] ? 60 : 40) + 64 <= 1123 + 0.5, `a slice fits its page: ${p.h}`));
  // body ranges: contiguous, no gap, no overlap, from the first metre to the last
  const bodies = r.pages.map((p, i) => (i === 0 ? [g.bodyTop, p.parts[0][1]] : p.parts[1]));
  assert.equal(bodies[0][0], g.bodyTop);
  for (let i = 1; i < bodies.length; i++) assert.equal(bodies[i][0], bodies[i - 1][1]);
  assert.equal(r.pages.at(-1).parts.at(-1)[1], el.naturalH, "the last page ends at the picture's foot");
  // the band (title, caption, key) only on page 1; the track headers on the others; axis captions under every page
  assert.equal(r.pages[0].parts[0][0], 0);
  for (const p of r.pages.slice(1)) assert.deepEqual(p.parts[0], [120, 160]);
  for (const p of r.pages.slice(0, -1)) assert.deepEqual(p.parts.at(-1), [el.naturalH - PAD_BOTTOM, el.naturalH]);
  // cuts at round depths, just under a tick's label
  for (let i = 0; i < r.pages.length - 1; i++) {
    const p = r.pages[i];
    assert.ok(Math.abs(p.to - Math.round(p.to)) < 1e-6 && Math.round(p.to) % 10 === 0, `cut at a round depth: ${p.to}`);
    assert.equal(r.pages[i + 1].from, p.to, "the next page starts there");
    assert.ok(Math.abs(p.parts.at(-2)[1] - (g.bodyTop + p.to * 6 + 4)) < 1e-6, "its pixels end just under that tick's label");
  }
  assert.equal(r.pages[0].from, 0); assert.ok(Math.abs(r.pages.at(-1).to - 694.2) < 1e-9);
});

test("too wide at the scale asked; a slice's own depth span keeps the scale; the whole log again", () => {
  const el = logEl();
  assert.equal(splitStripLog(el, { pageW: 794, pageH: 1123, denom: 500, x: 40 }).error, "too-wide");
  const r = splitStripLog(el, { pageW: 794, pageH: 1123, denom: 1000, x: 40, y: 60 });
  const [img, cap] = stripLogSliceElements(el, r, 1, { x: 40, y: 40, holeLabel: "Strip log SYN-1", batchId: "b" });
  const hPx = img.slice.parts.reduce((t, [a, b]) => t + (b - a), 0);
  assert.ok(Math.abs(img.depthHeightAtCaptureM / (img.h * M) - 1000) < 1e-6, "1 : 1,000 on the slice");
  assert.ok(Math.abs(img.h - hPx * r.k) < 1e-9);
  assert.equal(img.id, "log1_p2");
  assert.match(cap.text, new RegExp(`^Strip log SYN-1, [\\d.]+-[\\d.]+ m · page 2 of ${r.pages.length} · continued on the next page$`));
  const [first] = stripLogSliceElements(el, r, 0, { x: 40, y: 60, holeLabel: "Strip log SYN-1", batchId: "b" });
  assert.equal(first.id, "log1");
  const back = wholeStripLog(first);
  assert.ok("slice" in back && back.slice === undefined, "slice cleared, not left out (a patch is merged into the element)");
  assert.equal({ ...first, ...back }.slice, undefined);
  assert.deepEqual([back.h, back.w, back.depthHeightAtCaptureM], [el.h, el.w, el.depthHeightAtCaptureM]);
});

test("the strip log window's geometry is the one this mirrors", () => {
  const s = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(s, /const PAD_TOP = 40;/);
  assert.match(s, /const sy = \(d\) => PAD_TOP \+ \(d - d0\) \* pxPerMeter;/);
  assert.match(s, /const H = sy\(d1\) \+ 30;/);
  assert.match(s, /depthHeightAtCaptureM: fh \/ pxPerMeter/);
  const x = readFileSync(new URL("../src/lib/svgExport.js", import.meta.url), "utf8");
  assert.match(x, /if \(atTop\) y0 -= band\.height;/);
});

test("wired in Layout: the split, its pages, the slice renderer", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const widthD = pageWidthDenom\(el, A4\.w - 80\);/);
  assert.match(m, /addPagesOnPaper\(addLayoutPages, setLayoutPageFormat, rest, activePage\?\.format\);/);
  assert.match(m, /split=\{stripLogSplitFor\(sel\)\} onSplit=\{\(\) => splitStripLogOverPages\(sel\)\} onWhole=\{\(\) => setElements\(\(els\) => els\.filter\(\(e\) => e\.sliceCaptionOf !== sel\.id\)\.map\(\(e\) => \(e\.id === sel\.id \? wholeStripLog\(e\) : e\)\)\)\}/);
  assert.match(m, /if \(el\.slice\?\.parts\?\.length && el\.naturalH > 0\) \{/);
  assert.match(m, /top: -a \* k, width: W, height: el\.naturalH \* k/);
});
