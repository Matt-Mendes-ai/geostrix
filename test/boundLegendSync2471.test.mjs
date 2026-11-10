// TASKS.csv #2471 (review #2325, WA uranium) — a legend bound to a viewport follows that viewport's refresh, or says it is out of step
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legendSyncState, staleBoundLegends, sameLegendItems } from "../src/lib/layoutLegendSync.js";

const U = [["U (ppm)", null, { heading: true }], ["<= 8.00", "#2c7bb6"], ["8.00-223.0", "#fdae61"]];
const vp = (capturedAt, extra = {}) => ({ id: "vp1", type: "viewport", capturedAt, ...extra });
const legend = (extra) => ({ id: "lg1", type: "legend", boundViewportId: "vp1", items: U, loadedItems: U, loadedCapturedAt: 100, ...extra });

test("a refreshed viewport reloads an unedited legend, keeps an edited one and flags it", () => {
  assert.equal(legendSyncState(legend(), vp(100)), "current");
  assert.equal(legendSyncState(legend(), vp(200)), "reload"); // the review's case: U rows, viewport now on Th
  const edited = legend({ items: [...U.slice(0, 2), ["8 to 223 ppm", "#fdae61"]] });
  assert.equal(legendSyncState(edited, vp(200)), "stale");
  assert.equal(legendSyncState(edited, vp(200, { refreshing: true })), null); // not while it renders
  assert.equal(legendSyncState(legend({ loadedCapturedAt: undefined, loadedItems: undefined }), vp(200)), "stale"); // loaded before #2471
  assert.equal(legendSyncState(legend(), vp(undefined)), null); // a viewport captured before #2471
  assert.equal(legendSyncState(legend({ boundViewportId: null }), vp(200)), null);
  assert.ok(sameLegendItems(U, U.map((r) => [...r])) && !sameLegendItems(U, U.slice(1)));
});

test("the export check counts out-of-step legends on every page", () => {
  const pages = [{ id: "a", elements: [vp(200), legend({ items: U.slice(1) })] }, { id: "b", elements: [{ ...vp(300), id: "vp2" }, { ...legend(), id: "lg2", boundViewportId: "vp2" }] }];
  assert.equal(staleBoundLegends(pages).length, 1); // page b's legend reloads, page a's was edited
});

test("viewports carry capturedAt, loads stamp the legend, and a refresh reloads it", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.equal((s.match(/capturedAt: Date\.now\(\)/g) || []).length, 2);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /const stamp = \(items\) => \(\{ items, loadedItems: items, loadedCapturedAt: vp\.capturedAt \|\| null, autoReloaded: auto \}\);/);
  assert.match(l, /\{legendReloaded \? " " \+ tr\("The bound legend reloaded with the refreshed viewport\."\) : ""\}/);
  assert.match(l, /legendSyncState\(e, byId\.get\(e\.boundViewportId\)\) === "reload"\)\.forEach\(\(l\) => syncLegendFromView\(l\.id, \{ auto: true \}\)\)/);
  assert.match(l, /const staleLegends = staleBoundLegends\(layoutPages\)\.length;/);
  assert.match(l, /Captured \{when\}\. Changes in the 3D view since then show after a refresh\./);
});
