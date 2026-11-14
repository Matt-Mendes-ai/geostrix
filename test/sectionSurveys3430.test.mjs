// TASKS.csv #3430 — point surveys on a section: a hidden survey left off, tips that name the survey and its units, and one ramp per survey in the key
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corridorScatter } from "../src/lib/sectionScatter.js";
import { geophysLegendGroups } from "../src/lib/legendGroups.js";

const a = { x: 0, y: 0 }, b = { x: 1000, y: 0 };
const ip = Array.from({ length: 40 }, (_, i) => ({ x: i * 25, y: 10, z: 500 - i, value: 1 + i, _src: "IP.xyz" }));
const res = Array.from({ length: 40 }, (_, i) => ({ x: i * 25, y: -10, z: 480 - i, value: 10 * (1 + i), _src: "Res.xyz" }));
const far = Array.from({ length: 30 }, (_, i) => ({ x: i * 25, y: 900, z: 400, value: i, _src: "Far.xyz" })); // outside the corridor
const surveys = { "IP.xyz": { units: "mV/V" }, "Res.xyz": { units: "Ω·m" }, "Far.xyz": { units: "nT" } };

test("#3430 the tips name the survey and its units; one ramp per survey on the section", () => {
  const s = corridorScatter({ geophysPts: [...ip, ...res, ...far], geophysStyle: { surveys } }, a, b, 50);
  assert.equal(s.counts.geophys, 80);
  assert.equal(s.find((p) => p.label.startsWith("IP.xyz")).label, "IP.xyz: 1 mV/V");
  assert.ok(s.some((p) => p.label === "Res.xyz: 10 Ω·m"));
  assert.deepEqual(s.counts.legends.map((g) => g.label), ["IP.xyz (mV/V)", "Res.xyz (Ω·m)"]); // Far.xyz is not on this section
  // the ramps are the 3D legend's (the same colours)
  const all = geophysLegendGroups({ rows: [...ip, ...res, ...far], surveys });
  assert.deepEqual(s.counts.legends[0].ramp, all.find((g) => g.key === "geophys_pts_IP.xyz").ramp);
  assert.ok(JSON.parse(JSON.stringify(s.counts)).legends.length === 2); // survives the trip to the section window
});

test("#3430 a survey hidden from its card is not on the section, and the others keep their colours", () => {
  const shown = corridorScatter({ geophysPts: [...ip, ...res], geophysStyle: { surveys } }, a, b, 50);
  const hid = corridorScatter({ geophysPts: [...ip, ...res], geophysStyle: { surveys: { ...surveys, "IP.xyz": { units: "mV/V", hidden: true } } } }, a, b, 50);
  assert.equal(hid.counts.geophys, 40);
  assert.ok(hid.every((p) => p.label.startsWith("Res.xyz")));
  assert.deepEqual(hid.map((p) => p.color), shown.filter((p) => p.label.startsWith("Res.xyz")).map((p) => p.color));
  assert.deepEqual(hid.counts.legends.map((g) => g.label), ["Res.xyz (Ω·m)"]);
});

test("#3430 one survey: its ramp is named by it", () => {
  const s = corridorScatter({ geophysPts: ip, geophysStyle: { surveys } }, a, b, 50);
  assert.deepEqual(s.counts.legends.map((g) => g.label), ["IP.xyz (mV/V)"]);
});

test("#3430 the section window draws and exports the ramps", () => {
  const w = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(w, /const surveyKeys = \(data\?\.scatterCounts\?\.legends \|\| \[\]\)\.map/);
  assert.match(w, /withModels \? \[\.\.\.\(data\.voxelSlices \|\| \[\]\), \.\.\.surveyKeys\] : \[\]/);
  assert.match(w, /<BlockModelKey slices=\{\[\.\.\.\(data\.voxelSlices \|\| \[\]\), \.\.\.surveyKeys\]\} \/>/);
});
