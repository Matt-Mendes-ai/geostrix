// TASKS.csv #3875 (follow-up of #3867 / #3868): the unsplit strip log's patterns as vector tiles, the 'Preparing the PDF' line, the Atlas placing the strip log by the height its filled texts draw at
// (#3868 item 5) and the 'Looking N..' label clearing the legend on its left (#3868 item 12). Made-up numbers throughout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { patternsAsVectors } from "../src/lib/svgCrop.js";
import { lookLabelBox, tieStarterFurniture, LOOK_SHIFT } from "../src/lib/layoutLinks.js";
import { filledTextHeight, withTextHeights, withoutTextHeights, placeStripLog, makeRoomForStripLog } from "../src/lib/atlas.js";
import { elementBox } from "../src/lib/layoutPlace.js";
import { surveyAttitudeOf, attFromText } from "../src/lib/collarAttrExport.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const svgUrl = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

test("a strip log with no pattern, or where no browser can lay it out, comes back as it was", () => {
  const plain = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>');
  assert.equal(patternsAsVectors(plain, 10), plain);
  const tiled = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><pattern id="p" width="4" height="4" viewBox="0 0 4 4"><path d="M0 0L4 4"/></pattern></defs><rect width="9" height="9" fill="url(#p)"/></svg>');
  assert.equal(patternsAsVectors(tiled, 10), tiled); // no document here: cropStripLogSlices answers null
  assert.equal(patternsAsVectors(tiled, 0), tiled);
  assert.equal(patternsAsVectors("blob:nothing", 10), "blob:nothing");
});

test("wiring: a depth picture added to Layout goes through patternsAsVectors; the PDF export says it is preparing", () => {
  const s = read("../src/modules/LayoutModule.jsx");
  assert.match(s, /src: img\.depthHeightAtCaptureM > 0 \? patternsAsVectors\(img\.src, img\.naturalH\)/);
  assert.match(s, /if \(printing\.kind !== "png"\) setExportNote\(\{ text: tr\("Preparing the PDF: \{n\} page\(s\)…", \{ n: layoutPages\.length \}\)/);
  assert.ok(s.indexOf('"Preparing the PDF: {n} page(s)…"') < s.indexOf('await Promise.all(imgs.map((im) => im.decode()'), "said before the pictures are decoded");
});

test("a filled text draws as tall as its wrapped lines; one that stores a height, or is not a text, has none to add", () => {
  const long = "Felsic volcanic with sericite alteration and semi-massive sulphide veins, ".repeat(6).trim(); // ~430 letters
  const narrow = { type: "text", x: 40, y: 100, w: 240, text: long };
  const h = filledTextHeight(narrow, (t) => t.length * 5.3); // measured: 5.3 px a letter, at 13.33 px type
  assert.ok(h > 8 * 13.33 * 1.3 * 0.9, `the text is several lines tall: ${h}`);
  assert.equal(filledTextHeight({ ...narrow, h: 60 }), null);
  assert.equal(filledTextHeight({ type: "viewport", w: 300, h: 200 }), null);
  assert.equal(filledTextHeight({ type: "text", w: 0, text: "x" }), null);
  assert.ok(filledTextHeight({ ...narrow, frameWidth: 1 }, (t) => t.length * 5.3) > h, "a frame's padding adds");
});

test("the strip log is placed clear of a long filled text; the height is not saved with the element", () => {
  const long = "Felsic volcanic with sericite alteration and semi-massive sulphide veins, ".repeat(20).trim(); // ~1,460 letters
  const page = { w: 1123, h: 794 };
  const text = { id: "t1", type: "text", x: 40, y: 40, w: 1043, text: long }; // the page's full width: eight wrapped lines
  const asStored = placeStripLog([text], 0.3, page);
  assert.ok(asStored.y < 100, `as stored the text counts as 40 px tall, so the log starts at ${asStored.y}, inside the text's real lines`);
  const { list, synthetic } = withTextHeights([text], (t) => t.length * 5.3);
  const sized = placeStripLog(list, 0.3, page);
  const b = elementBox(list[0]);
  assert.ok(b.h > 100, `the text is ${b.h} px tall`);
  assert.ok(sized.y >= b.y + b.h, `the log starts at ${sized.y}, below the text's real bottom ${b.y + b.h}`);
  const room = makeRoomForStripLog(list, { x: 850, y: 40, w: 200, h: 714 }, { pageW: 1123 });
  const back = withoutTextHeights(room.elements, synthetic);
  assert.ok(!("h" in back[0]), "the stand-in height is taken off again");
  assert.ok(room.narrowed + room.overlapping >= 1, "the text under the log's column was narrowed or moved");
});

test("the 'Looking N..' label starts after a legend that ends under it, keeping its right end", () => {
  const north = { id: "north", type: "north", x: 1000, y: 40 };
  const legend = { id: "legend_s1", type: "legend", x: 756, y: 40, w: 170, h: 120, items: [["Fault", "#c00"]], boundViewportId: "s1" };
  const view = { id: "s1", type: "image", x: 40, y: 40, w: 700, h: 400, sectionAzimuth: 110, naturalW: 1400, naturalH: 800, aspect: 1.75 };
  const els = tieStarterFurniture([north, view, legend], view);
  const look = els.find((e) => e.id === "look_s1");
  assert.equal(look.x + look.w, 1000 - LOOK_SHIFT + 160, "the right end stays");
  assert.ok(look.x >= 926 + 8 - 1e-9, `starts clear of the legend's right edge (926): ${look.x}`);
  assert.ok(look.w >= 100);
  // nothing in the way: as before
  const alone = tieStarterFurniture([north, view], view).find((e) => e.id === "look_s1");
  assert.equal(alone.x, 1000 - LOOK_SHIFT); assert.equal(alone.w, 160);
  // too little room left: it stays put
  assert.deepEqual(lookLabelBox({ x: 923, y: 40, w: 160 }, [{ type: "legend", x: 800, y: 40, w: 230, h: 120 }]), { x: 923, w: 160 });
  // an element on another row does not move it
  assert.deepEqual(lookLabelBox({ x: 923, y: 40, w: 160 }, [{ type: "legend", x: 756, y: 300, w: 170, h: 120 }]), { x: 923, w: 160 });
});

test("a re-imported table set does not store the survey's attitude as the collar's own (#3724 e)", () => {
  assert.deepEqual(surveyAttitudeOf(attFromText({ _attFrom: "azimuth and dip" })), { azimuth: true, dip: true });
  assert.deepEqual(surveyAttitudeOf(attFromText({ _attFrom: "azimuth" })), { azimuth: true, dip: false });
  assert.deepEqual(surveyAttitudeOf(attFromText({ _attFrom: "dip" })), { azimuth: false, dip: true });
  assert.equal(surveyAttitudeOf(""), null); assert.equal(surveyAttitudeOf("logged by the geologist"), null); assert.equal(surveyAttitudeOf(undefined), null);
  const s = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(s, /azimuth: mapping\.azimuth && !isSurveyAtt\(r\)\?\.azimuth \? num\(r\[mapping\.azimuth\]\) : undefined/);
  assert.match(s, /dip: mapping\.dip && !isSurveyAtt\(r\)\?\.dip \? flipDip\(num\(r\[mapping\.dip\]\)\) : undefined/);
  assert.match(s, /if \(attOnly\) \{ const i = attrCols\.indexOf\(attCol\); if \(i >= 0\) attrCols\.splice\(i, 1\); \}/);
});

test("the cursor's latitude / longitude print in the interface language's decimal mark (#3724 g)", () => {
  const s = read("../src/App.jsx");
  assert.match(s, /fmtNum\(ll\.y, LAT_LON_FMT\)\}\{fmtNum\(0\.5\)\.includes\(","\) \? "; " : ", "\}\{fmtNum\(ll\.x, LAT_LON_FMT\)/);
  assert.doesNotMatch(s, /ll\.y\.toFixed\(5\)/);
  assert.equal((49.123456).toLocaleString("fr", { minimumFractionDigits: 5, maximumFractionDigits: 5, useGrouping: false }), "49,12346");
});
