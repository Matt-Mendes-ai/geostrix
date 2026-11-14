// TASKS.csv #3412 (#3376) — a drill plan whose key takes the top edge hid the easting labels under it and left those lines unlabelled; they are
// now labelled along the bottom edge, clear of the captions and of each other. SYNTHETIC frame and key.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hiddenEastings, bottomEastings, labelBackdrop, drillPlanGrid } from "../src/lib/drillPlan.js";

const xs = [100, 200, 300, 400, 500].map((px, i) => ({ px, label: `${(500000 + i * 100).toLocaleString("en-US")} E` }));

test("hiddenEastings: only for a key on the top edge, the eastings under its width", () => {
  const key = { x: 6, y: 6, w: 230, h: 90 }; // 6..236 px wide, on the top edge
  assert.deepEqual(hiddenEastings(xs, key, 8).map((t) => t.px), [100, 200], "the lines at 100 and 200 px run under it; the label of 200 starts inside");
  assert.deepEqual(hiddenEastings(xs, { ...key, y: 200 }, 8), [], "a key lower in the frame hides no easting label");
  assert.deepEqual(hiddenEastings(xs, null, 8), []);
});

test("bottomEastings: along the bottom edge at the frame's inset, not over a caption or another label", () => {
  const w = 600, h = 400, gf = 7, hidden = hiddenEastings(xs, { x: 6, y: 6, w: 230, h: 90 }, 8);
  const cap = labelBackdrop("Grid 100 m, local mine grid, no CRS", w - 6, h - 6, gf, "end");
  const out = bottomEastings(hidden, { gf, w, h, inset: 6, boxes: [cap] });
  assert.deepEqual(out.map((p) => [p.label, p.y, p.anchor]), hidden.map((t) => [t.label, 394, "start"]), "both are labelled at the bottom");
  assert.ok(out.every((p) => { const b = labelBackdrop(p.label, p.x, p.y, gf, p.anchor); return b.x + b.w <= cap.x || b.x >= cap.x + cap.w; }), "none runs into the caption on the right");
  // a caption along the bottom left in the way: that label is left out, the other stays
  const wide = { x: 0, y: 380, w: 130, h: 16 };
  assert.deepEqual(bottomEastings(hidden, { gf, w, h, inset: 6, boxes: [wide] }).map((p) => p.label), [hidden[1].label]);
  // two labels too close to each other: the second is dropped
  assert.equal(bottomEastings([{ px: 100, label: "500,000 E" }, { px: 102, label: "500,001 E" }], { gf, w, h }).length, 1);
  // a label that would run off the right edge ends at its line, as the top labels do (#3182)
  assert.equal(bottomEastings([{ px: 590, label: "500,000 E" }], { gf, w, h })[0].anchor, "end");
});

test("the grid's own easting lines feed it (a real el)", () => {
  const g = drillPlanGrid({ w: 600, h: 400, scale: 10000, centre: { x: 500500, y: 5500000 } });
  assert.ok(g.xs.length >= 3);
  const hidden = hiddenEastings(g.xs, { x: 6, y: 6, w: 200, h: 60 }, 8);
  assert.ok(hidden.length >= 1 && hidden.every((t) => g.xs.includes(t)));
  const zero = drillPlanGrid({ w: 600, h: 400, scale: 10000, centre: { x: 0.0000001, y: -0.0000001 } });
  assert.ok(![...zero.xs, ...zero.ys].some((t) => /^-0 /.test(t.label)), "a line at a hair under zero reads 0, not -0");
});

test("wired: the element labels what the key hides along the bottom, beside the captions' boxes", () => {
  const d = fs.readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(d, /const hidden = hiddenEastings\(grid\.xs, keyBox, d\.fontPx\), hiddenPx = new Set\(hidden\.map\(\(t\) => t\.px\)\);/);
  assert.match(d, /grid\.xs\.filter\(\(t\) => !hiddenPx\.has\(t\.px\)\)/);
  assert.match(d, /bottomEastings\(hidden, \{ gf, w: d\.w, h: d\.h, inset: GRID_INSET, boxes: capBoxes \}\)/);
  assert.match(d, /labelBackdrop\(d\.caption, d\.w - GRID_INSET, d\.h - GRID_INSET - \(gf \+ 4\), gf, "end"\)/, "the traces caption's box is avoided too");
});
