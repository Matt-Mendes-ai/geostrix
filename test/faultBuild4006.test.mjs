// TASKS.csv #4006 — the Faults pane's builder: evidence placed on the hole traces and at the terrain (made-up holes), the extent (until another
// fault: the side its evidence is on), and the wiring into the implicit run (one surface a fault, the cut to its extent, what it was built from
// kept on it) and into the stack (a built fault offsets the units, solved again from the inputs kept on it).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gatherFaultEvidence, keepInsideWorld, downDipReach } from "../src/modules/viewer/faultGather.js";
import { fitPlane } from "../src/lib/faultEvidence.js";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a vertical made-up hole from (x, y, 100) down to 100 m
const hole = (hole_id, x, y) => ({ hole_id, pts: [{ md: 0 }, { md: 100 }], wx: [x, x], wy: [y, y], wz: [100, 0] });

test("#4006 picks and logged intervals on the traces, outcrop faults at their place, section strings as drawn; off a hole nothing", () => {
  const items = gatherFaultEvidence({
    traces: [hole("DH-1", 0, 0), hole("DH-2", 50, 0)],
    layers: {
      structure: [{ hole_id: "DH-1", depth: 30, value: "FLT", dip: 60, azimuth: 90 }, { hole_id: "DH-2", depth: 60, value: "FLT", dip: 62, azimuth: 88 },
        { hole_id: "DH-1", depth: 10, value: "Bedding", dip: 10, azimuth: 0 }, { hole_id: "DH-9", depth: 5, value: "FLT", dip: 60, azimuth: 90 }, { hole_id: "DH-1", depth: 500, value: "FLT", dip: 60, azimuth: 90 }],
      litho: [{ hole_id: "DH-1", from: 40, to: 42, value: "FLT" }, { hole_id: "DH-2", from: 0, to: 40, value: "BAS" }],
      structzone: [{ hole_id: "DH-2", from: 70, to: 71, value: "FZ" }],
    },
    surfaceStructures: [{ rows: [{ x: 10, y: 10, z: 99, dip: 70, dipDir: 90, cls: "fault" }, { x: 1, y: 1, z: 99, dip: 5, dipDir: 0, cls: "bedding" }] }],
    sections: [{ id: "s1", contacts: [{ id: "c1", kind: "fault", unit: "F-A", points: [{ x: 5, y: 0, z: 50 }, { x: 6, y: 0, z: 40 }] }, { id: "c2", kind: "contact", unit: "Top", points: [{ x: 1, y: 1, z: 1 }] }] }],
  });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.deepEqual(items.map((i) => i.id), ["pick:FLT|", "logged:FLT", "logged:FZ", "outcrop", "string:s1:c1"]);
  assert.deepEqual(by["pick:FLT|"].points, [{ x: 0, y: 0, z: 70 }, { x: 50, y: 0, z: 40 }], "at their depths; a hole with no trace and a depth past the hole's end are left out");
  assert.deepEqual(by["logged:FLT"].points, [{ x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 58 }]);
  assert.deepEqual(by["logged:FZ"].points.map((p) => p.z), [30, 29]);
  assert.deepEqual(by.outcrop.orientations, [{ x: 10, y: 10, z: 99, dip: 70, azimuth: 90 }]);
  assert.equal(by["string:s1:c1"].points.length, 2);
});

test("#4006 until another fault: the part on the evidence's side is kept; through the box: no cut", () => {
  // the other fault: the vertical plane x = 100 (two triangles)
  const other = { positions: [100, -1000, -1000, 100, 1000, -1000, 100, 1000, 1000, 100, -1000, 1000], indices: [0, 1, 2, 0, 2, 3] };
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 50, z: -40 }, { x: 20, y: -50, z: 30 }, { x: -10, y: 20, z: 10 }];
  const keep = keepInsideWorld({ extent: "until", points: pts, plane: fitPlane(pts), other });
  assert.equal(keep({ x: 50, y: 0, z: 0 }), true, "the evidence's side");
  assert.equal(keep({ x: 150, y: 0, z: 0 }), false, "across the other fault");
  assert.equal(keepInsideWorld({ extent: "box", points: pts, plane: fitPlane(pts) }), null);
  const fin = keepInsideWorld({ extent: "finite", points: pts, plane: fitPlane(pts), marginM: 10 });
  assert.equal(fin(pts[1]), true); assert.equal(fin({ x: 5000, y: 0, z: 0 }), false);
});

test("#4006 a fault from a map trace alone: the box reaches down dip, to half its length along strike", () => {
  // a 4 km north-south trace at the ground (z 500), dipping 30 east
  const pts = Array.from({ length: 9 }, (_, i) => ({ x: 1000, y: i * 500, z: 500 }));
  const d = (30 * Math.PI) / 180, plane = { centroid: { x: 1000, y: 2000, z: 500 }, normal: [Math.sin(d), 0, Math.cos(d)] };
  const p = downDipReach(pts, plane, 0);
  assert.ok(Math.abs(p.z - (500 - 1000 * Math.sin(d))) < 1e-6, `1 km down dip: ${p.z}`);
  assert.ok(p.x > 1000, "down dip is east, the way it dips");
  assert.equal(downDipReach([], plane), null);
});

test("#4006 wiring: the run, the cut to the extent, the provenance, the stack", () => {
  const r = read("../src/modules/viewer/modellingRuns.js");
  assert.match(r, /if \(opts\.faultSpecs\) \{[^\n]*\n[^\n]*\n\s*for \(const spec of opts\.faultSpecs\) await runSurfaceModel\(spec, \{ trendTool: "structural" \}\);/);
  assert.match(r, /if \(typeof spec\.keepInside === "function"\) \{\n\s*const o = originRef\.current;\n\s*const c = clipMesh\(sceneVerts, faces, \(v\) => \{ const a = sceneToApi\(v\); return !spec\.keepInside\(\{ x: a\.x \+ o\.x, y: a\.y \+ o\.y, z: a\.z \+ o\.z \}\); \}\);/);
  assert.ok(r.indexOf("typeof spec.keepInside") > r.indexOf("lies entirely above the terrain surface") && r.indexOf("typeof spec.keepInside") < r.indexOf("TASKS.csv #3045 — the clips above keep every input vertex"), "cut with the other clips, before the unused vertices go");
  // a Faults-pane fault is not cut to the unit contacts' reach (it has its own extent), and its box point only sizes the model box
  assert.match(r, /if \(!s\.fault && !s\.params\?\.faultEvidence\) reachOf\.set\(/);
  assert.match(r, /specs\.flatMap\(\(s\) => \[\.\.\.s\.points, \.\.\.s\.orientations, \.\.\.\(s\.boxPts \|\| \[\]\)\]\)/);
  assert.doesNotMatch(r, /boxPts[^\n]*sidecar|sent[^\n]*boxPts/);
  assert.match(r, /\.\.\.\(spec\.params\?\.faultEvidence \? \{ faultEvidence: spec\.params\.faultEvidence \} : \{\}\)/);
  assert.match(r, /if \(type === "surf"\) \{[^\n]*\n\s*const s = \(ctx\.generatedSurfaces \|\| \[\]\)\.find\(\(x\) => x\.id === id\), inp = s\?\.params\?\.inputs/);
  const u = read("../src/modules/viewer/useModelling.js");
  assert.match(u, /ctxRef\.current = \{ \.\.\.ctx, [^\n]*generatedSurfaces: store\.generatedSurfaces \/\* #4006/);
  assert.match(u, /key: `surf\|\$\{s\.id\}`, type: s\.name, id: "", n: s\.params\.inputs\.points\.length, faultLike: true, label: s\.name, built: true/);
  const b = read("../src/modules/viewer/FaultBuilder.jsx");
  assert.match(b, /runStructuralModel\?\.\(null, \{ faultSpecs: specs \}\)/);
  assert.match(b, /setStackFaults\?\.\(\(p\) => \(p\.includes\(k\) \|\| p\.length >= 6 \? p : \[\.\.\.p, k\]\)\)/);
  assert.doesNotMatch(b, /fault: true/, "solved on its own, not as a stack's fault group");
  assert.match(read("../src/modules/viewer/FaultsPanel.jsx"), /<FaultBuilder key=\{activeTabId\} \{\.\.\.props\} \/>/); // a project tab's own choices
  // sheeted planes: no solver; each sheet registered as a fault surface through the world-mesh route, with its inputs for the stack
  assert.match(b, /const \[shape, setShape\] = useState\("planes"\);/);
  assert.match(b, /if \(shape === "planes"\) \{ buildPlanes\(other, msgs\); setSaid\(msgs\); return; \}/);
  // TASKS.csv #4053 — the build is faultRun.js's buildFaultPlanes (the pane and an AI app's build_fault run the same function)
  assert.match(b, /buildFaultPlanes\(\{ faults, extent, marginM, gapM, other, dips, terrain, traces: tracesRef\?\.current \|\| \[\], addSurface: addWorldMeshSurface, msgs \}\)/);
  assert.match(read("../src/modules/viewer/faultRun.js"), /const id = addSurface\?\.\(\{\n\s*name, positions: s\.positions, indices: s\.indices, color: colorForStructure\("FLT"\), opacity: 0\.7, type: "fault",/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /params = \{\}, type = "geoml" \/\* #4013[^\n]*\n[\s\S]{0,2400}faceCount: nTris, type, relationships/);
});

test("#4006 sheeted planes: two parallel faults 80 m apart become two flat sheets, cut at the ground and to the box; until another fault", async () => {
  const { faultPlaneMeshes, faultBox } = await import("../src/modules/viewer/faultGather.js");
  const { normalOf, planeFrame } = await import("../src/lib/sheetedPlanes.js");
  // made-up evidence: points on two planes dipping 70 towards 090, 80 m apart, a measured dip at every third point
  const { n, u, v } = planeFrame(normalOf(70, 90));
  const on = (off, k) => Array.from({ length: 10 }, (_, i) => { const a = (i - 4.5) * 40, b = -((i * 7 + k) % 10) * 25; /* v points up dip: these go down */ return { x: n[0] * off + u[0] * a + v[0] * b, y: n[1] * off + u[1] * a + v[1] * b, z: -50 + n[2] * off + u[2] * a + v[2] * b }; });
  const points = [...on(0, 1), ...on(80, 3)];
  const orientations = points.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, dip: 70, azimuth: 90 }));
  const box = faultBox({ points });
  for (const p of points) assert.ok(p.x - box.x0 >= 50 && box.x1 - p.x >= 50 && p.y - box.y0 >= 50 && box.y1 - p.y >= 50 && p.z - box.z0 >= 50 && box.z1 - p.z >= 50, "the box holds the evidence plus at least 50 m");
  const ground = () => 0; // flat ground at z 0
  const r = faultPlaneMeshes({ spec: { points, orientations }, extent: "box", box, ground, gapM: 25 });
  assert.equal(r.ok, true);
  assert.equal(r.sheets.length, 2, "two sheets");
  for (const s of r.sheets) {
    assert.ok(Math.abs(s.dip - 70) < 0.5 && Math.abs(s.dipDir - 90) < 0.5, `flat at 70 -> 090: ${s.dip} -> ${s.dipDir}`);
    assert.ok(s.fit.worstMissM < 0.01, "its points lie on it");
    assert.equal(s.fold.folded, false);
    const I = s.indices, P = s.positions;
    for (let t = 0; t < I.length; t += 3) assert.ok((P[I[t] * 3 + 2] + P[I[t + 1] * 3 + 2] + P[I[t + 2] * 3 + 2]) / 3 <= 1, "every kept triangle's centre under the ground");
    assert.equal(s.inputs.points.length, 10);
    assert.deepEqual(s.inputs.orientations[0].slice(3), [70, 90]);
  }
  // a second fault ending at the first: no kept triangle lies across it from its own points
  const first = r.sheets[0], other = { positions: first.positions, indices: first.indices };
  const u2 = faultPlaneMeshes({ spec: { points: on(80, 3), orientations: [] }, extent: "until", box, ground, other, normal: normalOf(30, 270) });
  assert.equal(u2.ok, true);
  const f0 = [first.positions[0], first.positions[1], first.positions[2]];
  const side = (x, y, z) => Math.sign(n[0] * (x - f0[0]) + n[1] * (y - f0[1]) + n[2] * (z - f0[2]));
  const s0 = side(...u2.sheets[0].inputs.points[0].slice(0, 3));
  const P = u2.sheets[0].positions, I = u2.sheets[0].indices;
  assert.ok(I.length > 0);
  for (let t = 0; t < I.length; t += 3) { const c = [0, 1, 2].map((k) => (P[I[t] * 3 + k] + P[I[t + 1] * 3 + k] + P[I[t + 2] * 3 + k]) / 3); assert.notEqual(side(...c), -s0, "no triangle across the other fault"); }
});
