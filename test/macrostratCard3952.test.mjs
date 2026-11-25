// TASKS.csv #3952 — the Macrostrat geology dialog is an opaque card: it spread modalStyles' panel, which is a function, so it had no background.
// Picture first, one line of scale in view, the description and the credit behind a closed More; the credit on maps and figures is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the card has a background: panel is called, not spread", async () => {
  const { panel } = await import("../src/lib/modalStyles.js");
  assert.equal(typeof panel, "function");
  assert.deepEqual({ ...panel }, {}, "spreading the function gives nothing: the bug");
  assert.ok(panel({ width: 520 }).background, "calling it gives the surface");
  const m = read("../src/components/MacrostratModal.jsx");
  assert.doesNotMatch(m, /\.\.\.panel\b/);
  assert.match(m, /style=\{panel\(\{ width: 520,/);
});

test("picture, one line of scale, the area and the buttons in view; the rest behind More", () => {
  const m = read("../src/components/MacrostratModal.jsx");
  const more = m.indexOf("<MoreFold"), body = m.slice(0, more);
  assert.ok(more > 0);
  assert.match(body, /<DropPicture picture="units" \/>/);
  assert.match(body, /tr\("Regional geology \(1:250,000 to 1:1,000,000\), not property-scale mapping\."\)/);
  // the units are the main (green) button, the image a second choice that says it is a picture
  const units = body.indexOf('tr("Add the units as a map layer")'), image = body.indexOf('tr("Add as an image only")');
  assert.ok(units > 0 && image > units, "units first, then the image");
  assert.match(body, /<button className="gs-btn gs-btn--primary" type="button" disabled=\{!bboxLonLat \|\| !!busy\} onClick=\{addUnits\}/);
  assert.match(body, /<button className=\{addMapLayer \? "gs-btn" : "gs-btn gs-btn--primary"\}[^>]*onClick=\{addLayer\}/);
  assert.match(body, /"Map units at the project centre"/);
  const after = m.slice(more);
  assert.match(after, /Macrostrat compiles geologic maps/);
  assert.match(after, /Data CC BY 4\.0: credit Macrostrat/);
  assert.match(m, /credit: MACROSTRAT_CREDIT/, "the layer still carries the credit for maps and figures");
  assert.match(read("../src/components/DropDiagram.jsx"), /\n  units: \(id\) => <Block id=\{id\} top=\{<>/); // #3956: the units picture is drawn in style A, on the geology block
});

test("the image is drawn from the unit polygons, sized to the area: sharp, flat colours, contacts darker", async () => {
  const { drawUnitsRGBA, unitImageLongPx } = await import("../src/lib/macrostrat.js");
  assert.equal(unitImageLongPx(1600), 1067, "a 1.6 km area: ~1.5 m pixels");
  assert.equal(unitImageLongPx(300), 1024);
  assert.equal(unitImageLongPx(80000), 2048, "capped");
  // two made-up units side by side over a 0..1 x 0..1 box, the left one with a hole
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const feats = [{ parts: [sq(0, 0, 0.5, 1), sq(0.1, 0.4, 0.3, 0.6)], attributes: { unit: "A" } }, { parts: [sq(0.5, 0, 1, 1)], attributes: { unit: "B" } }];
  const col = { A: "#ff0000", B: "#0000ff" };
  const w = 20, h = 10, px = drawUnitsRGBA(feats, (f) => col[f.attributes.unit], [0, 0, 1, 1], w, h);
  const at = (i, j) => [...px.slice((j * w + i) * 4, (j * w + i) * 4 + 4)];
  assert.deepEqual(at(0, 0), [255, 0, 0, 255]);
  assert.deepEqual(at(19, 9), [0, 0, 255, 255]);
  assert.deepEqual(at(4, 5), [0, 0, 0, 0], "the hole is left empty");
  assert.deepEqual(at(9, 2), [140, 0, 0, 255], "the contact pixel is darker");
  const colours = new Set(); for (let k = 0; k < w * h; k++) colours.add(px.slice(k * 4, k * 4 + 4).join());
  assert.ok(colours.size <= 5, "no blended colours: " + [...colours].join(" | "));
  const m = readFileSync(new URL("../src/lib/macrostratFetch.js", import.meta.url), "utf8");
  assert.doesNotMatch(m, /MACROSTRAT_TILE_URL|createImageBitmap/, "the PNG tiles are not read any more");
  assert.match(m, /drawUnitsRGBA\(features,/);
});
