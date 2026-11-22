// TASKS.csv #3976 (Matt: "we need a progress bar when fetching terrain and imagery") — the fetches' bar in the status bar: the share done
// (stages weighted, monotone, never past 100 % until it ends), the time left once steady, and Cancel. Made-up timings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stagedShare, secondsLeft, startFetchProgress } from "../src/lib/fetchProgress.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// the status bar's slot as the store keeps it: a functional setter
const slot = () => { const s = { cur: null }; s.set = (v) => { s.cur = typeof v === "function" ? v(s.cur) : v; }; return s; };

test("the share: stages weighted, each its part", () => {
  const w = [0.85, 0.15];
  assert.equal(stagedShare(w, 0, 0, 40), 0);
  assert.equal(stagedShare(w, 0, 20, 40), 0.425);
  assert.equal(stagedShare(w, 0, 40, 40), 0.85);
  assert.equal(stagedShare(w, 1, 0, 1), 0.85, "the next stage starts where the last ended");
  assert.equal(stagedShare(w, 1, 1, 1), 1);
  assert.equal(stagedShare(w, 0, 50, 40), 0.85, "never past its own stage");
  assert.equal(stagedShare(w, 0, 3, 0), 0, "an unknown total counts nothing");
});

test("the time left: not before 3 s nor 2 %, then what the pace says", () => {
  assert.equal(secondsLeft(2.9, 0.5), null);
  assert.equal(secondsLeft(10, 0.01), null);
  assert.equal(secondsLeft(10, 0.25), 30);
  assert.equal(secondsLeft(10, 1), null);
});

test("the bar: monotone, under 100 % until it ends; the stage's words and the time left; Cancel; it clears only itself", () => {
  const s = slot(); let t = 0, cancelled = 0;
  const p = startFetchProgress(s.set, { label: "Terrain", stages: [["read", 0.85], ["build", 0.15]], onCancel: () => { cancelled++; }, now: () => t });
  p.step("read", 12, 40, "Reading GEM-15 tiles 12 of 40");
  assert.equal(s.cur.label, "Terrain: Reading GEM-15 tiles 12 of 40", "no time left before 3 s");
  assert.equal(s.cur.pct, 26);
  t = 6000; p.step("read", 30, 40, "Reading GEM-15 tiles 30 of 40");
  assert.match(s.cur.label, /about \d+ s left$/);
  const at = s.cur.pct;
  p.step("read", 10, 40, "a late retry reporting less"); // never goes back
  assert.equal(s.cur.pct, at);
  p.step("build", 1, 1, "Building the terrain");
  assert.equal(s.cur.pct, 99, "held under 100 % until the end");
  s.cur.onCancel(); assert.equal(cancelled, 1);
  p.end(); assert.equal(s.cur, null);
  p.step("read", 40, 40, "after the end"); assert.equal(s.cur, null, "nothing after the end");
});

test("nothing counted yet (one GLO-30 tile for a small area): a moving bar and the time spent, from the first moment, until a count lands", () => {
  const s = slot(); let t = 0;
  const p = startFetchProgress(s.set, { label: "Terrain", stages: [["read", 0.85], ["build", 0.15]], onCancel: () => {}, now: () => t });
  p.step("read", 0, 1, "Connecting to Copernicus GLO-30…");
  assert.equal(s.cur.indeterminate, true);
  assert.equal(s.cur.elapsedS, 0);
  assert.equal(typeof s.cur.onCancel, "function", "Cancel from the start");
  t = 9000; p.step("read", 1, 1, "Reading Copernicus GLO-30 tiles 1 of 1");
  assert.equal(s.cur.indeterminate, undefined, "a count: a real bar");
  assert.equal(s.cur.pct, 85);
  p.end(); assert.equal(s.cur, null);
});

test("it never covers another task that can be cancelled (a grade shell), and its end leaves that one", () => {
  const s = slot(); s.cur = { label: "Au > 1 g/t shell", pct: 40, onCancel: () => {} };
  const p = startFetchProgress(s.set, { label: "Terrain" });
  p.step("read", 1, 2, "Reading tiles 1 of 2");
  assert.equal(s.cur.label, "Au > 1 g/t shell");
  p.end(); assert.equal(s.cur.label, "Au > 1 g/t shell");
});

test("wired: terrain, satellite imagery, Macrostrat and the spectral scenes post to the bar, with Cancel aborting the job", () => {
  for (const f of ["modules/GeophysicsModule.jsx", "modules/RasterModule.jsx", "components/MacrostratModal.jsx", "components/SpectralIndexModal.jsx"] /* the Hyperspectral tab reads a local file */) {
    const s = read(f);
    assert.match(s, /fetchProgress\.js/, `${f}: the shared helper`);
    assert.match(s, /onCancel: \(\) => [a-zA-Z]+\.abort\(\)/, `${f}: Cancel aborts the job (#3963's signal)`);
    assert.match(s, /\.end\(\)/, `${f}: the bar cleared`);
  }
});
