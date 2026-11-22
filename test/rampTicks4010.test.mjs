// TASKS.csv #4010 (found in #3932 batch 3's live check) — a log ramp's tick label must never touch another: on a 0.16 to 22.8 ramp the legend drew '10'
// against the '22.8' end label and they read '1022.8'. The labels were measured at 10 px (the xs step) while drawn at 12 px (the window's text size,
// #3900 Large). Now measured at the drawn size; two end labels that would touch put the max one on a line of its own; Layout's end labels keep a gap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rampTickLabels, endLabelsFit } from "../src/lib/legendScale.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const at = (v, lo, hi) => (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
const ticks = [{ at: at(1, 0.16, 22.8), label: "1" }, { at: at(10, 0.16, 22.8), label: "10" }];
const measureAt = (px) => (s) => String(s).length * px * 0.5; // a digit about half the font size

test("#4010 measured at the size it is drawn, the '10' beside the '22.8' end label is left out (its tick mark stays)", () => {
  assert.deepEqual(rampTickLabels(ticks, "0.16", "22.8", 180, measureAt(10)).map((t) => t.label), ["1", "10"], "at 10 px it fitted: the old measure");
  assert.deepEqual(rampTickLabels(ticks, "0.16", "22.8", 180, measureAt(12)).map((t) => t.label), ["1"], "at 12 px (Large) it would touch: left out");
});

test("#4010 two end labels that would touch are said so", () => {
  assert.equal(endLabelsFit("0.16", "22.8", 180, measureAt(12)), true);
  assert.equal(endLabelsFit("≤ 0.000123456 ppm", "≥ 123,456,789.5 ppm", 180, measureAt(12)), false);
});

test("#4010 wiring: the overlay measures at the xs step plus the text size, again when it changes; Layout's end labels keep a gap", () => {
  const o = read("../src/components/ViewportFigureOverlay.jsx");
  assert.match(o, /export const legendTextPx = \(\) => fontSizes\.xs \+ \(Number\(textBump\(\)\) \|\| 0\);/);
  assert.match(o, /const px = legendTextPx\(\), s = String\(text\), key = `\$\{px\}\|\$\{s\}`;/, "the cache is per size");
  assert.match(o, /measureCtx\.font = `\$\{px\}px 'Exo 2', system-ui, sans-serif`/);
  assert.match(o, /useTextSize\(\); \/\/ TASKS\.csv #4010/);
  assert.match(o, /split = !endLabelsFit\(lo, hi, 180, legendTextWidth\)/);
  assert.match(o, /\(split \? \[\] : rampTickLabels\(g\.ramp\.ticks, lo, hi, 180, legendTextWidth\)\)/);
  assert.match(read("../src/modules/LayoutModule.jsx"), /justifyContent: "space-between", gap: 6, minWidth: 152, width: "max-content"/);
});
