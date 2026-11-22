// TASKS.csv #4002 — the 3D view's bars along the trace (#3943) in the section window: the chosen minerals as lanes on this section's holes, clipped
// to the buffer, on the 3D view's scale and colours; the assays drawn as bars take the elements' hues and the 3D view's scale; the key lists each
// bar scale; nothing when the 3D view draws no bars. And the wiring: the payload sends them, SectionSVG draws the mineral lanes before the grade
// bars, the key (and with it the exports and Snapshot to Layout) carries the scale. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sectionBarSets, withAssayBarLook } from "../src/lib/sectionBars.js";
import { groupSectionLegend } from "../src/lib/sectionLegend.js";

const R = (hole_id, from, to, value, extra) => ({ hole_id, from, to, value, extra });
const rows = [R("DH-1", 0, 2, "Py", 2), R("DH-1", 0, 2, "Cpy", 4), R("DH-1", 2, 4, "Py", 8), R("DH-2", 0, 2, "Py", 6)];
const colours = { Py: "#aaaa00", Cpy: "#cc6600" };
const mnlgy = (o = {}) => ({ rows, chosen: ["code:Py", "code:Cpy"], on: true, codeColour: (v) => colours[v], ...o });

test("#4002 mineral bars on the section: this section's holes, one lane per chosen mineral, the 3D view's whole-project scale and colours", () => {
  const { mineralBars, assayLanes, keyRows } = sectionBarSets({ holeIds: new Set(["DH-1"]), mnlgy: mnlgy() });
  assert.equal(assayLanes, null);
  assert.deepEqual(mineralBars.bars.map((b) => [b.hole_id, b.from, b.lane, b.f, b.v]), [["DH-1", 0, 0, 0.25, 2], ["DH-1", 0, 1, 0.5, 4], ["DH-1", 2, 0, 1, 8]]); // DH-2 is off the section
  assert.deepEqual(mineralBars.lanes.map((l) => [l.label, l.colour, l.full]), [["Py", "#aaaa00", 8], ["Cpy", "#cc6600", 8]]); // the full bar from every hole, as the 3D legend
  assert.deepEqual(keyRows, [["Mineralization bars: Py ▮ = 8 %", "#aaaa00"], ["Mineralization bars: Cpy ▮ = 8 %", "#cc6600"]]);
  const g = groupSectionLegend([...keyRows, ["Lithology: Andesite", "#888888"]]); // beside the logs: its own heading
  assert.deepEqual(g.slice(0, 3), [["Mineralization bars", null, { heading: true }], ["Py ▮ = 8 %", "#aaaa00"], ["Cpy ▮ = 8 %", "#cc6600"]]);
});

test("#4002 the bars are clipped to the runs in the buffer, follow the rows shown, and are off when the 3D view draws none", () => {
  const clip = (h, f, t) => [[Math.max(f, 1), Math.min(t, 3)]].filter(([a, b]) => b - a > 1e-6);
  const { mineralBars } = sectionBarSets({ holeIds: new Set(["DH-1"]), clip, mnlgy: mnlgy() });
  assert.deepEqual(mineralBars.bars.map((b) => [b.from, b.to, b.lane]), [[1, 2, 0], [1, 2, 1], [2, 3, 0]]);
  const shown = sectionBarSets({ holeIds: new Set(["DH-1"]), mnlgy: mnlgy({ shown: (r) => r.value !== "Cpy" }) }).mineralBars;
  assert.deepEqual(shown.bars.map((b) => b.lane), [0, 0]);
  for (const off of [{ on: false }, { chosen: [] }, { chosen: undefined }]) {
    const s = sectionBarSets({ holeIds: new Set(["DH-1"]), mnlgy: mnlgy(off), assay: { on: false } });
    assert.equal(s.mineralBars, null); assert.equal(s.assayLanes, null); assert.deepEqual(s.keyRows, []);
  }
});

test("#4002 assays as the 3D view's bars: the first elements' lanes, each its own hue and 98th-percentile scale; the other points unchanged", () => {
  const assays = [{ hole_id: "DH-1", from: 0, to: 1, values: { Cu: 0.5, Au: 2 } }, { hole_id: "DH-1", from: 1, to: 2, values: { Cu: 1, Au: 0.1 } }];
  const hue = { Cu: "#e15759", Au: "#f2c94c" };
  const { assayLanes, keyRows } = sectionBarSets({ holeIds: new Set(["DH-1"]), assay: { on: true, rows: assays, syms: ["Cu", "Au"], units: { Cu: "%", Au: "g/t" }, hue: (s) => hue[s] } });
  assert.deepEqual(assayLanes, { Cu: { lane: 0, colour: "#e15759", full: 1, unit: "%" }, Au: { lane: 1, colour: "#f2c94c", full: 2, unit: "g/t" } });
  assert.deepEqual(keyRows, [["Assay bars: Cu ▮ = 1 %", "#e15759"], ["Assay bars: Au ▮ = 2 g/t", "#f2c94c"]]);
  const pts = [{ hole_id: "DH-1", md: 0.5, color: "#000", assay: { sym: "Au", value: 1, idx: 3 } }, { hole_id: "DH-1", md: 0.5, assay: { sym: "Zn", value: 4, idx: 4 } }, { hole_id: "DH-1", md: 3, color: "#123", layer: "magsusc" }];
  const looked = withAssayBarLook(pts, assayLanes);
  assert.deepEqual(looked.map((p) => [p.assay?.sym ?? p.layer, p.color, p.assay?.idx, p.assay?.f]), [["Au", "#f2c94c", 1, 0.5], ["magsusc", "#123", undefined, undefined]]); // Zn: no lane, not drawn
  assert.equal(withAssayBarLook(pts, null), pts);
});

test("#4002 wiring: the payload sends the bars, SectionSVG draws the mineral lanes before the grade bars, the key carries the scale", () => {
  const pay = fs.readFileSync(new URL("../src/modules/viewer/sectionPayload.js", import.meta.url), "utf8");
  assert.match(pay, /sectionBarSets\(\{ holeIds, clip,/);
  assert.match(pay, /chosen: layerStyles\?\.mnlgy\?\.bars/);
  assert.match(pay, /on: !!layerStyles\?\.assay\?\.bars/);
  assert.match(pay, /mineralBars: barSets\.mineralBars, barKeyRows: barSets\.keyRows/);
  assert.match(pay, /barSets\.assayLanes \? \[\]/); // the grade classes are not keyed for bars in the elements' hues
  // a new section and a reopened one both pass them on (each picks the payload's fields by name), and a reopen reads the bars chosen now
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal(vm.match(/scatterCounts, mineralBars, barKeyRows \/\* #4002 \*\/ \} = await buildSectionPayload\(/g)?.length, 2);
  assert.match(vm, /openSectionOrSay\(\{ id, title: name, mineralBars, barKeyRows, /);
  assert.match(vm, /openSectionOrSay\(\{ id: s\.id, title: s\.name, mineralBars, barKeyRows, /);
  assert.match(vm.slice(vm.indexOf("const reopenSection = useCallback(")), /^[^\n]*\n(?:[^\n]*\n){0,8}?\s*\}, \[[^\n]*layerStyles \/\* #4002/);
  const s = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  const svg = s.slice(s.indexOf("function SectionSVG("));
  assert.match(svg, /mineralBars = null \} = data/);
  assert.match(svg, /gradeBarMax\(collarGap, ribbonReach, Math\.max\(1, mLanes \+ aLanes\)\)/); // every lane fits between the collars
  assert.ok(svg.indexOf("data-mineral-bars") > 0 && svg.indexOf("data-mineral-bars") < svg.indexOf("const base = laneBase(aShift + a.idx)"), "the mineral lanes first, the grade bars after them");
  assert.match(svg, /aShift = assayLook \? mLanes : 0, aSide = \(holeId\) => \(assayLook \? sideOf\(holeId\) : 1\)/); // the #392 bars keep their side and lanes
  assert.match(svg, /off = laneBase\(aShift \+ idx\) \+ BAR_MAX \+ 3/); // the intercept brackets beyond their element's lane
  // the bars on the hole's right as drawn, one side per hole: screenNormal of a hole drawn downward points left, so it is turned round
  assert.match(svg, /barSide\[holeId\] = nx < -1e-6 \|\| \(Math\.abs\(nx\) <= 1e-6 && ny > 0\) \? -1 : 1/);
  assert.match(svg, /sd = sideOf\(b\.hole_id\), nx = nx0 \* sd/);
  assert.match(svg, /a\.f != null \? Math\.max\(1, a\.f \* BAR_MAX\)/);
  // the key (the window's, its PNG / SVG / PDF furniture and Snapshot to Layout's legendItems all come from keyRows)
  assert.match(s, /\.\.\.\(data\.barKeyRows \|\| \[\]\)/);
  assert.match(s, /exportOpts = \(\) => \(showKey \? \{ furniture: sectionKeyFurniture\(keyRows\(true\)\) \}/);
  assert.match(s, /legendItems: keyRows\(true\)/);
});
