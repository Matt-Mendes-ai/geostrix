// TASKS.csv #901 — the Explicit surface pane's pure decisions (moved to lib/explicitBuild.js) and the review's test gaps
import test from "node:test";
import assert from "node:assert/strict";
import { inputKey, shapeFrame, onlyOneSection } from "../src/lib/explicitBuild.js";
import { explicitPoints, fitExplicitSurface } from "../src/lib/explicitSurface.js";
import { linkOutlines } from "../src/lib/wireframe.js";
import { surfacesToBlock } from "../src/lib/surfaceSolids.js";

const ep = (pts) => ({ points: pts.map(([x, y, z]) => ({ x, y, z })) });

test("#901 inputKey: the same inputs give the same key; a moved point, a setting or a trend change it", () => {
  const def = { margin: null, resolution: 80, cutAtTerrain: true };
  const k = inputKey(def, ep([[0, 0, 0], [10, 0, 1]]), true);
  assert.equal(inputKey({ ...def }, ep([[0, 0, 0], [10, 0, 1]]), true), k);
  assert.equal(inputKey(def, ep([[0, 0, 0], [10, 0, 1.001]]), true), k, "under a centimetre: the same key");
  assert.notEqual(inputKey(def, ep([[0, 0, 0], [10, 0, 1.2]]), true), k);
  assert.notEqual(inputKey({ ...def, margin: 50 }, ep([[0, 0, 0], [10, 0, 1]]), true), k);
  assert.notEqual(inputKey(def, ep([[0, 0, 0], [10, 0, 1]]), false), k, "terrain cut only counts with a terrain");
  assert.notEqual(inputKey(def, ep([[0, 0, 0], [10, 0, 1]]), true, null, { dip: 0, dipAzimuth: 90, pitch: 0, ratios: { max: 3, int: 1 } }), k);
});

test("#901 shapeFrame: chosen, automatic from the lines' apparent dip, or the pre-#824 rule", () => {
  assert.equal(shapeFrame("map", 80), "map");
  assert.equal(shapeFrame("plane", 5), "plane");
  assert.equal(shapeFrame("auto", 30), "map");
  assert.equal(shapeFrame("auto", 45), "plane");
  assert.equal(shapeFrame("auto", null), "auto");
  assert.equal(shapeFrame(undefined, 10), "auto");
});

test("#901 onlyOneSection: lines on one section only are refused; a pick or a mapped contact lets it build", () => {
  assert.equal(onlyOneSection({ picks: 0, mapLines: 0, sections: 1 }, 0), true);
  assert.equal(onlyOneSection({ picks: 0, mapLines: 0, sections: 0 }, 1), true);
  assert.equal(onlyOneSection({ picks: 1, mapLines: 0, sections: 1 }, 0), false);
  assert.equal(onlyOneSection({ picks: 0, mapLines: 1, sections: 1 }, 0), false);
  assert.equal(onlyOneSection({ picks: 0, mapLines: 0, sections: 2 }, 0), false);
});

test("#901 explicitPoints drops non-finite picks and section-line vertices", () => {
  const r = explicitPoints({ name: "S", picks: [{ id: "a", x: 0, y: 0, z: 0 }, { id: "b", x: NaN, y: 0, z: 0 }, { id: "c", x: 1, y: 2, z: Infinity }] },
    [{ name: "A", contacts: [{ unit: "S", points: [{ x: 0, y: 0, z: 0 }, { x: 5, y: NaN, z: 0 }, { x: 10, y: 0, z: 0 }] }] }]);
  assert.equal(r.picks, 1);
  assert.ok(r.points.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
});

test("#901 a 'map' frame on near-collinear points is refused with the one-line message", () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 50, y: i * 0.01, z: 100 + i }));
  assert.throws(() => fitExplicitSurface(pts, { frame: "map" }), /along one line/);
});

test("#901 non-parallel outlines are refused, naming the sections", () => {
  const sq = (name, ax, ay, bx, by) => ({ section: name, ax, ay, bx, by, points: [[0, 0], [10, 0], [10, 10], [0, 10]].map(([l, z]) => ({ x: ax + (bx - ax) * l / 100, y: ay + (by - ay) * l / 100, z })) });
  assert.throws(() => linkOutlines([sq("A", 0, 0, 100, 0), sq("B", 0, 50, 100, 120)]), /not parallel/);
});

test("#901 Solid blocks: a top with a NaN vertex loses only the triangles touching it (the coverage says so)", () => {
  const P = [], I = [];
  for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) P.push(i * 50, j * 50, 50);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const a = j * 3 + i; I.push(a, a + 1, a + 4, a, a + 4, a + 3); }
  P[8 * 3 + 2] = NaN;
  const r = surfacesToBlock({ tops: [{ name: "T", unit: "T", positions: Float64Array.from(P), indices: Uint32Array.from(I) }], extent: [0, 100, 0, 100, 0, 100], cell: 10 });
  assert.ok(r.counts.T > 0, "the rest of the surface still codes its unit");
  assert.ok(r.coverage.T > 0.5 && r.coverage.T < 1, `coverage ${r.coverage.T}`);
});

import { explicitInputRows, INPUT_COLUMNS } from "../src/lib/explicitBuild.js";
test("#880 the inputs as rows: picks with hole / depth / units, section-line and image-line vertices; nothing derived", () => {
  const defs = [{ name: "Top", unit: "DACT", contact: "upper", layer: "A", picks: [{ id: "p1", x: 1.23456, y: 2, z: 3, hole_id: "H1", md: 12.5, src: "boundary", above: "AND", below: "DACT", seeded: true }, { id: "p2", x: 5, y: 6, z: 7, src: "point" }],
    lines: [{ id: "l", imageId: "img1", pts: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }] }], mapContacts: [{ units: ["A", "B"] }] }];
  const sections = [{ name: "S1", contacts: [{ unit: "Top", points: [{ x: 10, y: 0, z: 5 }, { x: 20, y: 0, z: 6 }] }, { unit: "Other", points: [{ x: 0, y: 0, z: 0 }] }, { unit: "Top", kind: "outline", points: [{ x: 0, y: 0, z: 0 }] }] }];
  const rows = explicitInputRows(defs, sections);
  assert.equal(rows.length, 2 + 2 + 2);
  assert.deepEqual(rows.map((r) => r.source), ["pick on a logged contact", "pick (3D point)", "line on a section", "line on a section", "line on a section image", "line on a section image"]);
  assert.equal(rows[0].easting, 1.235); assert.equal(rows[0].seeded_from_logs, "yes"); assert.equal(rows[0].above, "AND"); assert.equal(rows[0].unit, "DACT");
  assert.equal(rows[2].ref, "S1"); assert.equal(rows[3].vertex, 2);
  for (const r of rows) assert.deepEqual(Object.keys(r).sort(), [...INPUT_COLUMNS].sort());
});
