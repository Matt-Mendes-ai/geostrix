// TASKS.csv #3164 (part 1) — a method per element in an estimation set. A member's method is its own choice or, by default, the primary's; with
// the primary's method (not kriging, not a log10 run) it stays in the primary's neighbour search (#3163), otherwise it runs on its own on the same
// grid, search and domain rule. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { cellsFromColumns, memberColumns } from "../src/lib/estimationCells.js";
import { ESTIMATION_METHODS } from "../src/lib/estimationMeta.js";
import { memberMethodFor, sharesPrimarySearch, memberName, setRecord, MEMBER_OWN_KEYS } from "../src/lib/estimateSet.js";

const IDS = ESTIMATION_METHODS.map((m) => m.id);

// a 5 x 5 grid of vertical holes 25 m apart, a 2 m composite every 2 m; Fe, Au and Cu vary smoothly (with a short-scale wobble) across the area
function points(valueOf) {
  const out = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = i * 25, y = j * 25, h = `H${i}${j}`;
    for (let z = -1; z > -40; z -= 2) out.push({ x, y, z, hole_id: h, value: valueOf(x, y, z), length: 2, from: -z - 1, to: -z + 1 });
  }
  return out;
}
const fe = points((x, y, z) => 40 + x / 10 + Math.sin(y / 9) * 3 - z / 20);
const au = points((x, y, z) => 0.5 + Math.abs(Math.sin(x / 13) * Math.cos(y / 17)) * 2 + ((x + y) % 7) / 20);
const cu = points((x, y) => 0.2 + y / 400 + Math.cos(x / 11) / 10);
const baseOpts = { bounds: { xmin: -10, xmax: 110, ymin: -10, ymax: 110, zmin: -40, zmax: 0 }, cellSize: { dx: 10, dy: 10, dz: 5 }, method: "idw2", searchRadius: 60, minSamples: 1, maxSamples: 12, minHoles: 1, support: true };
const byKey = (cells) => new Map(cells.map((c) => [`${c.x},${c.y},${c.z}`, c.value]));

test("the member's method: its own choice when offered, else the primary's", () => {
  assert.equal(memberMethodFor(undefined, "idw2", IDS), "idw2", "no choice: as the primary");
  assert.equal(memberMethodFor("", "nn", IDS), "nn");
  assert.equal(memberMethodFor("ok", "idw2", IDS), "ok");
  assert.equal(memberMethodFor("mls1", "ok", IDS), "mls1");
  assert.equal(memberMethodFor("idw9", "idw2", IDS), "idw2", "a remembered method no longer offered falls back to the primary's");
});

test("who shares the primary's search: the primary's method only, never kriging or a log10 run", () => {
  assert.equal(sharesPrimarySearch("idw2", "idw2"), true);
  assert.equal(sharesPrimarySearch("nn", "nn"), true);
  assert.equal(sharesPrimarySearch("ok", "idw2"), false, "an own method runs on its own");
  assert.equal(sharesPrimarySearch("idw2", "ok"), false);
  assert.equal(sharesPrimarySearch("ok", "ok"), false, "under kriging every member fits its own variogram");
  assert.equal(sharesPrimarySearch("idw2", "idw2", true), false, "a log10 run");
});

test("a set with Fe by IDW², Au by ordinary kriging and Cu as Fe: each equals that element estimated alone with its method", () => {
  const members = { Au: memberMethodFor("ok", "idw2", IDS), Cu: memberMethodFor(undefined, "idw2", IDS) };
  assert.equal(sharesPrimarySearch(members.Cu, "idw2"), true);
  assert.equal(sharesPrimarySearch(members.Au, "idw2"), false);
  // the primary's run carries the shared member (Cu) in its search, as the dialog's run does (#3163)
  const run = estimateBlockModel(fe, { ...baseOpts, columns: true, members: { values: [Float64Array.from(cu, (q) => q.value)] } });
  const feCells = cellsFromColumns(run.columns);
  assert.deepEqual(feCells, estimateBlockModel(fe, baseOpts).cells, "Fe is unchanged by its members");
  const cuShared = cellsFromColumns(memberColumns(run.columns, 0)); // as estimationClient turns them into cells
  const cuAlone = estimateBlockModel(cu, baseOpts).cells;
  assert.equal(cuShared.length, cuAlone.length);
  const cuA = byKey(cuAlone);
  for (const c of cuShared) assert.ok(Math.abs(c.value - cuA.get(`${c.x},${c.y},${c.z}`)) < 1e-9, "Cu as Fe = Cu alone by IDW²");
  // Au on its own: the same grid, search and domain rule, its own method and its own fitted variogram
  const auOwn = estimateBlockModel(au, { ...baseOpts, method: members.Au, variogram: { model: "spherical" } });
  const auAlone = estimateBlockModel(au, { ...baseOpts, method: "ok", variogram: { model: "spherical" } });
  assert.ok(auOwn.variogram && auOwn.variogram.sill > 0, "Au fitted its own variogram");
  assert.deepEqual(auOwn.cells, auAlone.cells, "Au in the set = Au alone by ordinary kriging");
  // and the method took: Au by kriging is not Au by IDW²
  const auIdw = byKey(estimateBlockModel(au, baseOpts).cells);
  assert.ok(auOwn.cells.some((c) => Math.abs(c.value - auIdw.get(`${c.x},${c.y},${c.z}`)) > 1e-6));
  // one lattice: Au's blocks are Fe's blocks
  const feKeys = new Set(feCells.map((c) => `${c.x},${c.y},${c.z}`));
  for (const c of auOwn.cells) assert.ok(feKeys.has(`${c.x},${c.y},${c.z}`));
});

test("a member's own variogram and kriging counts are its own record, not the primary's", () => {
  for (const k of ["variogram", "krigingBlocks", "mlsBlocks"]) assert.ok(MEMBER_OWN_KEYS.includes(k), k);
});

test("a member by its own method says it in its name; by the primary's, the name is as before", () => {
  const set = setRecord("s", "Fe", ["Mn", "LOI"]), name = "Fe estimate (idw2, 10m, r60m)";
  assert.equal(memberName(name, "Fe", "LOI", set, false, "ok", "idw2"), "LOI estimate (ok, 10m, r60m) (set: Fe, Mn, LOI)");
  assert.equal(memberName(name, "Fe", "Mn", set, false, "idw2", "idw2"), "Mn estimate (idw2, 10m, r60m) (set: Fe, Mn, LOI)");
  assert.equal(memberName(name, "Fe", "Mn", set), "Mn estimate (idw2, 10m, r60m) (set: Fe, Mn, LOI)", "the old call");
  assert.equal(memberName(name, "Fe", "Fe", set, false, "idw2", "idw2"), "Fe estimate (idw2, 10m, r60m) (set: Fe, Mn, LOI)");
  assert.equal(memberName("Pit A", "Fe", "LOI", set, true, "ok", "idw2"), "Pit A — LOI, ok (set: Fe, Mn, LOI)", "a typed name");
  assert.equal(memberName("Pit A", "Fe", "Mn", set, true, "idw2", "idw2"), "Pit A — Mn (set: Fe, Mn, LOI)");
});

test("wiring: the per-element select, the remembered choice, the member runs and records, the result line", () => {
  const s = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(s, /const \[memberMethods, setMemberMethods\] = useState\(\(\) => keep\("memberMethods", \{\}/);
  assert.match(s, /remember\.current = \{ memberMethods \/\* #3164 \*\//);
  assert.match(s, /const memberMethodOf = \(el\) => memberMethodFor\(memberMethods\[el\], method, ESTIMATION_METHODS\.map\(\(m\) => m\.id\)\);/);
  assert.match(s, /sharesPrimarySearch\(memberMethodOf\(q\.el\), method, !!logInfo\)/);
  assert.match(s, /runEstimation\("block", mp, \{ \.\.\.baseOpts, method: mMethod \/\* #3164 \*\/, \.\.\.\(mMethod === "ok" \? \{ variogram: \{ model: vgModel \} \} : \{\}\)/);
  assert.match(s, /element: el, unit: u, method: mMethod \/\* #3164 \*\//, "params.method is the member's own");
  assert.match(s, /members\.push\(\{ \.\.\.memberSummary\(el, u, t\.cells, mp\.length\), method: mMethod/);
  assert.match(s, /const mNn = mMethod === "nn"/, "the member's check follows its own method");
  assert.match(s, /retallyKeptCells\(t\.cells, \{ method: mMethod/);
  assert.match(s, /`estimate-\$\{m\.method \|\| method\}`/, "the member model's source names its method");
  assert.match(s, /memberName\(name, p0, m\.element, set, typed, m\.method, result\.params\?\.method\)/);
  assert.match(s, /aria-label=\{tr\("Method for \{el\}", \{ el \}\)\}/);
  assert.match(s, /tr\("as \{el\}", \{ el: symbol \}\)/);
  assert.match(s, /tr\("\{el\} \(\{method\}\): \{blocks\} blocks from \{n\} composites, mean \{mean\} \{unit\}"/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Method for {el}", "as {el}", "{el} ({method}): {blocks} blocks from {n} composites, mean {mean} {unit}"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
