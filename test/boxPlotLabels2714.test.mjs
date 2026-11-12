// TASKS.csv #2714 — box-plot group labels are no longer clipped at the plot's left edge: the margin grows with the longest label (up to
// 40 % of the width) and a longer label is cut with an ellipsis, its full name in a hover title
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { labelMargin, fitLabel, textWidthPx } from "../src/lib/fitLabel.js";

test("short labels keep the old margin; a long one widens it, up to the cap", () => {
  assert.equal(labelMargin(["P", "G", "A"], 11, { min: 90, width: 640 }), 90);
  const m = labelMargin(["DH24-119 · no code logged"], 11, { min: 90, width: 640 });
  assert.ok(m > 90 && m >= textWidthPx("DH24-119 · no code logged", 11), String(m));
  assert.equal(labelMargin(["x".repeat(200)], 11, { min: 90, width: 640 }), 256, "40 % of 640");
});

test("a label that still does not fit is cut with an ellipsis; one that fits is left alone", () => {
  assert.equal(fitLabel("Pegmatite", 244, 11), "Pegmatite");
  const cut = fitLabel("x".repeat(200), 244, 11);
  assert.ok(cut.endsWith("…") && textWidthPx(cut, 11) <= 244 + 11, cut.length);
  assert.equal(fitLabel("", 10, 11), "");
});

test("wired into BoxPlots, which Grade stats and the downhole-log pane share", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /const padL = labelMargin\(names, fontSizes\.sm, \{ min: fit \? 110 : 90, width: w \}\);/);
  assert.match(g, /\{fitLabel\(names\[i\], padL - 12, fontSizes\.sm\)\}<title>\{names\[i\]\}<\/title>/);
});
