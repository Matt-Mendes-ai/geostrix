// TASKS.csv #1536 — a section through Lawyers' pad-drilled fans (31-48 holes) printed hole names, EOH depths and offsets on top
// of each other: with nowhere free, they are now left out (and counted) instead of overprinted
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
// v0.1.103 release CI: the Windows runner checks the sources out with CRLF, so the text pins compare LF text
const readFileSync = (p, enc) => readRaw(p, enc).replace(/\r\n/g, "\n");
import { placeLabels, resolveLabels } from "../src/lib/sectionLabels.js";

const overlap = (a, b) => a.x - a.w / 2 < b.x + b.w / 2 && b.x - b.w / 2 < a.x + a.w / 2 && a.y - a.h < b.y && b.y - b.h < a.y;

test("hole names: crowded ones are left out with dropCrowded, none of the drawn ones overlap", () => {
  // 48 collars on two pads in a 300 px drawing, 40 px tall: nowhere near room for all
  const items = Array.from({ length: 48 }, (_, i) => ({ key: `H${i}|collar`, text: `21CCDD0${10 + i}`, ax: 100 + (i % 2) * 100, ay: 30, dir: -1 }));
  const opts = { fontSize: 9, bounds: [4, 296], yBounds: [2, 40] };
  const old = placeLabels(items, opts);
  assert.equal(old.length, 48); // as before: every one drawn, many on top of each other
  assert.ok(old.some((a, i) => old.some((b, j) => i < j && overlap(a, b))));
  const kept = placeLabels(items, { ...opts, dropCrowded: true });
  assert.ok(kept.length > 0 && kept.length < 48);
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) assert.ok(!overlap(kept[i], kept[j]), `${kept[i].key} / ${kept[j].key}`);
  // a dragged label is always drawn where it was put
  const dragged = placeLabels(items, { ...opts, dropCrowded: true, fixed: { "H47|collar": { dx: 0, dy: -5 } } });
  assert.ok(dragged.some((b) => b.key === "H47|collar"));
});

test("an optional label (EOH, offset) with no room is left out; a grade label still takes its spot", () => {
  const block = [{ x: 50, y: 100, w: 100, h: 100 }]; // the whole 100 x 100 drawing is taken (x: centre, y: baseline)
  const specs = [
    { key: "eoh1", text: "EOH 421 m", size: 9, prio: 2, optional: true, cands: [{ x: 50, y: 50, anchor: "middle" }] },
    { key: "off1", text: "+94…+100 m", size: 9, prio: 2, optional: true, cands: [{ x: 50, y: 60, anchor: "start" }] },
    { key: "grade1", text: "136 ppm Au", size: 9, prio: 2, cands: [{ x: 50, y: 40, anchor: "start" }] },
  ];
  const out = resolveLabels(specs, block, { bounds: [0, 100], yBounds: [0, 100] });
  assert.deepEqual(out.map((l) => l.key), ["grade1"]);
  // with room they are drawn as before
  assert.equal(resolveLabels(specs, [], { bounds: [0, 400], yBounds: [0, 400] }).length, 3);
});

test("the section marks EOH and offset tags optional, drops crowded names and says how many are missing", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /text: tr\("EOH \{v\} m", \{ v: Math\.round\(eoh\) \}\), size: fs\(9\), fill: "#1a2028", prio: 2, optional: true/);
  assert.match(s, /key: `off\$\{hi\}`, text: off, size: fs\(9\), fill: "#7a8494", prio: 2, optional: true/);
  assert.match(s, /avoid: axisLabelBoxes, dropCrowded: true(, fixedYield: printing \/\* #2761 \*\/)? \}\);\n\s+leftOutRef\.current \+= items\.length - placed\.length;/);
  assert.match(s, /onLeftOut=\{printScale == null \? setLabelsLeftOut : null\}/);
  assert.match(s, /tr\("\{n\} labels left out: no room", \{ n: labelsLeftOut \}\)/);
});
