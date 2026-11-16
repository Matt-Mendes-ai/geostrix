// TASKS.csv #3861 (Scottie Gold review) — 'Depth 1 : 1,000' on a 662 m strip log sent with the window's Fit (0.72 px/m) enlarged it to 625 x 965 mm with 37 pt labels, offered no split and
// advised 'a larger depth scale'. The panel now says the picture has to be sent again, and at which px/m. Synthetic strip log.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redrawAdvice, ppmForDenom, splitStripLog, pageWidthDenom, PAD_TOP, PAD_BOTTOM } from "../src/lib/stripLogPages.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
function logEl({ depth = 662, ppm = 0.72, band = 120, width = 600 } = {}) {
  const H = PAD_TOP + depth * ppm + PAD_BOTTOM, total = band + H;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-band} ${width} ${total}" width="${width}" height="${total}"><rect width="10" height="10"/></svg>`;
  return { id: "log1", type: "image", label: "Strip log — SYN-1", src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, naturalW: width, naturalH: total, depthHeightAtCaptureM: total / ppm, x: 40, y: 40, w: 300, h: 300 * (total / width), aspect: width / total };
}

test("1 : 1,000 needs 3.78 px per metre; a log drawn at 0.72 px/m would be enlarged 5.25 times, labels at 37 pt", () => {
  assert.ok(Math.abs(ppmForDenom(1000) - 3.7795) < 0.001);
  const a = redrawAdvice(logEl(), 1000);
  assert.ok(Math.abs(a.ppmNow - 0.72) < 1e-9 && Math.abs(a.enlarge - 5.249) < 0.01, JSON.stringify(a));
  assert.ok(Math.abs(a.pt - 37.4) < 0.1, `${a.pt}`);
  // sent at the scale's own px/m: no enlargement, and the split is offered (as the reviewer found at 3.78 px/m)
  const b = redrawAdvice(logEl({ ppm: 3.78 }), 1000);
  assert.ok(Math.abs(b.enlarge - 1) < 0.01 && b.pt < 7.2);
  const split = splitStripLog(logEl({ ppm: 3.78, width: 600 }), { pageW: 794, pageH: 1123, denom: 1000 });
  assert.ok(split.pages?.length > 1, JSON.stringify(split).slice(0, 120));
  assert.equal(redrawAdvice({}, 1000), null);
});

test("wiring: the depth panel says to send it again instead of 'a larger depth scale'", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /redrawAdvice\(sel, d\)/);
  assert.match(m, /send it again from the strip log window with Vertical scale \{need\} px\/m/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["This picture was drawn at {now} px per metre. At 1 : {d} it is enlarged {x} times and its labels print at about {pt} pt. For this scale send it again from the strip log window with Vertical scale {need} px/m ('Add to Layout'): a log drawn at that scale can be split over pages."], l);
  assert.ok(pageWidthDenom);
});
