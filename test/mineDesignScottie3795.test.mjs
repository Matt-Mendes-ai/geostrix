// TASKS.csv #3795 / #3799 / #3798 / #3800 / #3801 (Scottie Gold review, Mine Design) — the stope metal beside the grade, the density and settings in every table that
// leaves, a strip-ratio remark, a ground check that does not call its own start above the ground, short names. Synthetic model and numbers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stopeOutlines, stopeRows } from "../src/lib/stopeOutlines.js";
import { pitMetalOf, metalCells, metalAmountText, pitSettingsCells, shortModelName, highStripRatio, HIGH_STRIP_RATIO } from "../src/lib/pitShell.js";
import { runAboveGround, worstCollarDistance, FAR_FROM_COLLARS_M } from "../src/lib/designLines.js";
import { stopeRuns } from "../src/lib/stopeRuns.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a 6 x 6 column model of 5 m blocks over two 10 m levels: a 3 x 3 patch of 8 g/t, the rest 0.5 g/t
const cells = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (const z of [5, 15]) cells.push({ x: i * 5, y: j * 5, z, dx: 5, dy: 5, dz: 10, value: i >= 1 && i <= 3 && j >= 1 && j <= 3 ? 8 : 0.5 });
const model = { cells };
const run = () => stopeOutlines(model, { cutoff: 3, levelH: 10, density: 2.5, minWidth: 0, minLength: 0 });

test("the stopes carry their contained metal: tonnes x grade, per stope, per level and in the totals", () => {
  const r = run();
  assert.ok(r.totals.stopes >= 1, JSON.stringify(r.totals));
  const lv = r.levels.find((l) => l.stopes.length);
  const tHand = 9 * 25 * 10 * 2.5; // 9 columns of 25 m2 over a 10 m level at 2.5 t/m3 = 5,625 t
  assert.ok(Math.abs(lv.tonnes - tHand) < 1, `${lv.tonnes}`);
  assert.ok(Math.abs(lv.metalU - tHand * 8) < 1, "5,625 t x 8 g/t = 45,000 g");
  assert.ok(Math.abs(lv.oreMetalU - tHand * 8) < 1);
  assert.ok(Math.abs(r.totals.metalU - r.levels.reduce((a, l) => a + l.metalU, 0)) < 1e-6);
  const m = pitMetalOf("ppm", "Au");
  assert.equal(metalAmountText(45000 * m.factor, m.unit, "Au", (x) => String(Math.round(x))), "1447 oz", "45,000 g = 1,446.8 troy oz");
  assert.deepEqual(metalCells(45000, m), { contained_oz: 1447, contained_kg: 45 });
  assert.deepEqual(metalCells(1000, pitMetalOf("%", "Cu"), "ore_contained"), { ore_contained_t: 10, ore_contained_lb: 22046 }, "a % grade: tonnes and pounds");
  assert.deepEqual(metalCells(5, null), {});
});

test("the CSV rows: contained metal and level top beside tonnes and grade", () => {
  const r = run(), m = pitMetalOf("ppm", "Au");
  const rows = stopeRows(r, "gpt", [], (mu, pre) => metalCells(mu, m, pre));
  assert.ok(rows.length >= 1);
  assert.ok("contained_oz" in rows[0] && "contained_kg" in rows[0] && "ore_contained_oz" in rows[0]);
  assert.equal(rows[0].contained_oz, Math.round(rows[0].tonnes * rows[0].grade_gpt / 31.1034768));
  assert.ok("grade_gpt" in rows[0] && "level_top" in rows[0]);
  assert.ok(!("contained_oz" in stopeRows(r, "ppm", [])[0]), "without a metal: as before");
});

test("a saved run keeps its metal, element and density, so the line after a reopen can say them", () => {
  const solids = [{ id: "a", type: "stope", params: { runId: "r1", blockModel: "M", gradeUnit: "ppm", element: "Au", density: 2.8, tonnes: 1000, metalU: 4000, levelRL: 500, generatedAt: "2026-01-01" } }, { id: "b", type: "stope", params: { runId: "r1", blockModel: "M", gradeUnit: "ppm", element: "Au", density: 2.8, tonnes: 3000, metalU: 8000, levelRL: 515 } }, { id: "c", type: "stope", params: { runId: "old", blockModel: "M", tonnes: 10 } }];
  const runs = stopeRuns(solids), r1 = runs.find((r) => r.key === "r1"), old = runs.find((r) => r.key === "old");
  assert.equal(r1.metalU, 12000); assert.equal(r1.hasMetal, true); assert.equal(r1.element, "Au"); assert.equal(r1.density, 2.8);
  assert.equal(old.hasMetal, false, "an earlier run without it says nothing of metal");
  const p = read("../src/components/StopesPane.jsx");
  assert.match(p, /metalU: Math\.round\(s\.metalU \* 1e3\) \/ 1e3/);
  assert.match(p, /line\(tr\("Contained metal \(diluted\)"\), metalText\(res\.totals\.metalU\)\)/);
  assert.match(p, /tr\("\{d\} t\/m³ \(typed\)", \{ d: Number\(res\.inputs\.density\) \}\)/);
  assert.match(p, /\.\.\.settingsCells\(\) \/\* #3799 \*\//);
  assert.match(p, /gradeUnitText\(res\.unit, res\.element\) === "g\/t" \? "gpt"/, "grade_gpt, not grade_ppm, for gold");
});

test("#3799 the bench and nested-pit CSVs carry the settings the tonnes were made with", () => {
  const c = pitSettingsCells({ density: 2.8, wasteDensity: 2.6, recovery: 90, price: 2000, priceUnit: "oz", miningCost: 3, processingCost: 30, slopeDeg: 45, typedCutoff: 3 });
  assert.deepEqual(c, { density_t_m3: 2.8, waste_density_t_m3: 2.6, recovery_pct: 90, price: 2000, price_unit: "oz", mining_cost_per_t_rock: 3, processing_cost_per_t_ore: 30, slope_deg: 45, typed_cutoff: 3 });
  assert.deepEqual(pitSettingsCells({ density: "" }), {}); assert.deepEqual(pitSettingsCells(null), {});
  assert.match(read("../src/components/PitDesignPane.jsx"), /\.\.\.pitSettingsCells\(pit\?\.params\?\.inputs\) \/\* #3799 \*\//);
  assert.match(read("../src/components/NestedPitsPane.jsx"), /\.\.\.pitSettingsCells\(inputs\) \/\* #3799/);
});

test("#3798 a strip ratio in the tens is remarked on, named a threshold; the pane says where to look", () => {
  assert.equal(highStripRatio(17.73), true); assert.equal(highStripRatio(48.7), true); assert.equal(highStripRatio(HIGH_STRIP_RATIO - 0.1), false); assert.equal(highStripRatio(null), false);
  assert.match(read("../src/components/PitShellPane.jsx"), /highStripRatio\(res\.stripRatio\) && <div role="note"/);
});

test("#3800 a start taken from the ground is not above it; a line far from every collar is not checked", () => {
  const ground = () => 827.59;
  assert.equal(runAboveGround([[0, 0, 828], [100, 0, 828]], ground), 0, "the start rounded up to the whole metre (828 on 827.59) is not above the ground");
  assert.equal(runAboveGround([[0, 0, 829], [100, 0, 829]], ground), 100, "a metre above is");
  assert.equal(runAboveGround([[0, 0, 828.2], [100, 0, 828.2]], ground, 0), 100, "with no tolerance, as before");
  const collars = [{ x: 0, y: 0 }, { x: 900, y: 0 }];
  assert.equal(Math.round(worstCollarDistance([[0, 0], [450, 0]], collars)), 450);
  assert.ok(worstCollarDistance([[10, 5], [20, 5]], collars) < FAR_FROM_COLLARS_M);
  assert.equal(worstCollarDistance([[0, 0]], []), null);
  assert.match(read("../src/components/DesignLinesPane.jsx"), /Not checked against the ground: this line runs up to/);
});

test("#3801 a long model name is cut at its first bracket for the names; the pane's other slips", () => {
  assert.equal(shortModelName("Au estimate (idw2, 5m, r186m, 3.4:1.8:1, in Au > 0.3 g/t shell holes ...)"), "Au estimate");
  assert.equal(shortModelName("Au estimate"), "Au estimate");
  assert.equal(shortModelName("A".repeat(60)).length, 40);
  assert.match(read("../src/components/StopesPane.jsx"), /model: shortModelName\(res\.model\)/);
  assert.match(read("../src/components/PitShellPane.jsx"), /model: shortModelName\(model\.name\)/);
  const p = read("../src/components/StopesPane.jsx");
  assert.match(p, /const alsoCandidates = models\.filter\(\(m\) => m !== model\);/, "(2) only grades are offered under 'Report these grades too'");
  assert.match(p, /were replaced by this one/, "(5) the earlier run's replacement is said");
  assert.match(p, /Levels start at the model's base/, "(6)");
  assert.match(read("../src/components/DesignStringsPane.jsx"), /Type both elevations \(from Z and to Z\)/, "(9)");
});
