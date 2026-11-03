// TASKS.csv #1631 (review #1497, Lawyers) — a repeated Layout image is written once in the project file
import test from "node:test";
import assert from "node:assert/strict";
import { poolLayoutImages, expandLayoutImages } from "../src/lib/layoutImagePool.js";
import { payloadFromFields, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";

const img = (c) => "data:image/png;base64," + c.repeat(4000);
const plan = img("A"), strip1 = img("B"), strip2 = img("C");
const pages = [
  { id: "p1", name: "Page 1", elements: [{ id: "v", type: "viewport", src: plan, x: 1 }, { id: "t", type: "text", text: "Title" }] },
  { id: "p2", name: "21AGBDD001", elements: [{ id: "v", type: "viewport", src: plan }, { id: "s", type: "image", src: strip1, meta: { thumb: "data:image/png;base64,xx" } }] },
  { id: "p3", name: "21AGBDD002", elements: [{ id: "v", type: "viewport", src: plan }, { id: "s", type: "image", src: strip2 }] },
];

test("each distinct image is written once; the round trip gives the same pages", () => {
  const pooled = poolLayoutImages(pages);
  assert.equal(pooled.__layoutImages, 1);
  assert.equal(pooled.images.length, 3);
  assert.deepEqual(pooled.items[2].elements[0], { id: "v", type: "viewport", src: { __img: 0 } });
  assert.equal(pooled.items[1].elements[1].meta.thumb, "data:image/png;base64,xx", "a short data URL stays inline");
  const text = JSON.stringify(pooled);
  assert.ok(text.length < JSON.stringify(pages).length * 0.8 && text.length < 3 * plan.length + 2000);
  assert.deepEqual(expandLayoutImages(JSON.parse(text)), pages);
});

test("without a repeat the plain array is kept (files stay as they were)", () => {
  const one = [pages[0]];
  assert.equal(poolLayoutImages(one), one);
  assert.equal(expandLayoutImages(one), one);
  assert.equal(poolLayoutImages([]).length, 0);
});

test("through the project file: save pools, load expands, pages and templates", () => {
  const live = { ...emptyFields(), layoutPages: pages, layoutTemplates: [{ id: "t1", name: "Atlas", elements: pages[1].elements }, { id: "t2", name: "Copy", elements: pages[1].elements }] };
  const saved = JSON.parse(JSON.stringify(payloadFromFields(live)));
  assert.equal(saved.layoutPages.__layoutImages, 1);
  assert.equal(saved.layoutTemplates.__layoutImages, 1);
  const back = fieldsFromPayload(saved, "x.geostrix.json");
  assert.deepEqual(back.layoutPages, pages);
  assert.deepEqual(back.layoutTemplates, live.layoutTemplates);
  assert.equal(back.activeLayoutPageId, "p1");
});
