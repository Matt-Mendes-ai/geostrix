// TASKS.csv #1841 / #1810 / #1867 (review #1646, Kodiak) — interval data with no collars: the tools say what is waiting for collars, and
// the legend lists only what the sheet draws
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intervalsWaiting, noCollarsNotice, interceptsDisabledText } from "../src/lib/noCollars.js";
import { categoryLegendGroups } from "../src/lib/legendGroups.js";

const layers = {
  litho: [{ hole_id: "K-1", from: 0, to: 5, value: "AND" }, { hole_id: "K-1", from: 5, to: 9, value: "DIO" }, { hole_id: "K-2", from: 0, to: 4, value: "AND" }],
  alt: [{ hole_id: "K-2", from: 0, to: 4, value: "POT" }],
};

test("#1841 the count of what is waiting and the run notice that says it; with nothing loaded, the old message", () => {
  assert.deepEqual(intervalsWaiting(layers, [{ hole_id: "K-3" }]), { intervals: 5, holes: 3 });
  const n = noCollarsNotice("the unit body", layers, []);
  const text = typeof n === "string" ? n : JSON.stringify(n);
  assert.match(text, /The unit body needs collars/);
  assert.match(text, /4 logged intervals and assays for 2 hole\(s\) are loaded, but no collar places them in 3D/);
  const none = JSON.stringify(noCollarsNotice("the implicit model", {}, []));
  assert.match(none, /Load collars\/survey data before running the implicit model\./);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.ok(m.includes('noCollarsNotice(isCode ? tr("the unit body") : tr("the alteration model"), layers, assays)'), "a code body no longer calls itself the alteration model");
  assert.ok(!m.includes('notice("Load collars/survey data before running'));
});

test("#1810 Intercepts' disabled reason names collars when intervals are loaded", () => {
  assert.equal(interceptsDisabledText(layers), "Needs collars: the 4 logged intervals of 2 hole(s) have no collar to place them in 3D.");
  assert.equal(interceptsDisabledText({}), "Load some lithology/alteration interval data first.");
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("boundaryWhy={collars.length ? null : interceptsDisabledText(layers)}"));
});

test("#1867 the legend leaves out the intervals of holes with no collar", () => {
  const args = { keys: ["litho", "alt"], layers, layerVisible: { litho: true, alt: true }, labelFor: (k, v) => v, colorFor: () => "#888" };
  assert.deepEqual(categoryLegendGroups(args).map((g) => g.items.map((i) => i[0])), [["AND", "DIO"], ["POT"]], "no filter: as before");
  assert.deepEqual(categoryLegendGroups({ ...args, placed: new Set(["K-1"]) }).map((g) => g.items.map((i) => i[0])), [["AND", "DIO"]]);
  assert.deepEqual(categoryLegendGroups({ ...args, placed: new Set() }), [], "no collars at all: nothing");
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(l.includes("placed: new Set((collars || []).map((c) => String(c.hole_id))) /* #1867 */"));
});

test("#1813 no collars: the assay classes leave the legend, and zoom-to says why", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("assayVisible: assayVisible && collars.length > 0 /* #1813 */"));
  assert.ok(v.includes('"{v}: not drawn, its holes have no collars."'));
  assert.ok(v.includes("}, [fitBox, collars, layers]); // collars, layers: #1813"));
});
