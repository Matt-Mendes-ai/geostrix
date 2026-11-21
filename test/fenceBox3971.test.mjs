// TASKS.csv #3971 (Matt: "I want to have the option to draw a box here before generating fence series and that will be my boundary for the fence
// series") — the series covers a box: turned to the series azimuth, its corners editable, the sections only those across it, each cut at its edges;
// a boundary or claim gives its box; the choice is saved with the project. Made-up coordinates only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seriesFrame, boxRange, boxCorners, boxFromCorners, moveCorner, boxAround, areaBox, fenceLinesInBox, isBox } from "../src/lib/fenceBox.js";
import { fenceLinesWithData } from "../src/lib/sectionDefs.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const grid = () => { const pts = []; for (let x = -1000; x <= 1000; x += 20) for (let y = -1000; y <= 1000; y += 20) pts.push({ x, y }); return pts; };

test("the box turns with the azimuth: its corners, two opposite corners back to the box, a corner moved with its opposite held", () => {
  for (const az of [0, 30, 117, 270]) {
    const box = boxFromCorners({ x: 10, y: 20 }, { x: 410, y: 320 }, az), c = boxCorners(box, az);
    assert.ok(isBox(box));
    const back = boxFromCorners(c[0], c[2], az);
    for (const k of ["cx", "cy", "len", "wid"]) assert.ok(close(back[k], box[k]), `${az} ${k}`);
    // the long sides lie along the section lines: corner 0 -> 1 runs along the azimuth
    const f = seriesFrame(az), dx = c[1].x - c[0].x, dy = c[1].y - c[0].y;
    assert.ok(close(dx * f.perpX + dy * f.perpY, 0), "0 -> 1 along the lines");
    const m = moveCorner(box, az, 2, { x: c[2].x + 50 * f.dirX, y: c[2].y + 50 * f.dirY });
    assert.ok(close(boxCorners(m, az)[0].x, c[0].x) && close(boxCorners(m, az)[0].y, c[0].y), "the opposite corner stays");
    assert.ok(close(m.len, box.len + 50));
  }
});

test("only the sections across the box, each cut at its ends; no box: as before", () => {
  const pts = grid();
  const all = fenceLinesInBox(pts, 0, 50, null, null);
  assert.deepEqual(all, fenceLinesWithData(pts, 0, 50, null), "no box: the old series");
  const box = { cx: 0, cy: 0, len: 400, wid: 200 }; // azimuth 0: lines run north, 400 m long, across 200 m of east
  const r = fenceLinesInBox(pts, 0, 50, null, box);
  assert.deepEqual(r.lines.map((l) => l.t), [-100, -50, 0, 50, 100]);
  assert.equal(r.s0, -200); assert.equal(r.s1, 200);
  assert.deepEqual(boxRange(box, 0), { s0: -200, s1: 200, t0: -100, t1: 100 });
  const empty = fenceLinesInBox(pts, 0, 50, null, { cx: 5000, cy: 5000, len: 100, wid: 100 });
  assert.equal(empty.lines.length, 0, "a box with no data in it: no section");
});

test("a boundary or claim gives the box round it at the azimuth; a boundary that is gone gives none", () => {
  const sq = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 0, y: 100 }];
  const boundaries = [{ id: "c1", name: "Test claim", kind: "claim", polylines: [sq], closedFlags: [true] }];
  const b0 = areaBox({ kind: "boundary", id: "c1" }, 0, boundaries);
  assert.ok(close(b0.cx, 150) && close(b0.cy, 50) && close(b0.len, 100) && close(b0.wid, 300), JSON.stringify(b0));
  const b90 = areaBox({ kind: "boundary", id: "c1" }, 90, boundaries);
  assert.ok(close(b90.len, 300) && close(b90.wid, 100), "turned with the azimuth");
  assert.equal(areaBox({ kind: "boundary", id: "gone" }, 0, boundaries), null);
  assert.equal(areaBox(null, 0, boundaries), null, "all the drilling");
  assert.deepEqual(areaBox({ kind: "box", box: { cx: 1, cy: 2, len: 3, wid: 4 } }, 0), { cx: 1, cy: 2, len: 3, wid: 4 });
  assert.equal(boxAround([], 0), null);
});

test("wired: the pane's Area, the box on the view, the series clipped, the choice saved with the project", () => {
  const f = read("../src/modules/viewer/FenceOptions.jsx"), v = read("../src/modules/ViewerModule.jsx");
  assert.match(f, /<option value="all">\{tr\("All the drilling"\)\}<\/option>/);
  assert.match(f, /<option value="draw">\{tr\("Draw a box…"\)\}<\/option>/);
  assert.match(f, /fetchAreaChoices\(\{ boundaries \}, \{ marginM: 0 \}\)\.filter\(\(c\) => c\.kind === "boundary" \|\| c\.kind === "claim"\)/);
  assert.match(f, /const r = useMemo\(\(\) => fenceLinesInBox\(pts, azimuth, width, traces, box\)/, "the live count is the box's");
  assert.match(f, /if \(done\) \{ if \(draftRef\.current\) setArea\?\.\(\{ kind: "box", box: draftRef\.current \}\);/, "one change saved per drag");
  assert.match(v, /const \{ fenceLinesInBox, areaBox \} = await import\("\.\.\/lib\/fenceBox\.js"\);/, "loaded with the series, not at startup");
  assert.match(v, /fenceLinesInBox\(pts, sliceSeriesAzimuth, width, shownT, areaBox\(fenceArea, sliceSeriesAzimuth, boundaries\)\); if \(s0 != null\) \{ sMin = s0; sMax = s1; \}/);
  assert.match(v, /setFenceArea\(s\.fenceArea \|\| null\);/); assert.match(v, /fenceArea, \/\/ #3971/);
  assert.doesNotMatch(v, /^import [^\n]* from "\.\.\/lib\/fenceBox\.js"/m);
});
