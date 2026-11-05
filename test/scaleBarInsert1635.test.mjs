// TASKS.csv #1635 — Insert > Scale bar binds to the selected / only view; a free bar says so
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertScaleBar, scaleBarTargets, bindScaleBar, viewPxPerMetre, withLiveScaleBars } from "../src/lib/layoutLinks.js";

// a 1:20,000 plan: 400 px of page show 2,000 m of ground
const plan = { id: "vp1", type: "viewport", x: 60, y: 80, w: 600, h: 400, worldHeightAtTarget: 2000 };
const sec = { id: "img1", type: "image", x: 700, y: 80, w: 300, h: 200, worldWidthAtCaptureM: 600 };
const photo = { id: "img2", type: "image", x: 0, y: 0, w: 100, h: 100 };
const base = { id: "scale_1", type: "scale", x: 100, y: 100, meters: 100, pxPerMeter: 1.8 };

test("targets are the scaled views only", () => {
  assert.deepEqual(scaleBarTargets([plan, sec, photo, base]).map((e) => e.id), ["vp1", "img1"]);
  assert.equal(viewPxPerMetre(plan), 0.2);
  assert.equal(viewPxPerMetre(photo), null);
});

test("insert: the only view binds the bar at its scale, under it", () => {
  const b = insertScaleBar(base, [plan, photo], null);
  assert.equal(b.boundTo, "vp1"); assert.equal(b.pxPerMeter, 0.2);
  assert.ok(b.meters * b.pxPerMeter > 40 && b.meters * b.pxPerMeter < 600, "a round length near the usual size");
  assert.equal(b.y, 80 + 400 + 14);
  // follows the view afterwards
  const [, live] = withLiveScaleBars([{ ...plan, worldHeightAtTarget: 4000 }, b]);
  assert.equal(live.pxPerMeter, 0.1);
});

test("insert: the selected one of several, else free", () => {
  assert.equal(insertScaleBar(base, [plan, sec], "img1").boundTo, "img1");
  assert.equal(insertScaleBar(base, [plan, sec], null).boundTo, undefined);
  assert.equal(insertScaleBar(base, [photo], null), base);
  assert.equal(bindScaleBar(base, photo).boundTo, null);
});

test("wired: insert uses it; the bar's sidebar binds and warns when free", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /Object\.assign\(base, insertScaleBar\(base, elements, selected\)\)/);
  assert.match(m, /updateSelected\(v \? bindScaleBar\(sel, v\) : \{ boundTo: null \}\)/);
  assert.match(m, /\{!sel\.boundTo && <div[^\n]*Not tied to a view/);
});
