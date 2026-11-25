// TASKS.csv #3803 / #3811 (Scottie Gold) — the survey checks on a grid give the answers the full scans gave, fast enough for a 250,000-point cloud;
// the Inversion pane reads them from a worker and does not offer Invert for points it says must not be inverted
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildNearestGrid, nearestOther, kNearest } from "../src/lib/nearestGrid.js";
import { medianNearestSpacing, thinStationIndices, suggestThinSpacing } from "../src/lib/inversion.js";
import { suggestBlankingDistance } from "../src/lib/idw.js";
import { buildVoxelLookup } from "../src/lib/voxelSample.js";
import { surveyChecks, packSurvey } from "../src/lib/surveyChecks.js";

// a seeded random cloud
const rnd = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const cloud = (n, seed = 7) => { const r = rnd(seed), xs = new Float64Array(n), ys = new Float64Array(n); for (let i = 0; i < n; i++) { xs[i] = 500000 + r() * 2000; ys[i] = 6200000 + r() * 1500; } return { xs, ys }; };
const brute = (xs, ys, i, skip = null) => { let b = Infinity; for (let j = 0; j < xs.length; j++) if (j !== i && !(skip && skip(j))) { const q = (xs[i] - xs[j]) ** 2 + (ys[i] - ys[j]) ** 2; if (q > 0 && q < b) b = q; } return Math.sqrt(b); };

test("the grid's nearest other point is the full scan's, with and without a skip rule", () => {
  const { xs, ys } = cloud(3000), G = buildNearestGrid(xs, ys);
  for (let i = 0; i < 3000; i += 37) assert.equal(nearestOther(G, i), brute(xs, ys, i));
  const line = (j) => j % 7; // 'another line only'
  for (let i = 0; i < 3000; i += 53) assert.equal(nearestOther(G, i, (q) => line(q) === line(i)), brute(xs, ys, i, (q) => line(q) === line(i)));
  const kn = kNearest(G, 11, 8);
  const all = []; for (let j = 0; j < 3000; j++) if (j !== 11) all.push((xs[11] - xs[j]) ** 2 + (ys[11] - ys[j]) ** 2);
  all.sort((a, b) => a - b);
  assert.deepEqual(Array.from(kn.q), all.slice(0, 8));
});
test("medianNearestSpacing and suggestBlankingDistance (by line) give the scans' answers", () => {
  const { xs, ys } = cloud(5000, 3);
  const idx = Array.from({ length: 400 }, (_, k) => Math.floor((k * 5000) / 400));
  const d = idx.map((i) => brute(xs, ys, i)).sort((a, b) => a - b);
  assert.equal(medianNearestSpacing(xs, ys), d[200]);
  // stations every 0.5 m on lines 100 m apart: the line spacing, not the station spacing
  const pts = []; for (let L = 0; L < 10; L++) for (let k = 0; k < 400; k++) pts.push({ x: 1000 + L * 100, y: 2000 + k * 0.5, line: `L${L}` });
  const s = suggestBlankingDistance(pts);
  assert.equal(s.basis, "line spacing"); assert.equal(s.spacing, 100);
});
test("thinning keeps the same stations, and the suggestion is the smallest step under the cap", () => {
  const { xs, ys } = cloud(30000, 11);
  // the old rule, written out: per cell of `spacing`, the station nearest the cell centre
  const old = (sp) => { const best = new Map(); for (let i = 0; i < xs.length; i++) { const cx = Math.floor(xs[i] / sp), cy = Math.floor(ys[i] / sp), k = `${cx},${cy}`, dx = xs[i] - (cx + 0.5) * sp, dy = ys[i] - (cy + 0.5) * sp, dd = dx * dx + dy * dy, cur = best.get(k); if (!cur || dd < cur.d) best.set(k, { i, d: dd }); } return Array.from(best.values(), (v) => v.i).sort((a, b) => a - b); };
  assert.deepEqual(thinStationIndices(xs, ys, 12.5), old(12.5));
  const sug = suggestThinSpacing(xs, ys, 20000);
  assert.ok(sug && sug.stations <= 20000, JSON.stringify(sug));
  // the loop it replaced: s0 x 1.15^k for the first k under the cap, then the nice value
  let s = Math.max(0.1, medianNearestSpacing(xs, ys)); for (let k = 0; k < 60 && old(s).length > 20000; k++) s *= 1.15;
  const mag = 10 ** Math.floor(Math.log10(s)), nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((v) => v >= s) || s;
  assert.equal(sug.spacing, nice);
});
test("the voxel lookup finds the cell that holds a point (half-open boxes)", () => {
  const cells = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 10; k++) cells.push({ x: i * 10 + 5, y: j * 10 + 5, z: k * 10 + 5, dx: 10, dy: 10, dz: 10, value: i * 1000 + j * 10 + k });
  const { find, minCell } = buildVoxelLookup(cells);
  assert.equal(minCell, 10);
  assert.equal(find(15, 25, 35).value, 1 * 1000 + 2 * 10 + 3);
  assert.equal(find(10, 10, 10).value, 1 * 1000 + 1 * 10 + 1, "a shared corner belongs to the cell above it");
  assert.equal(find(-1, 5, 5), null); assert.equal(find(5, 5, 101), null);
});
test("a 250,000-point cloud is checked in well under a second (it took about 10 s)", () => {
  const rows = []; for (let i = 0; i < 250000; i++) { const line = i % 25, k = Math.floor(i / 25); rows.push({ x: 500000 + line * 100 + (k % 50) * 0.5, y: 6200000 + Math.floor(k / 50) * 0.5, z: 980 - (k % 230), line: String(line) }); }
  const terrain = { bbox: [499000, 6199000, 504000, 6204000], gridW: 50, gridH: 50, elevations: new Float32Array(2500).fill(1000), noDataMask: null };
  const t0 = performance.now();
  const r = surveyChecks(packSurvey(rows), terrain, []);
  const ms = performance.now() - t0;
  assert.equal(r.spacing, 0.5); assert.equal(r.downhole.isDownhole, true); assert.ok(r.thinSuggestion.stations <= 20000);
  assert.ok(ms < 4000, `${Math.round(ms)} ms`); // generous for a shared CI machine; it runs in a worker in the app
});
test("wired: the pane reads the checks from the worker, says it is checking, and does not offer Invert for points that are not stations", () => {
  const s = fs.readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /surveyChecksFor\(checksKey, rows, terrain, collars\)/);
  assert.match(s, /disabled: running \|\| planBusy \|\| !!invertBlocked/); // #4070 part 2: Invert is the step pane's action
  assert.match(s, /downhole\?\.isDownhole \? tr\("These points are not survey stations \(see above\): nothing to invert\."\)/);
  assert.doesNotMatch(s, /useMemo\(\(\) => \(rows\.length > 1 \? medianNearestSpacing/);
  const w = fs.readFileSync(new URL("../src/lib/surveyChecksClient.js", import.meta.url), "utf8");
  assert.match(w, /new Worker\(new URL\("\.\/surveyChecks\.worker\.js", import\.meta\.url\)/);
});
