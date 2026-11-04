// TASKS.csv #1634 (review #1497, Lawyers) — a view sent to another page takes its scale bar and legend; the destination's starter ties to it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendElementWithFurniture } from "../src/lib/layoutLinks.js";

const section = { id: "snap1", type: "image", src: "data:x", worldWidthAtCaptureM: 1000, w: 800, h: 400 };
const page1 = [
  { id: "vp", type: "viewport" },
  section,
  { id: "bar1", type: "scale", boundTo: "snap1", meters: 200, pxPerMeter: 0.8 },
  { id: "leg1", type: "legend", boundViewportId: "snap1", items: [] },
  { id: "planbar", type: "scale", boundTo: "vp", meters: 500 },
];
const page2 = [{ id: "title", type: "title" }, { id: "north", type: "north", x: 1000, y: 40 }, { id: "scale", type: "scale", meters: 100 }];

test("Move takes the bound bar and legend; nothing is left behind; the starter bar stays free (the section brought its own)", () => {
  const r = sendElementWithFurniture(page1, page2, "snap1", true);
  assert.deepEqual(r.from.map((e) => e.id), ["vp", "planbar"]);
  assert.deepEqual(r.to.map((e) => e.id), ["title", "north", "scale", "snap1", "bar1", "leg1"]);
  assert.equal(r.to.find((e) => e.id === "scale").boundTo, undefined);
});

test("a view moved alone binds the destination's starter bar", () => {
  const r = sendElementWithFurniture([section], page2, "snap1", true);
  const bar = r.to.find((e) => e.id === "scale");
  assert.equal(bar.boundTo, "snap1");
  assert.ok(bar.pxPerMeter > 0);
});

test("Copy: new ids, the copies follow the copied view, the original keeps its own", () => {
  let n = 0;
  const r = sendElementWithFurniture(page1, page2, "snap1", false, (e) => `${e.type}_new${++n}`);
  assert.equal(r.from, page1);
  const snap = r.to.find((e) => e.type === "image"), bar = r.to.find((e) => e.type === "scale" && e.id !== "scale"), leg = r.to.find((e) => e.type === "legend");
  assert.ok(snap.id !== "snap1" && bar.boundTo === snap.id && leg.boundViewportId === snap.id);
  assert.equal(sendElementWithFurniture(page1, page2, "nope", true), null);
});

test("the store uses it", () => {
  assert.match(readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8"), /const r = sendElementWithFurniture\(src\.elements \|\| \[\], dst\.elements \|\| \[\], elementId, move\);/);
});

// LIVE 2026-11-04 on Copley: a viewport snapshot ties the page's own starter bar and arrow (ids "scale" / "north"); moving the viewport
// then carried them to a page that still had its own "scale" / "north" (two elements of one id, the starters orphaned)
test("Move: a view tied to its page's starter bar and arrow leaves them untied, and the destination's untouched starters take over", () => {
  const vp = { id: "vp1", type: "viewport", w: 800, h: 400, worldHeightAtTarget: 1000, cameraAzimuthDeg: 0 };
  const src = [{ id: "title", type: "title" }, vp, { id: "north", type: "north", boundTo: "vp1", rotation: 0 }, { id: "scale", type: "scale", boundTo: "vp1", meters: 1000, pxPerMeter: 0.4 }];
  const dst = [{ id: "title", type: "title" }, { id: "north", type: "north" }, { id: "scale", type: "scale", meters: 100 }];
  const r = sendElementWithFurniture(src, dst, "vp1", true);
  assert.deepEqual(r.from.map((e) => e.id), ["title", "north", "scale"]);
  assert.deepEqual(r.from.find((e) => e.id === "scale"), { id: "scale", type: "scale", boundTo: null, pxPerMeter: undefined, meters: 100 });
  assert.equal(r.from.find((e) => e.id === "north").rotation, null);
  assert.deepEqual(r.to.map((e) => e.id), ["title", "north", "scale", "vp1"], "no second scale or north on the destination");
  assert.equal(r.to.find((e) => e.id === "scale").boundTo, "vp1"); assert.equal(r.to.find((e) => e.id === "north").boundTo, "vp1");
  // the destination's starters already belong to another view: the moved pair comes along under new ids
  const dst2 = [{ id: "north", type: "north", boundTo: "other", rotation: 30 }, { id: "scale", type: "scale", boundTo: "other", meters: 500, pxPerMeter: 1 }];
  const r2 = sendElementWithFurniture(src, dst2, "vp1", true, (e) => `${e.type}_new`);
  assert.deepEqual(r2.from.map((e) => e.id), ["title"]);
  assert.deepEqual(r2.to.map((e) => e.id), ["north", "scale", "vp1", "north_new", "scale_new"]);
  assert.equal(r2.to.find((e) => e.id === "scale_new").boundTo, "vp1"); assert.equal(r2.to.find((e) => e.id === "scale").boundTo, "other");
});
