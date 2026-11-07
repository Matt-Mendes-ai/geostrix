// TASKS.csv #1489 — the starter page names the project, a section page says which way it looks instead of a north arrow,
// {date} is ISO, and a viewport has one name in every list.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_LAYOUT_ELEMENTS } from "../src/lib/projectFields.js";
import { tieStarterFurniture, bearingText, sectionLookText } from "../src/lib/layoutLinks.js";

test("the starter title is {project}", () => {
  assert.equal(DEFAULT_LAYOUT_ELEMENTS.find((e) => e.id === "title").text, "{project}");
});

test("bearings and the looking direction (start of the section on the left: faces azimuth - 90)", () => {
  assert.deepEqual([0, 25, 90, 115, 180, 205, 270, 295, 360, -10].map(bearingText), ["N", "N25°E", "E", "S65°E", "S", "S25°W", "W", "N65°W", "N", "N10°W"]);
  assert.equal(sectionLookText(115), "Looking N25°E"); // a line running ESE (115°) is seen from the SSW, looking N25°E
  assert.equal(sectionLookText(90), "Looking N"); // west -> east, start on the left: looking north
  assert.equal(sectionLookText(0), "Looking W"); // south -> north: looking west
});

const page = () => DEFAULT_LAYOUT_ELEMENTS.map((e) => ({ ...e }));
const section = { id: "img1", type: "image", w: 700, h: 300, naturalW: 1400, naturalH: 600, worldWidthAtCaptureM: 1000, sectionTabId: "s", sectionAzimuth: 115 };

test("a section snapshot as the page's view: the starter north arrow becomes 'Looking ...'; the bar still binds", () => {
  const out = tieStarterFurniture(page(), section);
  assert.ok(!out.some((e) => e.type === "north"));
  const look = out.find((e) => e.id === "look_img1");
  assert.equal(look.type, "text");
  assert.equal(look.text, "Looking N25°E");
  assert.equal(look.boundTo, "img1");
  assert.equal(out.find((e) => e.type === "scale").boundTo, "img1");
});

test("a north arrow already in use, a plan map, or a section with no azimuth: the arrow stays", () => {
  const tied = page().map((e) => (e.type === "north" ? { ...e, rotation: 30, boundTo: "vp1" } : e));
  assert.ok(tieStarterFurniture(tied, section).some((e) => e.type === "north"));
  assert.ok(tieStarterFurniture(page(), { ...section, planMap: true }).some((e) => e.type === "north"));
  assert.ok(tieStarterFurniture(page(), { ...section, sectionAzimuth: null }).some((e) => e.type === "north"));
  assert.ok(tieStarterFurniture(page(), section, { north: false }).some((e) => e.type === "north"));
});

test("wiring: the snapshot carries the azimuth, {date} is ISO, one viewport name in every list", () => {
  const sw = fs.readFileSync("src/components/SectionWindow.jsx", "utf8");
  assert.match(sw, /sectionAzimuth: data\?\.section \?/);
  const s = fs.readFileSync("src/modules/LayoutModule.jsx", "utf8");
  assert.match(s, /sectionAzimuth: Number\.isFinite\(img\.sectionAzimuth\)/);
  assert.match(s, /date: `\$\{today\.getFullYear\(\)\}-\$\{p2\(today\.getMonth\(\) \+ 1\)\}-\$\{p2\(today\.getDate\(\)\)\}`/);
  assert.doesNotMatch(s, /toLocaleDateString\(\)/);
  assert.equal((s.match(/viewportName\(/g) || []).length, 5); // the definition + legend, grid, overview, scale-bar lists
  assert.doesNotMatch(s, /\?\.name \|\| el\.id\}<\/option>/);
});
