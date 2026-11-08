// TASKS.csv #1558 / #1559 — training points dropped by the study area are counted; the best cutoff needs occurrences on both sides
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestCutoff, trainingCoverage, trainingCells, MIN_SIDE } from "../src/lib/evidence.js";

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test("#1559 the best cutoff has at least MIN_SIDE occurrence cells on each side and the largest C/s among those", () => {
  const n = 1000, values = new Float64Array(n), valid = new Array(n).fill(true);
  for (let k = 0; k < n; k++) values[k] = k + rnd() * 0.5; // the evidence rises with the cell index
  const D = new Set();
  for (let k = 900; k < 1000; k += 3) D.add(k); // 34 occurrences in the top tenth
  for (const k of [12, 150, 333, 480, 610, 777]) D.add(k); // 6 well below: a cutoff that strands one of them must not win on raw contrast
  const bc = bestCutoff(values, D, valid);
  assert.ok(bc.best && !bc.best.thin && bc.best.nBD >= MIN_SIDE && bc.best.nD - bc.best.nBD >= MIN_SIDE, JSON.stringify(bc.best));
  const sound = bc.table.filter((r) => r.nBD >= MIN_SIDE && bc.ND - r.nBD >= MIN_SIDE);
  assert.equal(bc.best.studC, Math.max(...sound.map((r) => r.studC)));
  assert.ok(bc.table.some((r) => r.C > bc.best.C), "a higher raw contrast exists on a thin cutoff and was not taken");
});

test("#1559 with too few occurrences the best is flagged thin (the #1726 zero-cell case still returns one)", () => {
  const n = 400, values = new Float64Array(n), valid = new Array(n).fill(true);
  for (let k = 0; k < n; k++) values[k] = k < 3 ? 5000 + k : 10 + (k % 97);
  const r = bestCutoff(values, new Set([0, 1, 2]), valid);
  assert.ok(r.best && r.best.thin && r.best.corrected && r.best.nD === 3, JSON.stringify(r.best));
});

test("#1558 coverage: points in the grid, their cells, and the cells the mask dropped", () => {
  const g = { x0: 0, yTop: 90, dx: 10, dy: 10, nx: 10, ny: 10 };
  const valid = new Uint8Array(100).fill(1); for (let k = 50; k < 100; k++) valid[k] = 0; // the south half has no evidence
  const pts = [{ x: 0, y: 90 }, { x: 10, y: 90 }, { x: 10, y: 90 }, { x: 20, y: 0 }, { x: 30, y: 0 }, { x: -50, y: 50 }, { x: 500, y: 50 }]; // on the nodes: two on one cell, two in the masked south, two off the grid
  const c = trainingCoverage(g, pts, valid);
  assert.deepEqual([c.points, c.inGrid, c.cells, c.validCells, c.droppedCells], [7, 5, 4, 2, 2]);
  assert.equal(c.droppedShare, 0.5);
  assert.equal(trainingCells(g, pts, valid).size, 2);
});

test("wired: the pane counts the drop, names the raster by cells, shows the counts and the thin flag on each row", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /out\.cover = trainingPoints\.length \? trainingCoverage\(grid, trainingPoints, valid\) : null;/);
  assert.match(p, /Plan-view weights-of-evidence posterior \(\{n\} occurrence cells\)/); // plan view: #1458
  assert.match(p, /droppedShare > 0\.25 \? "var\(--color-warn-text\)"/);
  assert.match(p, /\{a\} of \{d\} occurrence cells inside the pattern \(\{b\} cells\)/);
  assert.match(p, /r\.thin \? " · " \+ tr\("thin: fewer than \{m\} occurrence cells on one side/);
  assert.match(p, /r\.used = !r\.none && \(!r\.thin \|\| !anySound\); if \(r\.used\) chosen\.push\(/, "a thin layer stays out of the posterior when sound layers exist (and a card with no weight, #2098)");
  assert.match(p, /tr\("left out of the posterior"\)/);
});
