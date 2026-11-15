// TASKS.csv #3164 (part 2) — the block calculator: the lattice join, the formula, blocks left out (missing input / no number), off-lattice
// refusals, the new model's record, no default formula or numbers that read as facts (#264), and the wiring. Synthetic blocks only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockCalc, calcModelRecord, calcVarFor, isCalcVar, formulaVars, joinRefusal } from "../src/lib/blockCalc.js";
import { blockModelLattice } from "../src/lib/estimationMeta.js";
import { NOT_A_RESOURCE_SOURCE } from "../src/lib/blockModelExport.js";

// a 4 x 3 x 2 lattice of 10 x 10 x 5 m blocks at a UTM-sized origin; value(i, j, k) per model, null = no block
function model(name, valueOf, { element = null, unit = "%", shift = 0, size = 10 } = {}) {
  const cells = [];
  for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
    const v = valueOf(i, j, k);
    if (v == null) continue;
    cells.push({ x: 500005 + i * size + shift, y: 6200005 + j * size, z: 102.5 + k * 5, dx: size, dy: size, dz: 5, value: v });
  }
  return { name, cells, params: element ? { element, unit } : {} };
}
const Fe = model("Fe estimate", (i, j, k) => 50 + i + j * 2 + k, { element: "Fe" });
const LOI = model("LOI estimate", (i, j, k) => (i === 3 && j === 2 ? null : 4 + i * 0.5 + k), { element: "LOI" }); // one column missing
const SiO2 = model("SiO2 estimate", (i, j) => 2 + i * 1.5 + j, { element: "SiO2" });

test("names: the element, else the first word; valid and unique", () => {
  assert.equal(calcVarFor(Fe), "Fe");
  assert.equal(calcVarFor(Fe, ["fe"]), "Fe_2");
  assert.equal(calcVarFor({ name: "Cu-eq block model", params: {} }), "Cu_eq");
  assert.equal(calcVarFor({ name: "3D density", params: {} }), "m_3D");
  assert.equal(calcVarFor({ name: "if", params: {} }), "if_m");
  assert.equal(calcVarFor({ name: "SG", property: "Density (t/m3)", params: {} }), "Density");
  assert.ok(isCalcVar("SiO2") && isCalcVar("Al2O3") && isCalcVar("_x"));
  assert.ok(!isCalcVar("2x") && !isCalcVar("a b") && !isCalcVar("not") && !isCalcVar(""));
  assert.deepEqual(formulaVars("Fe / (1 - LOI / 100) + log(SiO2) * 0 + 'Fe'", ["Fe", "LOI", "SiO2", "Al2O3"]), ["Fe", "LOI", "SiO2"]);
  assert.deepEqual(formulaVars("max(0, [SiO2] - 4)", ["Fe", "SiO2"]), ["SiO2"]);
  assert.deepEqual(formulaVars("exp(1)", ["exp", "Fe"]), [], "a function call is not the model named exp");
});

test("calcined Fe on known numbers: every block in both inputs, exact values; the block without LOI left out and counted", async () => {
  const r = await blockCalc([{ var: "Fe", model: Fe }, { var: "LOI", model: LOI }], "Fe / (1 - LOI / 100)");
  assert.equal(r.blocks, 22);
  assert.equal(r.missing, 2, "the 2 blocks of column (3, 2) have Fe but no LOI");
  assert.equal(r.blank, 0);
  const loi = new Map(LOI.cells.map((c) => [`${c.x},${c.y},${c.z}`, c.value]));
  for (const c of r.cells) {
    const f = Fe.cells.find((q) => q.x === c.x && q.y === c.y && q.z === c.z);
    assert.equal(c.value, f.value / (1 - loi.get(`${c.x},${c.y},${c.z}`) / 100));
    assert.equal(c.dx, 10); assert.equal(c.dz, 5);
  }
  assert.ok(!r.cells.some((c) => c.x === 500035 && c.y === 6200025), "never a zero where LOI is missing");
  assert.deepEqual(r.read, ["Fe", "LOI"]);
});

test("an if() penalty; an input the formula does not read is not required", async () => {
  const r = await blockCalc([{ var: "Fe", model: Fe }, { var: "SiO2", model: SiO2 }, { var: "LOI", model: LOI }], "Fe * 2 - if(SiO2 > 5, (SiO2 - 5) * 3, 0)");
  assert.equal(r.blocks, 24, "LOI is not read: its missing column leaves nothing out");
  assert.equal(r.missing, 0);
  for (const c of r.cells) {
    const f = Fe.cells.find((q) => q.x === c.x && q.y === c.y && q.z === c.z).value, s = SiO2.cells.find((q) => q.x === c.x && q.y === c.y && q.z === c.z).value;
    assert.equal(c.value, f * 2 - (s > 5 ? (s - 5) * 3 : 0));
  }
});

test("a division by zero leaves the block out and is counted, separately from a missing input", async () => {
  const Z = model("Zero test", (i) => i, { element: "Z" }); // i = 0 gives a zero divisor
  const r = await blockCalc([{ var: "Fe", model: Fe }, { var: "Z", model: Z }, { var: "LOI", model: LOI }], "Fe / Z + LOI * 0");
  assert.equal(r.blank, 6 - 0, "the six i = 0 blocks");
  assert.equal(r.missing, 2);
  assert.equal(r.blocks, 24 - 6 - 2);
  assert.ok(r.cells.every((c) => Number.isFinite(c.value)));
});

test("inputs on another lattice are refused with the reason; bad names and empty formulas are refused before any block", async () => {
  const L = blockModelLattice(Fe);
  assert.equal(joinRefusal(L, SiO2), null);
  assert.match(joinRefusal(L, model("Shifted", () => 1, { shift: 3 })), /not on the same grid/);
  assert.match(joinRefusal(L, model("Bigger", () => 1, { size: 20 })), /not on the same grid/);
  assert.equal(joinRefusal(L, model("Whole cells over", () => 1, { shift: 30 })), null, "an origin whole cells away is the same lattice");
  assert.match(joinRefusal(L, { name: "empty", cells: [] }), /no blocks/);
  await assert.rejects(blockCalc([{ var: "Fe", model: Fe }, { var: "S", model: model("Shifted", () => 1, { shift: 3 }) }], "Fe + S"), /Shifted: .*not on the same grid/);
  await assert.rejects(blockCalc([{ var: "Fe", model: Fe }], "   "), /Enter a formula/);
  await assert.rejects(blockCalc([{ var: "Fe", model: Fe }], "Fe + Cu"), /Unknown name "Cu"/);
  await assert.rejects(blockCalc([{ var: "Fe", model: Fe }], "2 + 3"), /reads no block model/);
  await assert.rejects(blockCalc([{ var: "Fe", model: Fe }, { var: "fe", model: SiO2 }], "Fe"), /its own name/);
  await assert.rejects(blockCalc([{ var: "1x", model: Fe }], "1"), /can't be a name/);
});

test("in slices, it pauses and can be cancelled", async () => {
  const big = model("Big", () => 1, { element: "B" });
  big.cells = Array.from({ length: 30000 }, (_, n) => ({ x: 500005 + (n % 100) * 10, y: 6200005 + Math.floor(n / 100) % 100 * 10, z: 102.5 + Math.floor(n / 10000) * 5, dx: 10, dy: 10, dz: 5, value: n }));
  let pauses = 0;
  const r = await blockCalc([{ var: "B", model: big }], "B * 2", { pause: () => { pauses++; return Promise.resolve(); } });
  assert.equal(r.blocks, 30000);
  assert.ok(pauses >= 10);
  const ac = new AbortController();
  let k = 0;
  await assert.rejects(blockCalc([{ var: "B", model: big }], "B * 2", { signal: ac.signal, pause: () => { if (++k === 3) ac.abort(); return null; } }), (e) => e.cancelled === true);
});

test("the new model: name and unit required, params.calc names the inputs it read, a snapshot", async () => {
  const inputs = [{ var: "Fe", model: Fe }, { var: "LOI", model: LOI }, { var: "SiO2", model: SiO2 }];
  const result = await blockCalc(inputs, "Fe / (1 - LOI / 100)");
  assert.throws(() => calcModelRecord({ name: " ", unit: "%", formula: "x", inputs, result }), /name/);
  assert.throws(() => calcModelRecord({ name: "Calcined Fe", unit: "", formula: "x", inputs, result }), /unit/);
  const m = calcModelRecord({ name: " Calcined Fe ", unit: "%", formula: " Fe / (1 - LOI / 100) ", inputs, result });
  assert.equal(m.name, "Calcined Fe");
  assert.equal(m.source, "calc");
  assert.equal(m.cells, result.cells);
  assert.deepEqual(m.params.calc, { formula: "Fe / (1 - LOI / 100)", unit: "%", inputs: [{ var: "Fe", model: "Fe estimate", element: "Fe", unit: "%" }, { var: "LOI", model: "LOI estimate", element: "LOI", unit: "%" }] });
  assert.equal(m.params.unit, "%");
  assert.equal(m.params.element, "Calcined Fe");
  assert.equal(m.params.blocksLeftOutMissingInput, 2);
  assert.ok(!("blocksLeftOutNoValue" in m.params));
  assert.match(m.params.snapshot, /does not change/);
  assert.ok(NOT_A_RESOURCE_SOURCE.test(m.source), "its exports say: not a Mineral Resource");
});

test("the block-model CSV of a calculated model: the not-a-resource line, its formula and inputs in the header, its values", async () => {
  const { blockModelCsvText, blockModelParamLines } = await import("../src/lib/blockModelExport.js");
  const { stampLines, withStamp, NOT_A_RESOURCE } = await import("../src/lib/provenance.js");
  const inputs = [{ var: "Fe", model: Fe }, { var: "LOI", model: LOI }];
  const result = await blockCalc(inputs, "Fe / (1 - LOI / 100)");
  const m = calcModelRecord({ name: "Calcined Fe", unit: "%", formula: "Fe / (1 - LOI / 100)", inputs, result });
  const text = withStamp(await blockModelCsvText(m, "datamine"), stampLines({ tool: "Block model export", epsg: 28350, params: blockModelParamLines(m) }));
  const head = text.split("\n").filter((l) => l.startsWith("# "));
  assert.equal(head[0], `# ${NOT_A_RESOURCE}`);
  assert.ok(head.includes('# formula: Fe / (1 - LOI / 100) (in %); Fe = "Fe estimate" (%); LOI = "LOI estimate" (%)'), head.join("\n"));
  assert.ok(head.includes("# Values: Calcined_Fe_pct in %"));
  assert.ok(head.includes("# blocksLeftOutMissingInput: 2"));
  const rows = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#")); // the CSV body is CRLF
  assert.equal(rows[0], "XC,YC,ZC,XINC,YINC,ZINC,Calcined_Fe_pct");
  assert.equal(rows.length - 1, 22);
});

test("no default formula; the help's examples carry letters, not prices or factors", () => {
  const s = readFileSync(new URL("../src/components/BlockCalculatorModal.jsx", import.meta.url), "utf8");
  assert.match(s, /const \[formula, setFormula\] = useState\(""\);/);
  assert.match(s, /const \[unit, setUnit\] = useState\(""\);/);
  const ex = [...s.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(ex, ["Fe / (1 - LOI / 100)", "Cu + Au * k", "Fe * p - max(0, SiO2 - s) * q"]);
  for (const e of ex.slice(1)) assert.doesNotMatch(e.replace(/max\(0,/, "").replace(/SiO2/g, ""), /\d/, `no number in "${e}" (the 0 of max(0, …) is the floor, not a price)`);
  assert.match(s, /GeoStrix proposes no price, recovery or penalty/);
});

test("wiring: the launcher beside grade-tonnage, the lazy modal, the strings in the four locales", () => {
  const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(panes, /<GradeTonnageLauncher \/>\{\/\* TASKS\.csv #1577 \*\/\}\s*<BlockCalculatorLauncher \/>/);
  const l = readFileSync(new URL("../src/components/BlockCalculatorLauncher.jsx", import.meta.url), "utf8");
  assert.match(l, /lazyModal\(\(\) => import\("\.\/BlockCalculatorModal\.jsx"\)\)/);
  const m = readFileSync(new URL("../src/components/BlockCalculatorModal.jsx", import.meta.url), "utf8");
  assert.match(m, /addVoxelModel\(\{ \.\.\.rec, \.\.\.\(rampLike \|\| rampOf\(rec\.cells\)\) \}\)/); // #3522: the first input's colours when asked
  const all = m + l + readFileSync(new URL("../src/lib/blockCalc.js", import.meta.url), "utf8");
  const str = String.raw`"((?:[^"\\]|\\.)*)"`;
  const keys = [...all.matchAll(new RegExp(String.raw`\btr\(` + str, "g"))].map((x) => x[1])
    .concat([...all.matchAll(new RegExp(String.raw`=== 1 \? ` + str + " : " + str, "g"))].flatMap((x) => [x[1], x[2]])) // singular / plural pairs
    .map((k) => JSON.parse(`"${k}"`));
  assert.ok(keys.length > 40, String(keys.length));
  for (const loc of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${loc}.json`, import.meta.url), "utf8"));
    for (const k of keys) assert.ok(d[k], `${loc}: ${k}`);
  }
});
