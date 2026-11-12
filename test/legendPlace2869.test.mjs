// TASKS.csv #2869 (GSC review B21) — a new legend was placed as 220 px wide and grew to its longest label (an IDW grid's 50-character name),
// over the north arrow beside it. #2860 (A16) — a view of picture rasters only gave a grey 'Item' row. #2794 — score maps in the Layout legend.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legendBoxSize, legendRowH, legendLabelW } from "../src/lib/legendFit.js";
import { freeSpot, elementBox } from "../src/lib/layoutPlace.js";
import { rasterLegendGroups, legendGroupsToItems } from "../src/lib/legendGroups.js";

const longName = "blake_noslash · BOUGUER IDW 100 m, blanked > 865 m (mGal)";
const rampItem = [longName, null, { ramp: { colors: ["#440154", "#fde725"], minLabel: "-63", maxLabel: "-36" } }];

test("legendBoxSize: as wide as the longest label, never under the 150 px minimum", () => {
  assert.equal(legendBoxSize([["Py", "#f00"]]).w, 152);
  const wide = legendBoxSize([[longName, "#f00"]]);
  assert.ok(wide.w > 300, `a long label widens it (${wide.w})`);
  assert.ok(legendBoxSize([rampItem]).w > 300, "a ramp's long name is a line above it that does not wrap");
  assert.equal(legendBoxSize([["Cu", null, { ramp: rampItem[2].ramp }]]).w, 152 + 26, "a short name: the 152 px bar");
  const h1 = legendBoxSize([["a", "#f00"]]).h, h3 = legendBoxSize([["a", "#f00"], ["b", "#0f0"], ["c", "#00f"]]).h;
  assert.equal(h3 - h1, 2 * legendRowH(["b", "#0f0"]));
  assert.equal(legendLabelW([longName, null, { note: true }]) <= 200, true, "a note wraps at 200 px");
});

test("elementBox: a legend with rows is its drawn size, without rows the stock 220 x 300", () => {
  const b = elementBox({ type: "legend", x: 740, y: 40, items: [[longName, "#f00"]] });
  assert.equal(b.w, legendBoxSize([[longName, "#f00"]]).w);
  assert.deepEqual(elementBox({ type: "legend", x: 0, y: 0 }), { x: 0, y: 0, w: 220, h: 300 });
  assert.deepEqual(elementBox({ type: "legend", x: 0, y: 0, items: [] }), { x: 0, y: 0, w: 220, h: 300 });
  assert.deepEqual(elementBox({ type: "legend", x: 0, y: 0, w: 180, h: 90, items: [[longName, "#f00"]] }), { x: 0, y: 0, w: 180, h: 90 }, "a stored size wins");
});

test("freeSpot with the drawn size keeps a wide legend off the north arrow", () => {
  const page = { w: 1123, h: 794 };
  // the default page's parts: a viewport over most of the sheet, the north arrow top right
  const els = [{ type: "text", x: 40, y: 40, w: 690, h: 70 }, { type: "viewport", x: 40, y: 120, w: 690, h: 600 }, { type: "north", x: 1000, y: 40 }];
  const box = legendBoxSize([[longName, "#f00"]]);
  const spot = freeSpot(els, box.w, box.h, page);
  const n = elementBox(els[2]);
  const hits = spot.x < n.x + n.w && n.x < spot.x + box.w && spot.y < n.y + n.h && n.y < spot.y + box.h;
  assert.equal(hits, false, `legend at ${spot.x},${spot.y} ${box.w}x${box.h} clear of the arrow`);
  // the old guess: 220 px wide here lands where the drawn legend runs into the arrow
  const old = freeSpot(els, 220, 45, page);
  assert.deepEqual(old, { x: 740, y: 40 }, "the review's spot");
  assert.ok(old.x + box.w > n.x, "the 220 px guess put it where it grew over the arrow");
});

test("rasterLegendGroups: picture rasters by name only when asked (the Layout legend)", () => {
  const pic = { id: "p", name: "FlinFlon_SnowLake_25m_mag_res.TIF", dataUrl: "data:image/png;base64,AA" };
  assert.equal(rasterLegendGroups([pic]).length, 0, "the 3D overlay keeps leaving pictures out");
  const g = rasterLegendGroups([pic, { ...pic, id: "q", visible: false }], { pictureNote: "picture: colours only, no values" });
  assert.equal(g.length, 1);
  const items = legendGroupsToItems(g);
  assert.deepEqual(items, [[pic.name, null, { heading: true }], ["picture: colours only, no values", null, { note: true }]]);
  // a raster with values, a colour bar or a geology legend is not called a picture
  assert.equal(rasterLegendGroups([{ ...pic, grid: { nx: 1 } }], { pictureNote: "x" }).length, 0);
  assert.ok(rasterLegendGroups([{ ...pic, legendImage: { dataUrl: "data:x" } }], { pictureNote: "x" })[0].image);
});

test("wiring: Layout places a new legend at its drawn size, lists pictures and score maps", () => {
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(s, /const box = legendBoxSize\(base\.items\);[^\r\n]*\r?\n\s*Object\.assign\(base, freeSpot\(elements, box\.w, Math\.min\(A4\.h - 80, box\.h\), A4\)\)/);
  assert.match(s, /rasterLegendGroups\(\(rasters \|\| \[\]\)\.filter\(\(r\) => !isScoreRaster\(r\)\), \{ pictureNote: tr\("picture: colours only, no values"\) \}\), \.\.\.scoreRasterLegendGroups\(rasters\)/);
  assert.match(s, /const row = legendRowH, labelW = legendLabelW;/);
});
