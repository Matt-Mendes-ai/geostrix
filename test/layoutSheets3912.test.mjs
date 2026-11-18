// TASKS.csv #3912 (redesign P9) — one-click sheets in Layout (lib/layoutSheets.js). Each sheet holds a title, its map or picture, a legend and the
// scale; a map carries a north arrow (a section its 'looking' label); the data credit comes with every new page (the store's addLayoutPages, #3854);
// nothing lies off the page. SYNTHETIC holes and pictures only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSheet, sectionSheet, logSheet, interceptsSheet, sheetSources } from "../src/lib/layoutSheets.js";
import { offSheetElements } from "../src/lib/layoutEdges.js";
import { pagePx } from "../src/lib/pageFormats.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const PRESETS = [500, 1000, 1500, 2000, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 50000];
const collars = Array.from({ length: 12 }, (_, i) => ({ hole_id: `DH-23-${100 + i}`, x: 500000 + (i % 4) * 150, y: 5500000 + Math.floor(i / 4) * 200, z: 300, azimuth: 90, dip: -60, length: 150 }));
const KEY = [["Drilled hole", "#1a2028"], ["Planned hole", "#2f6fe0"]];
const types = (els) => els.map((e) => e.type);

test("#3912 Plan map: title, the drill plan at a round scale, its key, a north arrow, a scale bar tied to the plan, all on the page", () => {
  for (const format of [null, { size: "A3", orientation: "landscape" }, { size: "Letter", orientation: "portrait" }]) {
    const { elements } = planSheet({ format, collars, legendItems: KEY, presets: PRESETS, stamp: 1 });
    assert.deepEqual(types(elements), ["title", "drillplan", "north", "scale", "legend"]);
    const plan = elements[1], bar = elements[3];
    assert.ok(PRESETS.includes(plan.scale));
    assert.equal(bar.boundTo, plan.id, "the bar follows the plan's scale");
    assert.ok(bar.pxPerMeter > 0);
    assert.deepEqual(offSheetElements(elements, pagePx(format)), [], JSON.stringify(format));
    const legend = elements[4];
    assert.ok(legend.x >= plan.x + plan.w, "the legend beside the plan, not over it");
  }
  assert.equal(planSheet({ collars: [], presets: PRESETS }), null, "no hole: no sheet");
});

test("#3912 Cross-section: the newest section picture at a round scale, its legend, its 'looking' label and a tied scale bar", () => {
  const sec = { id: "s1", type: "image", label: "Section A", worldWidthAtCaptureM: 800, naturalW: 1600, naturalH: 900, legendItems: KEY, sectionAzimuth: 45, sectionTabId: "tab1", src: "data:" };
  const { elements } = sectionSheet({ source: sec, presets: PRESETS, stamp: 2 });
  assert.deepEqual(types(elements), ["title", "image", "text", "scale", "legend"]);
  assert.match(elements[2].text, /^Looking /);
  assert.equal(elements[3].boundTo, elements[1].id);
  assert.equal(elements[1].sectionTabId, undefined, "a copy: a re-draw goes to the original picture");
  assert.deepEqual(offSheetElements(elements, pagePx(null)), []);
});

test("#3912 Hole log and Intercepts table: no map, so no north arrow or map scale bar; on the page", () => {
  const log = { id: "l1", type: "image", label: "DH-23-101", depthHeightAtCaptureM: 150, naturalW: 400, naturalH: 1800, legendItems: KEY, src: "data:" };
  const portrait = { size: "A4", orientation: "portrait" };
  const l = logSheet({ source: log, format: portrait, stamp: 3 });
  assert.deepEqual(types(l.elements), ["title", "image", "legend"]);
  assert.deepEqual(offSheetElements(l.elements, pagePx(portrait)), []);
  const t = interceptsSheet({ source: { id: "t1", type: "table", source: "static", title: "Best intercepts", w: 700 }, stamp: 4 });
  assert.deepEqual(types(t.elements), ["title", "table"]);
  assert.deepEqual(offSheetElements(t.elements, pagePx(null)), []);
});

test("#3912 the sources: the newest of each kind across the pages", () => {
  const a = { id: "a", type: "image", worldWidthAtCaptureM: 500 }, b = { id: "b", type: "image", worldWidthAtCaptureM: 600 }, log = { id: "l", type: "image", depthHeightAtCaptureM: 90 }, tab = { id: "t", type: "table", source: "static" };
  const s = sheetSources([{ elements: [a, log] }, { elements: [b, tab, { id: "c", type: "table", source: "collars" }] }]);
  assert.deepEqual([s.section.id, s.log.id, s.intercepts.id], ["b", "l", "t"]);
});

test("#3912 wiring: a sheet is a new page through the store's addLayoutPages (which adds the data credit); the Sheets group leads the ribbon", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /addPagesOnPaper\(addLayoutPages, setLayoutPageFormat, \[\{ name, elements: res\.elements \}\], fmt\);/);
  assert.ok(m.indexOf('<RibbonGroup label="Sheets">') < m.indexOf('<RibbonGroup label="Insert">'));
  assert.match(m, /<RibbonButton icon=\{MapPinned\} label="Plan map" tone="output"[^\n]*onClick=\{\(\) => makeSheet\("plan"\)\}/);
  assert.match(read("../src/lib/store.jsx"), /const credited = creditedNow\(rawPages\), pages = credited \|\| rawPages;/);
});

test("#3912 wiring: Cross-section lays out the newest section sent to Layout, and says what to do when there is none", () => {
  const m = read("../src/modules/LayoutModule.jsx");
  assert.match(m, /const sheetSrc = useMemo\(\(\) => sheetSources\(layoutPages\), \[layoutPages\]\);/);
  assert.match(m, /if \(kind === "section"\) \{ res = sectionSheet\(\{ format: fmt, credit: credits, source: sheetSrc\.section, presets: SCALE_PRESETS, stamp \}\); name = tr\("Cross-section"\); \}/);
  assert.match(m, /label="Cross-section" tone="output" disabled=\{!sheetSrc\.section\} disabledReason="Send a section to Layout first \(Snapshot in the section window\)"[^\n]*onClick=\{\(\) => makeSheet\("section"\)\}/);
});
