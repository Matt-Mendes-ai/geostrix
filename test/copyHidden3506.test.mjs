// TASKS.csv #3506 (from #2206's profile of switching an assay element on, WA iron) — copyHidden returns at once when nothing is hidden, and keys the
// rest by hole and an integer colour instead of building three toFixed strings per marker. The same hidden flags and zeroed matrices as before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { copyHidden } from "../src/lib/viewer/assayKeep.js";

// the previous implementation, as it was (string keys)
const rgbKeyOld = (a, i) => (a ? `${a[i * 3].toFixed(3)},${a[i * 3 + 1].toFixed(3)},${a[i * 3 + 2].toFixed(3)}` : "");
function copyHiddenOld(full, coarse) {
  const seen = new Map();
  let any = false;
  for (const f of full) {
    const cp = f.userData?.compact;
    if (cp) for (let i = 0; i < cp.rows.length; i++) { const k = `${cp.rows[i]?.holeId}|${rgbKeyOld(f.instanceColor?.array, i)}`, e = seen.get(k) || [0, 0]; e[1]++; if (cp.hidden[i]) { e[0]++; any = true; } seen.set(k, e); }
    else if (f.isMesh && f.visible === false) any = true;
  }
  if (!any) return;
  for (const c of coarse) {
    const cp = c.userData?.compact;
    if (!cp) continue;
    const a = c.instanceMatrix.array;
    for (let i = 0; i < cp.rows.length; i++) {
      const e = seen.get(`${cp.rows[i]?.holeId}|${rgbKeyOld(c.instanceColor?.array, i)}`);
      if (e && e[0] === e[1]) { cp.hidden[i] = 1; const o = i * 16; a[o] = a[o + 1] = a[o + 2] = a[o + 4] = a[o + 5] = a[o + 6] = a[o + 8] = a[o + 9] = a[o + 10] = 0; }
    }
    c.instanceMatrix.needsUpdate = true;
  }
}

let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const PALETTE = [[0.1, 0.5, 0.9], [0.8, 0.2, 0.1], [0.33333334, 0.66666669, 0.1], [0.123456, 0.654321, 0.0005], [1, 1, 1]].map((c) => c.map((v) => Math.fround(v)));
// a batch of n markers: holes H0..H(h-1), colours from the palette, hidden flags with probability pHidden (full) / none (coarse)
function batch(n, holes, pHidden) {
  const color = new Float32Array(n * 3), rows = [], hidden = new Uint8Array(n), m = new Float32Array(n * 16).fill(1);
  for (let i = 0; i < n; i++) { const c = PALETTE[Math.floor(rnd() * PALETTE.length)]; color.set(c, i * 3); rows.push({ holeId: `H${Math.floor(rnd() * holes)}` }); hidden[i] = rnd() < pHidden ? 1 : 0; }
  // saved: the hidden rows' 3 x 3 blocks, as layerBatches.js attachCompact makes it (#3628: syncCompact keeps them to restore)
  return { userData: { compact: { rows, hidden, saved: new Map() } }, instanceColor: { array: color }, instanceMatrix: { array: m, needsUpdate: false } };
}
const clone = (b) => ({ userData: { compact: { rows: b.userData.compact.rows, hidden: b.userData.compact.hidden.slice(), saved: new Map(b.userData.compact.saved) } }, instanceColor: b.instanceColor, instanceMatrix: { array: b.instanceMatrix.array.slice(), needsUpdate: false } });
const BLOCK = [0, 1, 2, 4, 5, 6, 8, 9, 10]; // a row's 3 x 3 (rotation and scale): zero = drawn as a point, nothing visible

test("with markers hidden, the coarse sets get the same hidden flags and zeroed matrices as before (random batches, colours, holes)", () => {
  let hiddenCoarse = 0;
  for (const [pHidden, holes] of [[0.3, 6], [0.9, 3], [0.05, 40], [0.97, 2], [1, 5]]) {
    const full = [batch(900, holes, pHidden), batch(500, holes, pHidden)];
    const coarse = [batch(200, holes, 0), batch(60, holes, 0)];
    const a = coarse.map(clone), b = coarse.map(clone);
    copyHiddenOld(full, a); copyHidden(full, b);
    for (let k = 0; k < coarse.length; k++) {
      assert.deepEqual(Array.from(b[k].userData.compact.hidden), Array.from(a[k].userData.compact.hidden), `hidden flags (p ${pHidden})`);
      assert.deepEqual(Array.from(b[k].instanceMatrix.array), Array.from(a[k].instanceMatrix.array), "matrices");
      assert.equal(b[k].instanceMatrix.needsUpdate, a[k].instanceMatrix.needsUpdate);
      // what matters: a hidden row draws nothing (its 3 x 3 block zero), a shown row is untouched, and the hidden row's block is kept
      const cp = b[k].userData.compact, arr = b[k].instanceMatrix.array;
      for (let i = 0; i < cp.hidden.length; i++) {
        const blk = BLOCK.map((j) => arr[i * 16 + j]);
        if (cp.hidden[i]) { assert.ok(blk.every((v) => v === 0), `hidden row ${i} draws nothing`); assert.deepEqual(cp.saved.get(i), BLOCK.map(() => 1), `row ${i}'s block kept`); }
        else { assert.ok(blk.every((v) => v === 1), `shown row ${i} untouched`); assert.ok(!cp.saved.has(i)); }
      }
    }
    hiddenCoarse += b.reduce((n, c) => n + c.userData.compact.hidden.reduce((x, h) => x + h, 0), 0);
  }
  assert.ok(hiddenCoarse > 100, `the cases hide ${hiddenCoarse} coarse markers between them`);
});

test("nothing hidden: no work and no change", () => {
  const full = [batch(2000, 10, 0)], coarse = [batch(300, 10, 0)];
  const before = coarse[0].instanceMatrix.array.slice();
  copyHidden(full, coarse);
  assert.deepEqual(Array.from(coarse[0].instanceMatrix.array), Array.from(before));
  assert.equal(coarse[0].instanceMatrix.needsUpdate, false, "not even marked for upload");
  assert.ok(coarse[0].userData.compact.hidden.every((h) => !h));
});

test("a plain mesh family hidden (under 24 markers: not compact) still counts as hidden", () => {
  const full = [{ isMesh: true, visible: false, userData: {} }, batch(50, 4, 0)];
  const coarse = [batch(20, 4, 0)];
  copyHidden(full, coarse); copyHiddenOld(full, [clone(coarse[0])]);
  assert.ok(coarse[0].userData.compact.hidden.every((h) => !h), "no compact marker of the full set was hidden, so none of the coarse set is");
});

test("speed at 148,000 markers: nothing hidden is a scan, not a keyed pass", () => {
  const full = [batch(148000, 6292, 0)], coarse = [batch(20000, 6292, 0)];
  let t = performance.now(); copyHiddenOld(full.map(clone), coarse.map(clone)); const tOld = performance.now() - t;
  t = performance.now(); copyHidden(full, coarse); const tNew = performance.now() - t;
  const some = [batch(148000, 6292, 0.02)];
  t = performance.now(); copyHiddenOld(some.map(clone), coarse.map(clone)); const tOldH = performance.now() - t;
  t = performance.now(); copyHidden(some, coarse.map(clone)); const tNewH = performance.now() - t;
  console.log(`nothing hidden: old ${tOld.toFixed(0)} ms, new ${tNew.toFixed(1)} ms; 2% hidden: old ${tOldH.toFixed(0)} ms, new ${tNewH.toFixed(0)} ms`);
  assert.ok(tNew < tOld / 3 + 5);
  assert.ok(tNewH < tOldH * 1.5 + 50);
});

test("wiring: syncAssayElements still calls copyHidden for a coarse set built after hiding", () => {
  const s = readFileSync(new URL("../src/lib/viewer/assayKeep.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /copyHidden\(entry\.kids, entry\.coarse\)/);
  assert.match(s, /export function copyHidden\(full, coarse\) \{\n  let any = false;/);
});
