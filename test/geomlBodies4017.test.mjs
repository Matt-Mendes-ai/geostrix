// TASKS.csv #4017 — geoML's rock unit as closed bodies: the closing side against the unit's own intercepts (the original bug), the ground cut, the range wall,
// the specks, and the suggestion of bodies or layers. Made-up bodies only (a sphere of one unit in another, a flat layer), as probed against the real add-on.
import test from "node:test";
import assert from "node:assert/strict";
import { marchingCubes } from "../src/lib/marchingCubes.js";
import { meshVolume } from "../src/lib/unitVolumes.js";
import { blocksGrid, enclosedBodies, interceptsInsideBodies, suggestShape, BODY_LEVEL } from "../src/lib/geomlBodies.js";

const SIZE = 800, DEPTH = 400, CELL = 40, C = [400, 400, -200], R = 150;
const sphereVolume = (4 / 3) * Math.PI * R ** 3;
const sig = (d, w) => 1 / (1 + Math.exp(-d / w));
// the unit's probability as a smooth field (what the model returns), on a block grid like the add-on's: x fastest not required, blocks come as lists
const unitProb = { // P of the unit
  minority: (x, y, z) => sig(R - Math.hypot(x - C[0], y - C[1], z - C[2]), 15), // the unit is the sphere
  majority: (x, y, z) => 1 - sig(R - Math.hypot(x - C[0], y - C[1], z - C[2]), 15), // the unit is the rock round it
  layer: (x, y, z) => sig(50 - Math.abs(z + 200), 8), // a flat band at -150 .. -250
};
function blocks(kind, from = -100, to = SIZE + 100) {
  const b = { cell: CELL, x: [], y: [], z: [], probability: [], uncertainty: [] };
  for (let k = 0; k < 13; k++) for (let j = 0; j < 25; j++) for (let i = 0; i < 25; i++) {
    const x = from + CELL / 2 + i * CELL, y = from + CELL / 2 + j * CELL, z = -DEPTH - 30 + CELL / 2 + k * CELL;
    b.x.push(x); b.y.push(y); b.z.push(z); b.probability.push(unitProb[kind](x, y, z)); b.uncertainty.push(0);
  }
  return b;
}
// the unit's logged intercepts on 100 m vertical holes, as geomlIntercepts.interceptCheckPoints makes them: { points, spans: [{ hole_id, from, to, start, count }] }
function intercepts(kind) {
  const points = [], spans = [], inUnit = (x, y, z) => unitProb[kind](x, y, z) > 0.5;
  for (let x = 0; x <= SIZE; x += 100) for (let y = 0; y <= SIZE; y += 100) {
    let run = null;
    for (let d = 5; d <= DEPTH; d += 10) {
      if (inUnit(x, y, -d)) { if (!run) run = { hole_id: `H${x}_${y}`, from: d - 5, start: points.length, count: 0 }; points.push([x, y, -d]); run.count++; run.to = d + 5; }
      else if (run) { spans.push(run); run = null; }
    }
    if (run) spans.push(run);
  }
  return { points, spans };
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test("#4017 the original bug: the unit is the rock AROUND a pocket; the bare isosurface (what the add-on drew) wraps the pocket, the enclosed body wraps the unit", () => {
  const b = blocks("majority"), { points, spans } = intercepts("majority");
  assert.ok(spans.length > 60, "most holes cut the unit");
  // the bare 50 % isosurface of the unit's probability, no closing round the box: one sphere, of the OTHER rock
  const g = blocksGrid(b);
  const bare = marchingCubes(g.values, g.nx, g.ny, g.nz, BODY_LEVEL, { origin: g.origin, spacing: g.spacing });
  const pos = Float64Array.from(bare.vertices.flat()), idx = Uint32Array.from(bare.faces.flat());
  const old = interceptsInsideBodies(pos, idx, points, spans);
  assert.equal(old.inside, 0, "none of the unit's own intercepts is inside the shell the add-on drew");
  near(Math.abs(meshVolume(pos, idx)), sphereVolume, 0.15, "that shell is the pocket's"); assert.ok(meshVolume(pos, idx) < 0, "wound inward: the volume it encloses is the pocket, seen from the unit");
  // the enclosed body: closed against the edge of the grid, so it is the unit
  const body = enclosedBodies(b);
  assert.equal(body.closed, true); assert.equal(body.bodies, 1); assert.equal(body.voids, 1, "the pocket of other rock is a void in the one body");
  const chk = interceptsInsideBodies(body.positions, body.indices, points, spans);
  assert.ok(chk.pointShare > 0.98, `the unit's intercept points inside the body: ${chk.pointShare}`);
  assert.equal(chk.reached, chk.spans, "every logged intercept is reached");
  assert.ok(body.volumeM3 > 0.9 * (SIZE + 80) ** 2 * (DEPTH + 40) - sphereVolume * 1.2, "the body is the box less the pocket");
});

test("#4017 the unit is a sphere in other rock: one closed body of the sphere's volume, the unit's intercepts inside it", () => {
  const b = blocks("minority"), { points, spans } = intercepts("minority");
  const body = enclosedBodies(b);
  assert.equal(body.closed, true); assert.equal(body.bodies, 1);
  near(body.volumeM3, sphereVolume, 0.12, "volume");
  const chk = interceptsInsideBodies(body.positions, body.indices, points, spans);
  assert.ok(chk.pointShare > 0.9 && chk.reached === chk.spans, "the points at the sphere's rim may fall outside a 40 m-block surface: " + JSON.stringify(chk));
  assert.equal(body.closingShare, 0, "nothing closes against a wall: the sphere is inside the grid");
  assert.ok(body.volumeM3 > 0, "outward winding: a positive volume");
});

test("#4017 a layered unit: closed against the box, the slab's volume, the intercepts inside; the level moves the body", () => {
  const b = blocks("layer"), { points, spans } = intercepts("layer");
  const body = enclosedBodies(b);
  assert.equal(body.closed, true);
  const w = 24 * CELL; // the grid's extent between its first and last block centres: the body closes on them
  near(body.volumeM3, w * w * 100, 0.2, "slab volume");
  assert.ok(interceptsInsideBodies(body.positions, body.indices, points, spans).pointShare > 0.98);
  const wider = enclosedBodies(b, { level: 0.2 }), narrower = enclosedBodies(b, { level: 0.8 });
  assert.ok(wider.volumeM3 > body.volumeM3 && body.volumeM3 > narrower.volumeM3, "a lower level draws a larger body");
});

test("#4017 the body is cut at the ground like the other shells", () => {
  const b = blocks("majority");
  const cut = enclosedBodies(b, { groundAt: () => -100 });
  assert.equal(cut.closed, true);
  let top = -Infinity; for (let i = 2; i < cut.positions.length; i += 3) top = Math.max(top, cut.positions[i]);
  assert.ok(top <= -100 + 1e-6, `highest point ${top}`);
  const open = enclosedBodies(b);
  assert.ok(cut.volumeM3 < open.volumeM3);
});

test("#4017 blocks beyond the model's range are no-data: the body closes against them, and says how much of it is that wall", () => {
  const b = blocks("majority");
  const dropped = b.x.map((x, i) => x < 100 || x > 700 || b.y[i] < 100 || b.y[i] > 700);
  const r = enclosedBodies(b, { dropped });
  assert.equal(r.closed, true);
  assert.ok(r.closingShare > 0.1, `closing share ${r.closingShare}`);
  let minX = Infinity; for (let i = 0; i < r.positions.length; i += 3) minX = Math.min(minX, r.positions[i]);
  assert.ok(minX >= 60, `the body stays within the model's range: x from ${minX}`);
});

test("#4017 a speck of the field crossing the level is not a body", () => {
  const b = blocks("minority"), i = b.x.findIndex((x, k) => x === -100 + 20 && b.y[k] === -100 + 20 && b.z[k] === -DEPTH - 30 + 20);
  b.probability[i] = 0.9; // one block, far from the sphere
  const r = enclosedBodies(b);
  assert.equal(r.bodies, 1); assert.equal(r.droppedSpecks, 1);
  near(r.volumeM3, sphereVolume, 0.12, "volume without the speck");
});

test("#4017 the shape suggested from the intercepts: a horizon is layers; a pocket, a matrix, several runs and an uneven level are bodies", () => {
  const holes = 81;
  const lay = intercepts("layer"), s1 = suggestShape(lay.spans, lay.points, holes);
  assert.equal(s1.shape, "layers"); assert.equal(s1.reason, "horizon"); assert.ok(s1.share > 0.95 && s1.thicknessM > 80);
  const pocket = intercepts("minority"), s2 = suggestShape(pocket.spans, pocket.points, holes);
  assert.equal(s2.shape, "bodies"); assert.equal(s2.reason, "partial"); assert.ok(s2.share < 0.2);
  const matrix = intercepts("majority"), s3 = suggestShape(matrix.spans, matrix.points, holes);
  assert.equal(s3.shape, "bodies"); assert.equal(s3.reason, "collar");
  // two bands in most holes: not one horizon
  const two = { spans: [], points: [] };
  for (const l of [lay, { spans: lay.spans.map((s) => ({ ...s, hole_id: s.hole_id + "b" })), points: lay.points.map((p) => [p[0], p[1], p[2] - 150]) }]) { const off = two.points.length; for (const s of l.spans) two.spans.push({ ...s, hole_id: s.hole_id.replace(/b$/, ""), start: s.start + off }); two.points.push(...l.points); }
  assert.equal(suggestShape(two.spans, two.points, holes).reason, "several");
  // the same band at very different levels from hole to hole: uneven
  const uneven = { spans: lay.spans.map((s, i) => ({ ...s })), points: lay.points.map((p, i) => [p[0], p[1], p[2] + (Math.floor(i / 10) % 9) * 60]) };
  assert.equal(suggestShape(uneven.spans, uneven.points, holes).reason, "uneven");
  assert.equal(suggestShape([], [], holes).shape, "bodies"); assert.equal(suggestShape(lay.spans.slice(0, 3), lay.points, holes).reason, "few");
});

test("#4017 interceptsInsideBodies answers null for an open surface or no points (no inside to test)", () => {
  assert.equal(interceptsInsideBodies(new Float64Array(), new Uint32Array(), [[0, 0, 0]], [{ start: 0, count: 1 }]), null);
  const open = { positions: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]) };
  assert.equal(interceptsInsideBodies(open.positions, open.indices, [[0.2, 0.2, 0]], [{ start: 0, count: 1 }]), null);
});

test("#4017 the block plan: bodies ask for blocks half the size (never under 10 m), within the add-on's cap of cells, and say so", async () => {
  const { bodiesBlockSize, blockPlan, modelBox, BLOCK_CAP } = await import("../src/lib/geomlBodies.js");
  assert.equal(bodiesBlockSize(60), 30); assert.equal(bodiesBlockSize(40), 20); assert.equal(bodiesBlockSize(25), 13); assert.equal(bodiesBlockSize(12), 10); assert.equal(bodiesBlockSize(undefined), 20);
  const p = blockPlan([1000, 1000, 500], 20); // 62,500 blocks: fits
  assert.deepEqual(p.n, [50, 50, 25]); assert.equal(p.blocks, 62500); assert.equal(p.grown, false);
  const big = blockPlan([4000, 4000, 1000], 20); // 40 million blocks: the block grows (x1.25 at a time, as the add-on does) until it fits
  assert.ok(big.blocks <= BLOCK_CAP && big.cell > 20 && big.grown);
  assert.equal(blockPlan([100, 100, 100], 50).blocks, 8);
  const box = modelBox([{ x: 0, y: 0, z: 0, length: 400 }, { x: 800, y: 800, z: 0, length: 400 }]);
  assert.deepEqual(box, [1000, 1000, 500]);
  assert.equal(modelBox([]), null);
});

test("#4017 clipBlocks says which blocks are beyond the model's range (the body closes against those), not those above the ground", async () => {
  const { clipBlocks } = await import("../src/lib/geomlClip.js");
  const blocks = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 50 }, { x: 900, y: 0, z: 0 }];
  const r = clipBlocks(blocks, { ground: () => 10, near: (x) => x < 500 });
  assert.deepEqual(r.keep, [true, false, false]); assert.deepEqual(r.outOfRange, [false, false, true]); assert.equal(r.air, 1); assert.equal(r.far, 1);
});

test("#4017 the wiring: the panel offers bodies or layers, asks finer blocks for bodies, draws the add-on's contact only for layers, and a body is a closed unit_body", async () => {
  const fs = await import("node:fs");
  const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const p = read("src/components/PredictivePanel.jsx");
  assert.match(p, /import \{ enclosedBodies, interceptsInsideBodies, suggestShape, bodiesBlockSize, blockPlan, modelBox, bodiesExtraSeconds, gradeShells, gradeCutoffSuggestion, parseShellCutoffs, BODY_LEVEL \} from "\.\.\/lib\/geomlBodies\.js";/);
  assert.match(p, /const shape = shapePick \|\| suggestion\?\.shape \|\| "bodies";/);
  assert.match(p, /if \(shape === "bodies" && !blockOverride\) params\.block_size = bodiesBlockSize\(QUALITY\[quality\]\.domain\.block_size\);/ /* a #4019 fix block size wins */);
  assert.match(p, /if \(shape === "layers" && res\.surface\?\.triangles\?\.length\) \{/, "the open contact: layers only, as before");
  assert.match(p, /enclosedBodies\(b, \{ level: bodyPct \/ 100, dropped: r\.outOfRange, groundAt: cutAtTopo \? clip\.ground : null \}\)/);
  assert.match(p, /type: "unit_body", closure: wall/);
  assert.match(p, /interceptsInsideBodies\(body\.positions, body\.indices, check\.points, check\.spans\)/);
  assert.match(p, /clip\.ground = ground;/);
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /params = \{\}, type = "geoml"(?: \/\*[^*]*\*\/)?, closure = null/ /* #4013 notes the fault type there */);
  assert.match(v, /vertexCount: nVerts, faceCount: nTris, type, relationships: \[\], closure, params: \{ tool: "geoML \(predictive modelling add-on\)"/);
  // runs made before this change: their contact is a 'geoml' surface, which draws as it did (the default type is unchanged)
  assert.match(v, /type = "geoml"/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); for (const k of ["Draw the unit as", "Body level (probability, %)", "closed body of {name}: {v} m³ at {p}% ({c} m blocks){w}"]) assert.ok(d[k], `${lang}: ${k}`); }
});

test("#4017 the cost of the finer blocks is stated from what was measured: about 0.56 ms a block, none when the blocks are not finer", async () => {
  const { bodiesExtraSeconds, PREDICT_S_PER_BLOCK, BLOCK_CAP } = await import("../src/lib/geomlBodies.js");
  near(bodiesExtraSeconds(78732 + 8125, 8125), 44 + 0, 0.15, "the measured 78,732-block prediction took 44 s");
  assert.equal(bodiesExtraSeconds(8000, 8000), 0); assert.equal(bodiesExtraSeconds(5000, 8000), 0);
  assert.ok(bodiesExtraSeconds(BLOCK_CAP, 0) < 90, "at the cap it is about a minute at most");
  assert.equal(PREDICT_S_PER_BLOCK, 0.00056);
});

// ---- (b) a grade run's shells ------------------------------------------------------------------------------------------------------------------------------
import { gradeShells, gradeCutoffSuggestion, parseShellCutoffs } from "../src/lib/geomlBodies.js";
const gradeBlocks = (fn) => { // predicted grade on the same block grid, with a P10 and a P90 of its simulations
  const b = blocks("minority"); b.prediction = b.x.map((x, i) => fn(x, b.y[i], b.z[i])); b.p10 = b.prediction.map((v) => v * 0.6); b.p90 = b.prediction.map((v) => v * 1.5); return b;
};
const blob = (x, y, z) => 5 * Math.exp(-((x - C[0]) ** 2 + (y - C[1]) ** 2 + (z - C[2]) ** 2) / (2 * 100 ** 2)); // grade falls away from a centre
const samplesOf = (fn) => { const out = []; for (let x = 0; x <= SIZE; x += 100) for (let y = 0; y <= SIZE; y += 100) for (let d = 5; d <= DEPTH; d += 10) out.push({ x, y, z: -d, value: fn(x, y, -d) }); return out; };

test("#4017 (b) a grade shell at a cut-off is closed, of the volume the grade field says, with the samples at or above the cut-off inside it", () => {
  const cut = 1, r = 100 * Math.sqrt(2 * Math.log(5 / cut)), vol = (4 / 3) * Math.PI * r ** 3;
  const [s] = gradeShells(gradeBlocks(blob), { cutoffs: [cut], samples: samplesOf(blob) });
  assert.equal(s.kind, "mean"); assert.equal(s.body.closed, true); assert.equal(s.body.bodies, 1);
  near(s.body.volumeM3, vol, 0.2, "volume");
  assert.ok(s.above > 20 && s.inside.share > 0.9, `samples at or above ${cut} inside: ${JSON.stringify(s.inside)} of ${s.above}`);
});

test("#4017 (b) the closing side on grade: where grade is high everywhere but a low pocket, the shell wraps the high ground and every sample at the cut-off is inside", () => {
  const hi = (x, y, z) => 4 - 3.5 * Math.exp(-((x - C[0]) ** 2 + (y - C[1]) ** 2 + (z - C[2]) ** 2) / (2 * 80 ** 2));
  const [s] = gradeShells(gradeBlocks(hi), { cutoffs: [2], samples: samplesOf(hi) });
  assert.equal(s.body.closed, true); assert.ok(s.body.voids >= 1, "the low pocket is a void in the shell");
  assert.ok(s.inside.share > 0.97, `${JSON.stringify(s.inside)}`);
  assert.ok(s.body.volumeM3 > 0.8 * (SIZE + 80) ** 2 * (DEPTH + 40) * 0.8);
});

test("#4017 (b) several cut-offs and the P10 / P90 shells: a higher cut-off is a smaller shell, the P10 shell lies inside the mean one and the P90 outside it", () => {
  const b = gradeBlocks(blob);
  const all = gradeShells(b, { cutoffs: [0.5, 1, 2], bands: true });
  assert.equal(all.length, 9);
  const vol = (kind, c) => all.find((x) => x.kind === kind && x.cutoff === c).body.volumeM3;
  assert.ok(vol("mean", 0.5) > vol("mean", 1) && vol("mean", 1) > vol("mean", 2), "a higher cut-off is smaller");
  for (const c of [0.5, 1, 2]) assert.ok(vol("p10", c) < vol("mean", c) && vol("mean", c) < vol("p90", c), `at ${c}`);
  assert.equal(gradeShells(b, { cutoffs: [1] }).length, 1, "without bands only the mean shell");
  const noBands = { ...b }; delete noBands.p10; delete noBands.p90;
  assert.equal(gradeShells(noBands, { cutoffs: [1], bands: true }).length, 1, "blocks with no P10 / P90 (an older add-on) give the mean shell only");
});

test("#4017 (b) a cut-off no block reaches gives no shell, said by an empty body; the ground cut applies to a grade shell too", () => {
  const b = gradeBlocks(blob);
  const none = gradeShells(b, { cutoffs: [50] })[0];
  assert.equal(none.body.positions.length, 0); assert.equal(none.body.volumeM3, 0); assert.equal(none.inside, null);
  const hi = gradeBlocks(() => 3);
  const cut = gradeShells(hi, { cutoffs: [1], groundAt: () => -100 })[0].body;
  let top = -Infinity; for (let i = 2; i < cut.positions.length; i += 3) top = Math.max(top, cut.positions[i]);
  assert.ok(cut.closed && top <= -100 + 1e-6, `top ${top}`);
});

test("#4017 (b) the cut-offs the samples suggest, and the cut-offs typed", () => {
  const v = Array.from({ length: 101 }, (_, i) => i / 10); // 0 .. 10 (the zero is not a grade)
  const s = gradeCutoffSuggestion(v);
  assert.equal(s.median, 5); assert.equal(s.q3, 7.5); assert.equal(s.p90, 9); assert.equal(s.first, 9); assert.deepEqual(s.list, [5, 7.5, 9]);
  assert.deepEqual(gradeCutoffSuggestion([0, 0, NaN]).list, []); assert.equal(gradeCutoffSuggestion([]).first, null);
  assert.deepEqual(parseShellCutoffs("2, 0.5; 1 1 x -3 0"), [0.5, 1, 2]); assert.deepEqual(parseShellCutoffs(""), []);
});

test("#4017 (b) the wiring: the grade run draws its shells from the blocks, with the Grade shell's setting, the samples' check and the unit's cost line off when a fix sets the blocks", async () => {
  const fs = await import("node:fs");
  const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const p = read("src/components/PredictivePanel.jsx");
  assert.match(p, /const cutAtTopo = clipToTopo && \(!!terrain \|\| \(collars \|\| \[\]\)\.length >= 3\);/);
  assert.match(p, /gradeShells\(b, \{ cutoffs: cuts, bands: bandsOn, dropped: r\.outOfRange, groundAt: cutAtTopo \? gclip\.ground : null, samples: gclip\.points \}\)/);
  assert.match(p, /type: "mineralization_envelope", closure: s\.body\.closingShare > 0 \? "artificial" : "natural"/);
  assert.match(p, /params: \{ \.\.\.gparams, tool: "geoML grade shell", cutoff: s\.cutoff/);
  assert.match(p, /\{!blockOverride && a && o && a\.blocks > o\.blocks && /, "a fix's block size wins: no 'finer blocks' line");
  assert.match(p, /Number\.isFinite\(r\.value\) \? r\.value : 1/, "the samples carry their values");
  assert.match(read("src/modules/viewer/ModellingPanes.jsx"), /clipToTopo=\{clipToTopo\} \/\* TASKS\.csv #4017/);
  // a grade shell is not the Grade shell tool's: the estimation default does not pick it (it looks for tool === "numeric grade shell")
  assert.doesNotMatch(p, /tool: "numeric grade shell"/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); for (const k of ["Also draw grade shells", "Also the P10 and P90 shells", "shell at {cutoff}{unit}: {v} m³", "Enclosed bodies (closed solids)", "Layers (open contact)"]) assert.ok(d[k], `${lang}: ${k}`); }
});
