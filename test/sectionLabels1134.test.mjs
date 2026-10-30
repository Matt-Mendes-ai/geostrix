// TASKS.csv #1134 — section labels in one collision pass; planned holes drawn over everything
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveLabels, placeLabels, labelWidth } from "../src/lib/sectionLabels.js";

test("#1134 a label that would overlap a hole name moves to its next spot; a depth number with no room is left out", () => {
  const hole = [{ x: 100, y: 100, w: 60, h: 11 }]; // centre-x / baseline-y, as placeLabels returns
  const out = resolveLabels([
    { key: "off", text: "+49…+50 m", size: 9, prio: 2, cands: [{ x: 90, y: 100, anchor: "start" }, { x: 90, y: 130, anchor: "start" }] },
    { key: "d300", text: "300", size: 8, prio: 1, cands: [{ x: 100, y: 100, anchor: "middle" }] },
  ], hole);
  assert.deepEqual(out.map((l) => [l.key, l.y]), [["off", 130]]);
});

test("#1134 higher priority places first; two labels never share a spot", () => {
  const out = resolveLabels([
    { key: "depth", text: "400", size: 8, prio: 1, cands: [{ x: 0, y: 50, anchor: "start" }, { x: 0, y: 80, anchor: "start" }] },
    { key: "pierce", text: "559.3 m · FAULT2", size: 9, prio: 3, cands: [{ x: 0, y: 50, anchor: "start" }] },
  ]);
  assert.deepEqual(out.map((l) => [l.key, l.y]), [["pierce", 50], ["depth", 80]]);
});

test("#1134 the section draws planned holes after the ribbons and contacts, and the labels last", () => {
  const s = fs.readFileSync("src/components/SectionWindow.jsx", "utf8");
  const at = (t) => s.indexOf(t);
  assert.ok(at("{intervals.map((row, i) => {") < at("{plannedHoles.map((ph, i) => {"));
  assert.ok(at("{contacts.map((c) => (") < at("{plannedHoles.map((ph, i) => {"));
  assert.ok(at("{plannedHoles.map((ph, i) => {") < at("resolveLabels(floatLabels, [...holeLabelBoxes"));
});

test("#1144 a label that must show never lands on a hole's name: it moves off, with a leader back to its spot", () => {
  // Treaty Creek section_116: "planned EOH 500 m" had only spots already taken, and covered PS-26-23's label
  const name = [{ x: 200, y: 100, w: 110, h: 12 }];
  const spec = { key: "peoh", text: "planned EOH 500 m", size: 12, prio: 2, cands: [{ x: 200, y: 100, anchor: "middle" }, { x: 206, y: 96, anchor: "start" }, { x: 194, y: 96, anchor: "end" }] };
  const [l] = resolveLabels([spec], name, { bounds: [4, 1096] });
  const w = labelWidth(spec.text, 12);
  assert.ok(l.y !== 100 && Math.abs(l.y - 100) >= 12, `moved clear: ${l.x},${l.y}`);
  assert.deepEqual(l.leaderFrom, { x: 200, y: 94 });
  assert.ok(l.x - w / 2 >= 4);
  // a free first spot takes no leader; a depth number with nowhere to go is still left out
  assert.equal(resolveLabels([spec]).at(0).leaderFrom, undefined);
  assert.deepEqual(resolveLabels([{ ...spec, prio: 1 }], name), []);
  // the search keeps inside the drawing, and overlaps only when truly nothing is free
  const wall = [{ x: 500, y: 600, w: 2000, h: 1200 }];
  assert.equal(resolveLabels([spec], wall, { bounds: [4, 1096] }).at(0).y, 100);
});

test("#1144 hole names keep off the elevation numbers", () => {
  const axis = [{ x: 40, y: 100, w: 30, h: 12 }];
  const [b] = placeLabels([{ key: "PS-26-50", text: "PS-26-50 · EOH 579 m", ax: 60, ay: 85, dir: 1 }], { fontSize: 10, bounds: [4, 1096], avoid: axis });
  assert.ok(b.x - b.w / 2 >= 40 + 15 || b.y - b.h >= 102 || b.y <= 88, JSON.stringify(b));
  assert.equal(placeLabels([{ key: "A", text: "A", ax: 500, ay: 100, dir: 1 }], { avoid: axis }).length, 1); // avoid boxes are not returned
});

test("#1144 a hole name pinned against a no-go band goes to the other side of its anchor", () => {
  const titleBand = [{ x: 550, y: 60, w: 1100, h: 60 }];
  const [b] = placeLabels([{ key: "H", text: "17HR-298", ax: 300, ay: 70, dir: -1 }], { fontSize: 18, bounds: [4, 1096], yBounds: [2, 700], avoid: titleBand, maxTiers: 4 });
  assert.ok(b.y - b.h >= 60, `below the band: ${b.y}`); // a collar just under the title: its name falls below the collar
  const bottom = [{ x: 550, y: 700, w: 1100, h: 60 }];
  const [e] = placeLabels([{ key: "E", text: "17HR-302 · EOH 320 m", ax: 300, ay: 636, dir: 1 }], { fontSize: 18, bounds: [4, 1096], yBounds: [2, 700], avoid: bottom, maxTiers: 4 });
  assert.ok(e.y <= 640, `above the band: ${e.y}`);
});
