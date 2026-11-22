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
});
