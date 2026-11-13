// TASKS.csv #3066 / #3068 — the shared KMZ icon set of outcrop structures: one white PNG per symbol (and line thickness), and per reading
// its href and the true strike to turn by
import test from "node:test";
import assert from "node:assert/strict";
import { structureIconSet, lineScaleOf } from "../src/lib/structureKmzIcons.js";
import { surfaceStructureRows } from "../src/lib/overlayExport.js";

const rows = [
  { x: 600000, y: 6200000, dip: 35, dipDir: 120, type: "Bedding", cls: "bedding" },
  { x: 600050, y: 6200000, dip: 40, dipDir: 200, type: "Bedding", cls: "bedding" },
  { x: 600100, y: 6200000, dip: 0, dipDir: 0, horizontal: true, type: "Bedding", cls: "bedding" },
  { x: 600150, y: 6200000, dip: 70, dipDir: 300, type: "S1 schistosity", cls: "foliation" },
  { x: 600200, y: 6200000, dip: null, dipDir: 90, type: "Fault", cls: "fault" },
];
const set = { name: "a", rows, symbolByType: { "S1 SCHISTOSITY": "foliation" } };

test("each distinct symbol once, white; a row with no attitude has no icon", async () => {
  const icons = await structureIconSet([set]);
  assert.deepEqual(icons.files.map((f) => f.name).sort(), ["files/sym_6_1.png", "files/sym_6_2.png", "files/sym_8_1_2.png"]);
  for (const f of icons.files) { assert.deepEqual([...f.data.slice(1, 4)], [80, 78, 71]); }
  assert.equal(icons.iconOf(rows[4], set), null);
  assert.equal(icons.iconOf(rows[0], set).href, "files/sym_6_2.png");
  assert.equal(icons.iconOf(rows[3], set).href, "files/sym_8_1_2.png", "the set's choice for the type");
  assert.equal(icons.iconOf({ x: 1, y: 2, dip: 30, dipDir: 10, type: "Qz vein", cls: "vein" }, set), null, "a symbol not packed: the caller falls back");
});

test("the heading is the true right-hand-rule strike, as the export's strike_rhr_true", async () => {
  const icons = await structureIconSet([set], { epsg: 32609 });
  const out = surfaceStructureRows(set, 32609);
  for (const i of [0, 1, 3]) assert.equal(icons.iconOf(rows[i], set).heading, out[i].strike_rhr_true, String(i));
  assert.notEqual(out[0].strike_rhr_true, 30, "UTM 9 at this point: grid and true north differ");
  const noCrs = await structureIconSet([set]);
  assert.equal(noCrs.iconOf(rows[0], set).heading, 30, "no CRS: the grid strike");
});

test("the set's line thickness: its own PNG, bolder", async () => {
  assert.equal(lineScaleOf({}), 1); assert.equal(lineScaleOf({ lineScale: 2 }), 2); assert.equal(lineScaleOf({ lineScale: 40 }), 6); assert.equal(lineScaleOf({ lineScale: -1 }), 1);
  const thin = await structureIconSet([set]), bold = await structureIconSet([{ ...set, lineScale: 3 }]);
  assert.equal(bold.iconOf(rows[0], { ...set, lineScale: 3 }).href, "files/sym_6_2_w300.png");
  const size = (f) => f.data.length;
  assert.ok(bold.files.length === thin.files.length && size(bold.files.find((f) => f.name.includes("6_2"))) > 0);
});
