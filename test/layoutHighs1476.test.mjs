// TASKS.csv #1476-#1478 — Layout: fit the holes' traces, north arrow with the frame's rotation, strip logs placed on the page
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { placeStripLog, stripLogTextPt } from "../src/lib/atlas.js";

test("#1478: the strip log fills the page height inside the margins, on the emptier side, never below the page", () => {
  const page = { w: 1123, h: 794 };
  const template = [{ x: 40, y: 40, w: 500, h: 300 }, { x: 40, y: 720, w: 200, h: 30 }]; // a map frame and a scale bar on the left
  const b = placeStripLog(template, 0.49, page);
  assert.equal(b.y, 40); assert.ok(b.y + b.h <= page.h - 40 + 1e-9);
  assert.ok(b.x + b.w <= page.w - 40 + 1e-9 && b.x > page.w / 2, "right side: the left holds the map");
  const wide = placeStripLog([], 2, page);
  assert.ok(wide.w <= page.w * 0.4 + 1e-9, "a wide log is capped at 40 % of the width");
  assert.ok(Math.abs(stripLogTextPt(1398, 714) - 9.5 * (714 / 1398) * 0.75) < 1e-9);
  assert.equal(stripLogTextPt(0, 714), null);
});

test("#1476 / #1477: Fit the holes uses the desurveyed traces; Sync north adds the frame's rotation", () => {
  const s = fs.readFileSync("src/modules/LayoutModule.jsx", "utf8");
  const fit = s.slice(s.indexOf("const fitViewport = async (sel, { pass = 1") /* #3018 */, s.indexOf("const onResizeStart"));
  assert.match(fit, /holeTraces\((fitCollars|collars), survey, project\?\.desurveyMethod\)/);
  // #1632 — the formula moved to layoutLinks.northRotationOf (Sync and the live arrow share it)
  assert.match(s, /const deg = northRotationOf\(sel\);/);
  assert.match(fs.readFileSync("src/lib/layoutLinks.js", "utf8"), /vp\.cameraAzimuthDeg \+ \(Number\(vp\.rotation\) \|\| 0\)/);
});

test("#1479: a frame's capture is 300 dpi of its printed size, 600 px at least, 3,000 at most", async () => {
  const { captureLongPx } = await import("../src/lib/layoutGeometry.js");
  assert.equal(captureLongPx(227, 151), 709); // a 60 x 40 mm overview: was 3,000 px (pixel ratio ~13)
  assert.equal(captureLongPx(1000, 700), 3000); // a full-page frame keeps the cap
  assert.equal(captureLongPx(100, 50), 600);
  assert.equal(captureLongPx(0, 0), 3000); // not a Layout frame
});
