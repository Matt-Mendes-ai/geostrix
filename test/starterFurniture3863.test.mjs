// TASKS.csv #3863 (Scottie Gold review) — the starter page's free scale bar ('0 50 100 m' on 48 mm beside a log at 1 : 1,816) and north arrow stayed on a sheet holding only a strip log or a table.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LAYOUT_ELEMENTS } from "../src/lib/projectFields.js";
import { dropIdleStarterMapFurniture, tieStarterFurniture } from "../src/lib/layoutLinks.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const starter = () => DEFAULT_LAYOUT_ELEMENTS.map((e) => ({ ...e }));
const stripLog = { id: "img1", type: "image", x: 40, y: 140, w: 165, h: 255, depthHeightAtCaptureM: 662, naturalH: 900 };
const table = { id: "table_1", type: "table", source: "static", x: 40, y: 140, w: 600 };
const section = { id: "sec1", type: "image", x: 40, y: 140, w: 600, h: 300, worldWidthAtCaptureM: 800, sectionAzimuth: 110 };

test("a strip log or a table on a starter page: the untouched bar and arrow go, title and credit stay", () => {
  for (const content of [stripLog, table]) {
    const r = dropIdleStarterMapFurniture([...starter(), content]);
    assert.deepEqual(r.dropped, ["scale bar", "north arrow"]);
    assert.deepEqual(r.els.map((e) => e.id), ["title", "credits", content.id]);
  }
});

test("a map on the page, a bar the user tied or retyped, or an empty page: nothing is dropped", () => {
  assert.deepEqual(dropIdleStarterMapFurniture([...starter(), section]).dropped, []);
  assert.deepEqual(dropIdleStarterMapFurniture([...starter(), { id: "vp", type: "viewport", x: 0, y: 0, w: 10, h: 10 }, stripLog]).dropped, []);
  assert.deepEqual(dropIdleStarterMapFurniture(starter()).dropped, [], "no log, no table");
  const retyped = starter().map((e) => (e.id === "scale" ? { ...e, meters: 250 } : e));
  const r = dropIdleStarterMapFurniture([...retyped, stripLog]);
  assert.deepEqual(r.dropped, ["north arrow"]); assert.ok(r.els.some((e) => e.id === "scale"), "the user's bar stays");
  const turned = starter().map((e) => (e.id === "north" ? { ...e, rotation: 20 } : e));
  assert.deepEqual(dropIdleStarterMapFurniture([...turned, table]).dropped, ["scale bar"]);
});

test("a section sent to the same page still takes the bar and the arrow (the map case is unchanged)", () => {
  const els = tieStarterFurniture([...starter(), section], section);
  assert.ok(els.find((e) => e.id === "scale").boundTo === "sec1");
  assert.deepEqual(dropIdleStarterMapFurniture(els).dropped, []);
});

test("wiring: strip logs, new tables and Best intercepts drop them; the page bar says so", () => {
  const l = read("../src/modules/LayoutModule.jsx"), b = read("../src/components/BestIntercepts.jsx");
  assert.match(l, /dropIdleStarterMapFurniture\(additions\.reduce/);
  assert.match(l, /base\.type === "table" \? dropIdleStarterMapFurniture\(\[\.\.\.els, base\]\)\.els/);
  assert.match(b, /setLayoutElements\(\(els\) => dropIdleStarterMapFurniture\(\[\.\.\.els, table\]\)\.els\)/);
  for (const k of ["This sheet holds no map, so the starter page's scale bar and north arrow were removed (Undo brings them back)."]) for (const lg of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lg}.json`))[k], lg);
});
