// TASKS.csv #3397 (Matt: "draw call outs where more than 1 drill hole is located") — the Orion plan drew 7 holes on 4 pads as 4 dots and
// 4 ids; holes from one pad now get one ring and a callout box listing each id (with its colour-by swatch), clear of the other labels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarPads, placeCallouts, placeLabels, drawCallouts, RectIndex, MAX_LISTED } from "../src/lib/collarCallouts.js";

// a canvas 2D context that records the text drawn and the boxes filled
function fakeCtx() {
  const texts = [], rects = [], arcs = [];
  return {
    texts, rects, arcs, font: "", textBaseline: "", lineWidth: 1, strokeStyle: "", fillStyle: "",
    measureText: (t) => ({ width: String(t).length * 5.5 }),
    fillText: (t, x, y) => texts.push({ t: String(t), x, y }), strokeText() {},
    fillRect: (x, y, w, h) => rects.push({ x0: x, y0: y, x1: x + w, y1: y + h }), strokeRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc: (x, y, r) => arcs.push({ x, y, r }),
  };
}
const ORION = [ // synthetic: 3 + 2 holes on two pads, 2 single holes
  { hole_id: "OR-26-01", x: 0, y: 0, status: "Complete" }, { hole_id: "OR-26-02", x: 2, y: 1, status: "Complete" }, { hole_id: "OR-26-03", x: -1, y: 2.5, status: "Abandoned" },
  { hole_id: "OR-26-04", x: 220, y: 140, status: "Complete" },
  { hole_id: "OR-26-05", x: 400, y: -60, status: "Planned" }, { hole_id: "OR-26-06", x: 403, y: -58, status: "Complete" },
  { hole_id: "OR-26-07", x: 120, y: -200, status: "Complete" },
];
const fitView = (rows, W = 800, H = 600) => {
  const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y), e = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const m = Math.max((e[2] - e[0]) / W, (e[3] - e[1]) / H) * 1.08, cx = (e[0] + e[2]) / 2, cy = (e[1] + e[3]) / 2;
  return { m, X: (x) => (x - cx) / m + W / 2, Y: (y) => (cy - y) / m + H / 2, view: { w: W, h: H } };
};

test("the Orion holes are two pads and two single holes, at Fit and zoomed in", () => {
  for (const zoom of [1, 4]) {
    const f = fitView(ORION), m = f.m / zoom;
    const screen = ORION.map((c) => ({ x: (c.x - 200) / m + 400, y: (-c.y) / m + 300 }));
    const pads = collarPads(ORION, screen, m).map((p) => p.members);
    assert.deepEqual(pads, [[0, 1, 2], [3], [4, 5], [6]], `zoom ${zoom}`);
  }
  // zoomed in 16 times the pad's holes are 37-44 px apart: each gets its own label
  const m = fitView(ORION).m / 16, screen = ORION.map((c) => ({ x: c.x / m, y: -c.y / m }));
  assert.ok(collarPads(ORION, screen, m).every((p) => p.members.length === 1));
});

test("a pad drawn wide on screen labels each hole; a 25 m grid at Fit is not one pad (no chaining)", () => {
  const two = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
  assert.equal(collarPads(two, [{ x: 0, y: 0 }, { x: 200, y: 0 }], 0.02).length, 2); // 4 m at 2 cm a pixel: 200 px apart
  const grid = [], scr = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) { grid.push({ x: i * 25, y: j * 25 }); scr.push({ x: i * 5, y: j * 5 }); } // 5 m a pixel
  const pads = collarPads(grid, scr, 5);
  assert.ok(pads.every((p) => p.members.length <= 9), "a pad gathers the holes near its first hole only");
  assert.equal(pads.reduce((s, p) => s + p.members.length, 0), 400);
  assert.ok(pads.length > 20);
});

test("callout boxes clear what is drawn and stay on the view; no room -> null", () => {
  const idx = new RectIndex();
  idx.add({ x0: 110, y0: 60, x1: 200, y1: 100 }); // a label up and to the right of the pad
  const [a] = placeCallouts([{ x: 100, y: 100, r: 6, w: 60, h: 30 }], idx, { w: 400, h: 300 });
  assert.ok(a && !(a.box.x0 < 200 && a.box.x1 > 110 && a.box.y0 < 100 && a.box.y1 > 60));
  assert.ok(a.box.x0 >= 0 && a.box.y0 >= 0);
  assert.ok(idx.hits(a.box), "the placed box is in the index for the next ones");
  const [b] = placeCallouts([{ x: 10, y: 10, r: 6, w: 380, h: 280 }], new RectIndex(), { w: 400, h: 300 });
  assert.equal(b, null);
  // labels: the second overlaps the first and is left out
  assert.deepEqual(placeLabels([{ x: 0, y: 50, w: 40 }, { x: 10, y: 52, w: 40 }, { x: 0, y: 80, w: 40 }], new RectIndex()), [0, 2]);
});

test("drawn: every Orion id appears once, pad ids in a box with their status swatch; singles keep their plain label", () => {
  const f = fitView(ORION), ctx = fakeCtx();
  const colours = { Complete: "#2e7d32", Abandoned: "#c62828", Planned: "#1565c0" };
  const r = drawCallouts(ctx, ORION, f.X, f.Y, f.view, { colourOf: (c) => colours[c.status], dotR: 3.6, mPerPx: f.m });
  assert.deepEqual({ pads: r.pads, callouts: r.callouts, labels: r.labels }, { pads: 2, callouts: 2, labels: 2 });
  assert.deepEqual(ctx.texts.map((t) => t.t).sort(), ORION.map((c) => c.hole_id).sort(), "each id once, none dropped");
  assert.equal(ctx.rects.length, 2, "two callout boxes");
  const inBox = (t) => ctx.rects.some((b) => t.x >= b.x0 && t.x <= b.x1 && t.y >= b.y0 && t.y <= b.y1);
  for (const id of ["OR-26-01", "OR-26-02", "OR-26-03", "OR-26-05", "OR-26-06"]) assert.ok(inBox(ctx.texts.find((t) => t.t === id)), id);
  for (const id of ["OR-26-04", "OR-26-07"]) assert.ok(!inBox(ctx.texts.find((t) => t.t === id)), id);
  const [b1, b2] = ctx.rects; // the boxes do not overlap each other
  assert.ok(!(b1.x0 < b2.x1 && b2.x0 < b1.x1 && b1.y0 < b2.y1 && b2.y0 < b1.y1));
  // swatches: one per listed hole (3.5 px), plus one ring per pad
  assert.equal(ctx.arcs.filter((a) => a.r === 3.5).length, 5);
  assert.equal(ctx.arcs.filter((a) => a.r > 3.6).length, 2);
});

test("no colouring: no swatches; a pad of 12 lists MAX_LISTED - 1 ids and '+n more'", () => {
  const pad = Array.from({ length: 12 }, (_, i) => ({ hole_id: `P-${i + 1}`, x: (i % 4) * 0.5, y: Math.floor(i / 4) * 0.5 }));
  const rows = [...pad, { hole_id: "FAR", x: 300, y: 200 }];
  const f = fitView(rows), ctx = fakeCtx();
  drawCallouts(ctx, rows, f.X, f.Y, f.view, { dotR: 2.6, mPerPx: f.m, more: (n) => `+${n} more` });
  assert.equal(ctx.arcs.filter((a) => a.r === 3.5).length, 0);
  assert.ok(ctx.texts.some((t) => t.t === `+${12 - (MAX_LISTED - 1)} more`));
  assert.equal(ctx.texts.filter((t) => /^P-/.test(t.t)).length, MAX_LISTED - 1);
});

test("a pad whose callout has no room gets a short 'first id +n' label", () => {
  const rows = [{ hole_id: "A", x: 0, y: 0 }, { hole_id: "B", x: 1, y: 0 }];
  const ctx = fakeCtx();
  // a view too small for any box (the pad at its centre)
  drawCallouts(ctx, rows, (x) => 30 + x, (y) => 12 - y, { w: 80, h: 24 }, { dotR: 3, mPerPx: 1 });
  assert.deepEqual(ctx.texts.map((t) => t.t), ["A +1"]);
});

test("wired into the Maps plan (and so into Snapshot to Layout, which captures the canvas)", () => {
  const s = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /import \{ drawCallouts \} from "\.\.\/lib\/collarCallouts\.js";/);
  assert.match(s, /if \(showIds\) \{[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*drawCallouts\(ctx, collars, X, Y, size, \{ colourOf: colouring \? \(c\) => colouring\.colourOf\(c\) : undefined, dotR: ds\.r, mPerPx: v\.mPerPx/);
  assert.match(s, /const src = cv\.toDataURL\("image\/png"\);/);
});
