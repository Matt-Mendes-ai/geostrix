// TASKS.csv #1545 (review #1497, Lawyers) — orientation-line quality per pick from the OriCore interval layer (or a pick's own
// field), an "Orientation quality ≤ N" filter on the Stereonet and the Downhole plot, and the share dropped said
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findOriQualityLayer, oriQualityIndex, qualityAt, pickQuality, filterByQuality, qualityLevels, qualityNote } from "../src/lib/oriQuality.js";

const oriCore = { id: 7, name: "2021 & 2022 DDH OriCore.csv (8 more queued)", rows: [
  { hole_id: "21AGBDD040", from: 0, to: 20, value: "1", angle_difference: 3, confidence: 5 },
  { hole_id: "21AGBDD040", from: 20, to: 35, value: "3", angle_difference: 25, confidence: 1 },
  { hole_id: "21AGBDD040", from: 35, to: 60, value: "2", angle_difference: 10, confidence: 3 },
  { hole_id: "21AGBDD013", from: 0, to: 100, value: "", angle_difference: 0 },
  { hole_id: "21AGBDD013", from: 100, to: 150, value: "1" },
] };

test("the quality layer is found by name and content; others are not", () => {
  assert.equal(findOriQualityLayer([{ id: 1, name: "Min Domain", rows: [{ value: "CC3" }] }, oriCore]), oriCore);
  assert.equal(findOriQualityLayer([{ id: 2, name: "OriCore notes", rows: [{ value: "good" }, { value: "poor" }] }]), null, "named for it but not quality numbers");
  assert.equal(findOriQualityLayer([{ id: 3, name: "Vein Interval", rows: [{ value: "1" }, { value: "2" }] }]), null, "numbers but not an orientation layer");
  assert.equal(findOriQualityLayer([]), null);
});

test("the interval lookup: the interval holding the depth, the last one's end included, blanks skipped", () => {
  const idx = oriQualityIndex(oriCore);
  assert.deepEqual(qualityLevels(idx), [1, 2, 3]);
  assert.equal(qualityAt(idx, "21AGBDD040", 10), 1);
  assert.equal(qualityAt(idx, "21AGBDD040", 20), 3);
  assert.equal(qualityAt(idx, "21AGBDD040", 34.9), 3);
  assert.equal(qualityAt(idx, "21AGBDD040", 60), 2, "the last interval's end counts");
  assert.equal(qualityAt(idx, "21AGBDD040", 61), null);
  assert.equal(qualityAt(idx, "21AGBDD013", 50), null, "a blank quality is unknown");
  assert.equal(qualityAt(idx, "21AGBDD013", 120), 1);
  assert.equal(qualityAt(idx, "nope", 5), null);
  // a pick's own field wins
  assert.equal(pickQuality({ hole_id: "21AGBDD040", depth: 25, ori_quality: 1 }, idx), 1);
  assert.equal(pickQuality({ hole_id: "21AGBDD040", depth: 25 }, idx), 3);
  assert.equal(pickQuality({ hole_id: "21AGBDD040", depth: 25 }, null), null);
});

test("the filter keeps picks at or under the quality, keeps unknown ones and counts both", () => {
  const idx = oriQualityIndex(oriCore);
  const picks = [
    { hole_id: "21AGBDD040", depth: 5, value: "Vn" }, { hole_id: "21AGBDD040", depth: 25, value: "Vn" }, { hole_id: "21AGBDD040", depth: 40, value: "Fz" },
    { hole_id: "21AGBDD013", depth: 50, value: "Vn" }, { hole_id: "21AGBDD013", depth: 120, value: "Vn" }, { value: "Bedding", outcrop: true, dip: 30, azimuth: 90 },
  ];
  const r2 = filterByQuality(picks, 2, idx);
  assert.deepEqual([r2.kept.length, r2.dropped, r2.unknown, r2.total], [5, 1, 2, 6]); // the quality-3 pick out; the blank interval and the outcrop reading unknown
  const r1 = filterByQuality(picks, 1, idx);
  assert.deepEqual([r1.kept.length, r1.dropped], [4, 2]);
  const any = filterByQuality(picks, NaN, idx);
  assert.deepEqual([any.kept.length, any.dropped, any.unknown], [6, 0, 0]);
  assert.equal(qualityNote(r2, 2, (s, v) => s.replace("{dropped}", v.dropped).replace("{n}", v.n).replace("{q}", v.q).replace("{unknown}", v.unknown)), "1 of 6 downhole picks left out (orientation-line quality above 2); 2 with no quality kept.");
  assert.equal(qualityNote(any, "", (s) => s), "");
});

test("the Stereonet and the Downhole plot take the custom layers and offer the filter", () => {
  for (const f of ["../src/components/StereonetModal.jsx", "../src/components/DownholeStructurePlot.jsx"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(s, /customLayers = \[\] \}\)/, f);
    assert.match(s, /const oriLayer = useMemo\(\(\) => findOriQualityLayer\(customLayers\), \[customLayers\]\);/, f);
    assert.match(s, /aria-label=\{tr\("Orientation quality ≤"\)\}/, f);
    assert.match(s, /filterByQuality\(/, f);
  }
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((v.match(/customLayers=\{storeCustomLayers \|\| \[\]\} \/\* TASKS\.csv #1545/g) || []).length, 2);
});
