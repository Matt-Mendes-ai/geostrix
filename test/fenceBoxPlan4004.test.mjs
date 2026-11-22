// TASKS.csv #4004 (left by #3971) — the fence series' box drawn and edited on the Maps plan too, the same box as the 3D View's (one place keeps it:
// the 3D View, which the plan asks through the "fence-area" module action; the azimuth shared through lib/fenceShare.js), and #3954's Margin (m) for
// the box round a boundary or claim. Made-up coordinates only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shareFenceAzimuth, fenceAzimuth } from "../src/lib/fenceShare.js";
import { areaBox, boxCorners, boxFromCorners, moveCorner } from "../src/lib/fenceBox.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const close = (a, b) => Math.abs(a - b) < 1e-6;

test("#4004 the azimuth the 3D View shares is the one the plan reads", () => {
  shareFenceAzimuth(135); assert.equal(fenceAzimuth(), 135);
  shareFenceAzimuth("not a number"); assert.equal(fenceAzimuth(), 135, "kept");
  shareFenceAzimuth(20); assert.equal(fenceAzimuth(), 20);
});

test("#4004 a box drawn on the plan is the box the 3D View draws: same corners at the same azimuth", () => {
  const b = boxFromCorners({ x: 1000, y: 2000 }, { x: 1400, y: 2300 }, 30);
  const again = boxFromCorners(boxCorners(b, 30)[0], boxCorners(b, 30)[2], 30);
  for (const k of ["cx", "cy", "len", "wid"]) assert.ok(close(b[k], again[k]), k);
  const moved = moveCorner(b, 30, 1, { x: 1600, y: 2100 });
  const held = boxCorners(b, 30)[3];
  assert.ok(boxCorners(moved, 30).some((c) => close(c.x, held.x) && close(c.y, held.y)), "the opposite corner stays");
  assert.ok(boxCorners(moved, 30).some((c) => close(c.x, 1600) && close(c.y, 2100)), "the dragged corner is where it was let go");
});

test("#4004 a boundary or claim's box takes the margin on every side (0 allowed)", () => {
  const sq = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 0, y: 100 }];
  const boundaries = [{ id: "c1", name: "Test claim", kind: "claim", polylines: [sq], closedFlags: [true] }];
  const b0 = areaBox({ kind: "boundary", id: "c1" }, 0, boundaries), b250 = areaBox({ kind: "boundary", id: "c1", margin: 250 }, 0, boundaries);
  assert.ok(close(b0.len, 100) && close(b0.wid, 300));
  assert.ok(close(b250.len, 600) && close(b250.wid, 800) && close(b250.cx, 150) && close(b250.cy, 50), JSON.stringify(b250));
  assert.ok(close(areaBox({ kind: "boundary", id: "c1", margin: 0 }, 0, boundaries).len, 100));
});

test("#4004 wiring: the plan sends the box to the 3D View, which keeps, shares and clears it; the pane has the margin", () => {
  const m = read("../src/components/MapsFenceBox.jsx"), p = read("../src/components/MapsPlanView.jsx"), v = read("../src/modules/ViewerModule.jsx"), f = read("../src/modules/viewer/FenceOptions.jsx");
  assert.match(m, /const area = viewerUiState\?\.fenceArea \|\| null;/);
  assert.match(m, /const saved = useMemo\(\(\) => areaBox\(area, azimuth, boundaries\), \[area, azimuth, boundaries\]\);/);
  assert.match(m, /if \(last\) requestModuleAction\("fence-area", \{ kind: "box", box: last \}\);/, "one change sent per drag");
  assert.match(p, /const fenceBox = useFenceBoxOnPlan\(recapture \? null : v, size, planButton,/);
  assert.match(p, /\{fenceBox\.overlay\}\{\/\* #4004 — over the plan, under its panels \*\/\}/);
  assert.match(v, /useModuleAction\(\["fence-area"\], \(a, area\) => setFenceArea\(area \|\| null\)\);/);
  assert.match(v, /useEffect\(\(\) => \{ shareFenceAzimuth\(sliceSeriesAzimuth\); \}, \[sliceSeriesAzimuth\]\);/);
  assert.match(v, /setModelArea\("all"\); setHoleFilter\(""\); setFenceArea\(null\);/, "a new project starts with no box");
  assert.doesNotMatch(v, /^import [^\n]* from "\.\.\/lib\/fenceBox\.js"/m, "still not at startup");
  assert.match(v, /topView=\{\(\) => sectionTopView\(camState\.current, cameraRef\.current, null\)/, "Draw a box... turns the view without the Draw section notice");
  assert.match(f, /area\?\.kind === "boundary" && \(/);
  assert.match(f, /<NumberInput value=\{area\.margin \|\| 0\} min=\{0\} step=\{50\} onChange=\{\(m\) => setArea\?\.\(\{ \.\.\.area, margin: Math\.max\(0, Number\(m\) \|\| 0\) \}\)\}/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Fence box", "Fence series box, {l} × {w} m at {a}°: drag a corner to change it.", "Drag on the plan to draw the fence series' box, turned to its azimuth ({a}°).",
      "Drag on the view, or on Maps › Fence box, to draw it.", "Margin (m)"]) assert.ok(loc[k], `${lang}: ${k}`);
  }
});
