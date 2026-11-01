// TASKS.csv #1294 label declutter; #1255 fence names; #1173 the drape refusal; #1190 the trend's box
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { labelsToShow, declutterHoleLabels } from "../src/lib/viewer/holeLabels.js";
import { fenceLines } from "../src/lib/sectionDefs.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1294 an overlapping label is hidden, in order; apart they all show", () => {
  const b = (x, y) => ({ x, y, w: 60, h: 16 });
  assert.deepEqual(labelsToShow([b(0, 0), b(10, 0), b(100, 0), b(100, 30)]), [true, false, true, true]);
  assert.deepEqual(labelsToShow([null, b(0, 0)]), [false, true], "behind the camera");
});

test("#1294 it runs only once the camera has stopped, then not again", () => {
  const sp = (x, a = 4) => ({ position: { x, y: 0, z: 0 }, material: { userData: { labelAspect: a } }, visible: true });
  const group = { children: [sp(0), sp(0.001), sp(5)] };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const camera = { matrixWorldInverse: { elements: [...identity] }, projectionMatrix: { elements: [...identity] }, zoom: 1 };
  declutterHoleLabels(group, camera, 800, 600, 16, 1000);
  assert.equal(group.children[1].visible, true, "the camera has just changed: nothing yet");
  declutterHoleLabels(group, camera, 800, 600, 16, 1050);
  assert.equal(group.children[1].visible, true, "not long enough");
  declutterHoleLabels(group, camera, 800, 600, 16, 1200);
  assert.equal(group.children[1].visible, false, "stopped: the overlap goes");
  group.children[1].visible = true;
  declutterHoleLabels(group, camera, 800, 600, 16, 1300);
  assert.equal(group.children[1].visible, true, "done once");
});

test("#1255 an oblique fence line is named from the middle of the data; a cardinal one keeps its coordinate", () => {
  const l = fenceLines(-4711000, -4705000, 100, 60);
  assert.equal(Math.abs(Number(/-?\+?\d+/.exec(l[Math.floor(l.length / 2)].name)[0])) <= 100, true, l[Math.floor(l.length / 2)].name);
  assert.ok(!l.some((x) => /47\d{5}/.test(x.name)));
  assert.match(fenceLines(100, 300, 100, 0)[0].name, /E$/);
});

test("#1173 a draped station is refused only below the ground; #1190 the box is reported", () => {
  const s = read("python-sidecar/app/geophys/potential.py");
  assert.match(s, /clearance < \(0\.0 if req\.get\("stationsDraped"\) else 1\.0\)/);
  assert.match(read("src/components/InversionPanel.jsx"), /stationsDraped: zMode === "drape"/);
  assert.match(read("src/modules/viewer/modellingRuns.js"), /With a trend the model box is about/);
});
