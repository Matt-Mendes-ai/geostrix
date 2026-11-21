// TASKS.csv #3552 (reopened, rehearsal round 3) — the section's float labels (end-of-hole depth, offset range) were taken at the first candidate that missed the other labels,
// wherever it fell: 'EOH 647 m' and '-20...+2 m' started 15-17 px left of the frame. And #3574 (reopened): a fitted tall section's text grows to read at ~7 px.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLabels, labelWidth } from "../src/lib/sectionLabels.js";

const bounds = [60, 1040];
const eoh = (ex, text = "EOH 647 m") => ({ key: "eoh", text, size: 9, prio: 2, optional: true, cands: [{ x: ex, y: 100, anchor: "middle" }, { x: ex + 6, y: 100, anchor: "start" }, { x: ex - 6, y: 100, anchor: "end" }] });

test("a candidate that starts left of the frame is not taken; the next inside is", () => {
  const w = labelWidth("EOH 647 m", 9);
  // the end of the hole is 20 px inside the frame: the centred candidate would start (w/2 - 20) px left of it
  const [r] = resolveLabels([eoh(60 + 20)], [], { bounds, strictBounds: true });
  assert.ok(r, "placed");
  const x0 = r.anchor === "middle" ? r.x - w / 2 : r.anchor === "end" ? r.x - w : r.x;
  assert.ok(x0 >= bounds[0] - 1e-9, `starts at ${x0}, inside the frame`);
  // without the bounds (the old call's page-wide ones, or none) the first candidate is taken as before
  const [old] = resolveLabels([eoh(60 + 20)], []);
  assert.equal(old.anchor, "middle");
});

test("nowhere inside the frame: an optional tag is left out, not printed over the axis", () => {
  const spec = { key: "k", text: "EOH 647 m", size: 9, prio: 2, optional: true, cands: [{ x: 30, y: 100, anchor: "end" }] };
  assert.equal(resolveLabels([spec], [], { bounds, strictBounds: true }).length, 0);
});

test("the right edge too; widthOf replaces the estimate", () => {
  const spec = (ex) => ({ key: "k", text: "EOH 647 m", size: 9, prio: 2, optional: true, cands: [{ x: ex, y: 100, anchor: "middle" }, { x: ex - 6, y: 100, anchor: "end" }] });
  const [r] = resolveLabels([spec(1036)], [], { bounds, strictBounds: true });
  assert.equal(r.anchor, "end", "a tag at the right end moves to the left of its point");
  // a measured width wider than the estimate pushes the same tag past the bound: it moves
  const wide = (t) => labelWidth(t, 9) + 40;
  const [m] = resolveLabels([spec(1000)], [], { bounds, widthOf: wide, strictBounds: true });
  assert.equal(m.anchor, "end");
  const [e] = resolveLabels([spec(1000)], [], { bounds, strictBounds: true });
  assert.equal(e.anchor, "middle", "with the estimate the centred one fits");
});

test("wiring: the section passes the frame's bounds and its own measured widths; the fitted text grows", () => {
  const sw = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(sw, /resolveLabels\(shown, \[\.\.\.holeLabelBoxes, \.\.\.axisLabelBoxes\], \{ bounds: \[PAD, W - PAD\]/);
  assert.match(sw, /widthOf: floatWidth, strictBounds: true/);
  assert.match(sw, /const floatMeasures = new Map\(\), floatWidth = /);
  assert.match(sw, /textScale=\{printScale \?\? textScale \* autoText\}/);
  assert.match(sw, /const \[autoText, setAutoText\] = useState\(1\)/);
  assert.match(sw, /Math\.min\(3, Math\.max\(1, 7\.2 \/ fitBase\)\)/);
});
