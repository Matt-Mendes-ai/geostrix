// TASKS.csv #1101 — the points and orientations a GemPy run sent, kept on its surfaces and written as GemPy's tables
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureInputs, gempyInputCsvs, runSurfaces, gempyInputFiles } from "../src/lib/gempyInputs.js";

const origin = { x: 500000, y: 6000000, z: 1000 };
// the run's spec (API frame = world - origin, unwarped) and what was sent (warped + smoothed: only the nuggets are read)
const spec = { meshName: "DACT", points: [{ x: 10, y: 20, z: -5 }, { x: 11.1234, y: 21, z: -6, nugget: 0.01 }], orientations: [{ x: 10, y: 20, z: -5, dip: 35.123, azimuth: 120 }] };
const sent = { points: [{ x: 999, y: 999, z: 999, nugget: 0.002 }, { x: 0, y: 0, z: 0, nugget: 0.01 }] };

test("captured in world coordinates, unwarped, with the nuggets that were sent", () => {
  const c = captureInputs(spec, sent, origin);
  assert.deepEqual(c.points, [[500010, 6000020, 995, 0.002], [500011.123, 6000021, 994, 0.01]]);
  assert.deepEqual(c.orientations, [[500010, 6000020, 995, 35.12, 120]]);
  assert.equal(c.fault, false);
  assert.equal(captureInputs({ ...spec, fault: true }, null, origin).points[0][3], null, "no nugget sent: blank");
});

test("GemPy's column names and order; a surface name with a comma is quoted", () => {
  const c = captureInputs(spec, sent, origin);
  const t = gempyInputCsvs([{ name: "DACT", inputs: c }, { name: "Unit, upper", inputs: { points: [[1, 2, 3, null]], orientations: [] } }]);
  const p = t["surface_points.csv"].split("\r\n"), o = t["orientations.csv"].split("\r\n");
  assert.equal(p[0], "X,Y,Z,surface,nugget");
  assert.equal(p[1], "500010,6000020,995,DACT,0.002");
  assert.equal(p[3], '1,2,3,"Unit, upper",');
  assert.equal(o[0], "X,Y,Z,azimuth,dip,polarity,surface");
  assert.equal(o[1], "500010,6000020,995,120,35.12,1,DACT");
});

test("one run's surfaces travel together; a surface without inputs has none", () => {
  const inputs = captureInputs(spec, sent, origin);
  const all = [
    { id: "a", name: "Top of DACT", params: { surface: "DACT", runId: "r1", inputs } },
    { id: "b", name: "Top of VCL", params: { surface: "VCL", runId: "r1", inputs: { points: [[1, 2, 3, null]], orientations: [], fault: false } } },
    { id: "c", name: "Fault F1", params: { surface: "Fault F1", runId: "r2", inputs: { points: [], orientations: [], fault: true } } },
    { id: "d", name: "Old", params: { surface: "Old" } },
  ];
  assert.deepEqual(runSurfaces(all, all[1]).map((s) => s.id), ["a", "b"]);
  assert.deepEqual(runSurfaces(all, all[3]), []);
  const files = gempyInputFiles(runSurfaces(all, all[0]), ["STAMP LINE"]);
  assert.deepEqual(files.map((f) => f.name), ["surface_points.csv", "orientations.csv", "provenance.txt"]);
  const prov = files[2].text;
  assert.ok(prov.startsWith("STAMP LINE\r\n"));
  assert.match(prov, /2 surface\(s\), 3 interface point\(s\), 1 orientation\(s\)/);
  assert.match(prov, /Surfaces in stack order: DACT, VCL\./);
});

test("the stored inputs stay out of the OBJ / DXF / glTF stamp", async () => {
  const { provenanceLines } = await import("../src/lib/meshExport.js");
  const L = provenanceLines("Top of DACT", { tool: "implicit surface (GemPy)", surface: "DACT", sourcePoints: 2, orientations: 1, runId: "r1", inputs: captureInputs(spec, sent, origin) }, {});
  assert.ok(!L.some((l) => /inputs =|runId =/.test(l)), L.join("\n"));
});
