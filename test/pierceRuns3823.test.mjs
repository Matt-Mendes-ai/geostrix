// TASKS.csv #3823 (Scottie Gold review) — the pierce table interleaved six shells' crossings with nothing to say which were entries or the metres inside. Synthetic cubes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { piercePoints, pierceGroups } from "../src/lib/piercePoints.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a closed box x 0..10, y 0..10, z lo..hi
function box(id, name, lo, hi) {
  const positions = [0, 0, lo, 10, 0, lo, 10, 10, lo, 0, 10, lo, 0, 0, hi, 10, 0, hi, 10, 10, hi, 0, 10, hi];
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { id, name, positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
const sheet = { id: "sh", name: "Contact", positions: new Float32Array([-50, -50, -35, 50, -50, -35, 50, 50, -35, -50, 50, -35]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }; // open, at z -35
const trace = []; for (let md = 0; md <= 100; md += 2) trace.push({ md, x: 5, y: 5, z: 0 - md }); // vertical from z 0 to -100
// shell "a" is two boxes (z -30..-20 and -62..-50: two runs), "b" a thin one at -72..-70, "c" one the hole never reaches
// a surface id carries one mesh: merge the two runs of 'a' into one mesh by concatenating
const A1 = box("a", "1 g/t shell", -30, -20), A2 = box("a", "1 g/t shell", -62, -50);
const merged = { id: "a", name: "1 g/t shell", positions: Float32Array.from([...A1.positions, ...A2.positions]), indices: Uint32Array.from([...A1.indices, ...A2.indices.map((i) => i + 8)]) };
const S = [merged, box("b", "3 g/t shell", -72, -70), sheet, box("c", "far", -300, -290)];

test("a closed solid pairs its crossings into runs with the metres inside and a total", () => {
  const ps = piercePoints(trace, S), groups = pierceGroups(trace, S, ps);
  const a = groups.find((g) => g.surfaceId === "a");
  assert.equal(a.closed, true); assert.equal(a.rows.length, 4);
  assert.equal(a.runs.length, 2);
  assert.ok(Math.abs(a.runs[0].fromMd - 20) < 1e-6 && Math.abs(a.runs[0].toMd - 30) < 1e-6 && Math.abs(a.runs[0].metres - 10) < 1e-6);
  assert.ok(Math.abs(a.insideM - 22) < 1e-6, `${a.insideM}`);
  assert.ok(a.runs[0].entry && Math.abs(a.runs[0].entry.md - 20) < 1e-6, "the entry row carries the angle");
  assert.ok(Math.abs(groups.find((g) => g.surfaceId === "b").insideM - 2) < 1e-6);
  assert.equal(groups.find((g) => g.surfaceId === "c"), undefined, "a shell the hole never meets has no group");
});

test("an open surface keeps its crossings; groups come in order of the first crossing", () => {
  const groups = pierceGroups(trace, S, piercePoints(trace, S));
  const sh = groups.find((g) => g.surfaceId === "sh");
  assert.equal(sh.closed, false); assert.equal(sh.runs.length, 0); assert.equal(sh.rows.length, 1);
  assert.deepEqual(groups.map((g) => g.surfaceId), ["a", "sh", "b"]);
});

test("a hole that starts inside, or ends inside, says so", () => {
  const inside = pierceGroups(trace.filter((p) => p.md >= 22), [merged], piercePoints(trace.filter((p) => p.md >= 22), [merged]));
  assert.equal(inside[0].runs[0].atCollar, true);
  const short = trace.filter((p) => p.md <= 26), g = pierceGroups(short, [merged], piercePoints(short, [merged]));
  assert.equal(g[0].runs[0].atEnd, true);
});

test("wiring: the table is one block per surface with the run rows and its keys translated", () => {
  const p = read("../src/components/PlannedHoleParts.jsx");
  assert.match(p, /pierceGroups\(trace, surfaces, ps\)/);
  assert.match(p, /\{name\}: \{m\} m inside, in \{n\} runs/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["still inside at the end"], l);
});
