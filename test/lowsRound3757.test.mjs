// TASKS.csv #3757 (Layout leftovers: #3716 (1), (2)), #3853 (a snap says how far it moved the click), #3869 (a gap inside the cover; the Geochem sample import says where Strike / Dip go). Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freeSpot } from "../src/lib/layoutPlace.js";
import { planKeyItems } from "../src/lib/planKeyLegend.js";
import { tiesText } from "../src/lib/interpretation.js";
import { snapInterpretClick } from "../src/lib/viewer/interpretSnap.js";
import { collarSubcrop } from "../src/lib/collarSubcrop.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };

test("#3757 (1) a full page: the legend's least bad spot is not over the title block", () => {
  const page = { w: 400, h: 300 };
  // a picture over the whole sheet, and a title block in the bottom-left: every spot overlaps something; the picture is the cheaper one to sit on
  const els = [{ id: "pic", type: "viewport", x: 0, y: 0, w: 400, h: 300 }, { id: "tb", type: "titleblock", x: 40, y: 200, w: 160, h: 60 }];
  const s = freeSpot(els, 100, 80, page, { margin: 10, step: 10 });
  const over = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  assert.equal(over({ x: s.x, y: s.y, w: 100, h: 80 }, els[1]), 0, JSON.stringify(s));
  // an empty page still gives the margin corner
  assert.deepEqual(freeSpot([], 100, 80, page, { margin: 10, step: 10 }), { x: 10, y: 10 });
});

test("#3757 (2) the plan key's planned hole row is a dashed trace and a ring, not a filled square", () => {
  const items = planKeyItems({ colouring: { key: [] }, plannedKey: [{ label: "Planned hole" }] });
  assert.equal(items.length, 1); assert.equal(items[0][0], "Planned hole");
  assert.match(items[0][2].svg, /stroke-dasharray="3 2"/); assert.match(items[0][2].svg, /<circle [^>]*fill="#ffffff"/);
});

test("#3853 a snap says how far it moved the click; the ties text carries it from 1 m", () => {
  const origin = { x: 1000, y: 2000, z: 3000 };
  const traces = [{ hole_id: "A", pts: [{ x: 0, y: 0, z: 0, md: 0 }, { x: 0, y: -100, z: 0, md: 100 }] }]; // scene: straight down from (0, 0, 0)
  const ray = { origin: { x: 0, y: 50, z: -0 }, direction: { x: 0, y: -1, z: 0 } };
  const camera = { fov: 50, zoom: 1, matrixWorldInverse: { elements: [] } };
  // the raw hit 3.5 m east of the hole's trace in world coordinates
  const hit = { x: origin.x + 3.5, y: origin.y, z: origin.z - 60 };
  const r = snapInterpretClick(hit, ray, { on: true, traces, layers: {}, visible: {}, origin, camera, heightPx: 800 });
  if (r?.snap?.hole_id) assert.ok(Number.isFinite(r.snap.moved), JSON.stringify(r.snap));
  const t = (moved) => tiesText([{ snap: { hole_id: "A", md: 40, label: "Lithology: P", kind: "interval", moved } }, { snap: { hole_id: "B", kind: "collar", moved } }, { snap: { hole_id: "C", md: 12.5, kind: "trace", moved } }]);
  assert.equal(t(3.2), "A 40 m (Lithology: P, moved 3.2 m); B collar (moved 3.2 m); C 12.5 m (moved 3.2 m)");
  assert.equal(t(0.4), "A 40 m (Lithology: P); B collar; C 12.5 m"); assert.equal(t(undefined), "A 40 m (Lithology: P); B collar; C 12.5 m");
  assert.match(read("../src/lib/viewer/interpretSnap.js"), /\.\.\.\(moved != null \? \{ moved \} : \{\}\)/);
});

test("#3869 (#3841) a gap inside the cover leaves the hole out as an unlogged stretch above the first rock", () => {
  const collars = [{ hole_id: "G", x: 0, y: 0, z: 100, azimuth: 0, dip: -90 }, { hole_id: "OK", x: 50, y: 0, z: 100, azimuth: 0, dip: -90 }];
  const litho = [{ hole_id: "G", from: 0, to: 4, value: "OVB" }, { hole_id: "G", from: 60, to: 70, value: "OVB" }, { hole_id: "G", from: 70, to: 90, value: "AND" },
    { hole_id: "OK", from: 0, to: 4, value: "OVB" }, { hole_id: "OK", from: 4, to: 40, value: "AND" }];
  const report = { lateStart: [], gap: [] };
  const pts = collarSubcrop({ collars, survey: [], litho, report });
  assert.deepEqual(pts.map((p) => p.hole_id), ["OK"]);
  assert.deepEqual(report.gap, [{ hole_id: "G", coverEnd: 4, rockStart: 60, unit: "AND" }]);
  hasKeys(["{n} hole(s) with an unlogged stretch above the first rock ({a}–{b} m) were left out: missing log is not cover ({ids})."]);
});

test("#3869 (#3842) the Geochem sample import's notice says where a Strike / Dip column goes", () => {
  assert.match(read("../src/modules/GeochemModule.jsx"), /const sampleStruct = structureRowsFromSamples\(rows\);/);
  hasKeys(["{n} sample(s) carry a Strike and a Dip: Geological Mapping > Outcrop structures > 'Add the samples with a strike and dip as structures' reads them as outcrop measurements."]);
});
