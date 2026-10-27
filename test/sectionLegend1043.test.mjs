// TASKS.csv #1043 — the cross-section window's own key (drawn inside its <svg>, so the exports carry it)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionLegendLayout, SECTION_LEGEND_MAX } from "../src/lib/sectionLegend.js";

test("no items: no legend and no extra page height", () => {
  assert.deepEqual(sectionLegendLayout(null, 980), { entries: [], more: 0, height: 0 });
  assert.equal(sectionLegendLayout([], 980).height, 0);
});

test("items read down columns, keep colour and kind, long labels are shortened", () => {
  const items = [["Andesite", "#a33"], ["Basalt", "#333"], ["Fault", "#f00", { kind: "line" }], ["Model: Unit 1", "#0a0"], ["A".repeat(60), "#00f"]];
  const L = sectionLegendLayout(items, 980);
  assert.equal(L.entries.length, 5);
  assert.equal(L.more, 0);
  // 5 items in 4 columns = 2 rows: column-major, so item 1 is under item 0 and item 2 starts column 2
  assert.equal(L.entries[0].x, 0); assert.equal(L.entries[1].x, 0); assert.ok(L.entries[1].y > L.entries[0].y);
  assert.equal(L.entries[2].x, 245); assert.equal(L.entries[2].kind, "line"); assert.equal(L.entries[2].color, "#f00");
  assert.ok(L.entries[4].label.length <= 34 && L.entries[4].label.endsWith("…"));
  assert.equal(L.entries[4].full, "A".repeat(60));
  assert.ok(L.height > 0);
});

test("over the cap: the rest counted as '+ n more'", () => {
  const items = Array.from({ length: SECTION_LEGEND_MAX + 7 }, (_, i) => [`Unit ${i}`, "#888"]);
  const L = sectionLegendLayout(items, 980);
  assert.equal(L.entries.length, SECTION_LEGEND_MAX);
  assert.equal(L.more, 7);
  assert.ok(L.height > sectionLegendLayout(items.slice(0, SECTION_LEGEND_MAX), 980).height);
});

test("SectionSVG draws the legend inside the svg and grows the viewBox, with a Legend toggle", () => {
  const src = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(src, /viewBox=\{`0 0 \$\{W\} \$\{totalH\}`\}/);
  assert.match(src, /legendItems=\{showLegend \? shownLegendItems : null\}/);
  assert.match(src, /legend\.entries\.map/);
});
