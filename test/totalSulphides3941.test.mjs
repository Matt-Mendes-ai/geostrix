// TASKS.csv #3941 — a Total sulphides value per interval of a Mineralization layer: the codes read from the layer against a broad sulphide list
// (every deposit style), the long form (one row per mineral) and the wide form (a number field per mineral), a repeated mineral counted once,
// a layer without per cents said, the style keys kept, the scene's colour / filter and the legend's ramp. Made-up holes and numbers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sulphideName, layerMineralCodes, defaultSulphideTicks, totalSulphides, withTotalSulphides, mineralCodesOf, wideMineralFields, fieldStyler, TOTAL_SULPHIDES_FIELD } from "../src/lib/totalSulphides.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";
import { categoryLegendGroups } from "../src/lib/legendGroups.js";

const R = (hole_id, from, to, value, extra) => ({ hole_id, from, to, value, extra });

test("#3941 the sulphide list covers many deposit styles and leaves oxides, gold and gangue out", () => {
  for (const c of ["Py", "PO", "cpy", "Sph", "GN", "Apy", "Mol", "Bn", "Cc", "Cv", "En", "Tt", "Tn", "Stb", "Cin", "Pn", "Mc", "Rlg", "Orp", "Aca", "MN_CPY_pct", "py_sum", "Pyrite", "Calcopirita", "sulfide"])
    assert.ok(sulphideName(c), c);
  for (const c of ["Mt", "Mag", "Hem", "VG", "Au", "Qtz", "Cal", "Chl", "Ser", "Gt", "Lim"]) assert.equal(sulphideName(c), null, c);
});

test("#3941 long form: minerals of one interval sum, a repeated mineral counts once, a mixed list is left out", () => {
  const rows = [R("DH-23-001", 0, 2, "Py", 3), R("DH-23-001", 0, 2, "Cpy", 1.5), R("DH-23-001", 0, 2, "Mt", 10), R("DH-23-001", 0, 2, "Py", 2),
    R("DH-23-001", 2, 4, "Qtz; Py", 5), R("DH-23-001", 2, 4, "Sph", 4), R("DH-23-002", 10, 12, "Mt", 6)];
  const info = layerMineralCodes(rows);
  assert.equal(info.form, "long");
  assert.deepEqual(defaultSulphideTicks(info).sort(), ["Cpy", "Py", "Sph"]);
  const t = totalSulphides(rows, defaultSulphideTicks(info), info);
  assert.deepEqual(t.values, [4.5, 4.5, 4.5, 4.5, 4, 4, 0]); // magnetite only: 0, a total, not a gap
  assert.equal(t.mixed, 1);
  assert.deepEqual(totalSulphides(rows, ["Py"], info).values.slice(0, 2), [3, 3]); // the user's ticks, not the list
});

test("#3941 overlapping intervals: each row takes the length-weighted total over its own from-to", () => {
  const rows = [R("DH-1", 0, 4, "Py", 2), R("DH-1", 2, 4, "Cpy", 4)];
  const t = totalSulphides(rows, ["Py", "Cpy"]);
  assert.deepEqual(t.values, [4, 6]); // 0-2: 2 %, 2-4: 6 % -> the Py row's mean 4 %, the Cpy row 6 %
});

test("#3941 a layer with codes but no per cent says so (no zeros written)", () => {
  const rows = [R("DH-1", 0, 2, "Py"), R("DH-1", 2, 4, "Cpy")];
  const out = withTotalSulphides(rows, ["Py", "Cpy"]);
  assert.equal(out.status, "no-pct");
  assert.equal(out.rows, rows);
  assert.ok(!(TOTAL_SULPHIDES_FIELD in out.rows[0]));
});

test("#3941 wide form: the per-mineral number fields are the codes, the ticked ones sum", () => {
  const rows = [{ hole_id: "DH-1", from: 0, to: 1, value: "CPY", extra: 7, MN_PY_pct: 2, MN_CPY_pct: 4, MN_MT_pct: 1, style: "dissem" },
    { hole_id: "DH-1", from: 1, to: 2, value: "MT", extra: 3, MN_PY_pct: null, MN_CPY_pct: null, MN_MT_pct: 3 }];
  assert.deepEqual(wideMineralFields(rows).map((f) => f.key), ["MN_PY_pct", "MN_CPY_pct", "MN_MT_pct"]);
  const info = mineralCodesOf(rows);
  assert.equal(info.form, "wide");
  assert.deepEqual(defaultSulphideTicks(info), ["MN_PY_pct", "MN_CPY_pct"]);
  const out = withTotalSulphides(rows, defaultSulphideTicks(info), info);
  assert.deepEqual(out.rows.map((r) => r[TOTAL_SULPHIDES_FIELD]), [6, null]);
});

test("#3941 the style keeps the ticks and the lowest total; the scene colours and filters by them", () => {
  const st = cleanLayerStyle({ sulphideCodes: ["Py", "Cpy"], sulphideMin: 2, colourBy: TOTAL_SULPHIDES_FIELD }, "point");
  assert.deepEqual(st, { colourBy: TOTAL_SULPHIDES_FIELD, sulphideCodes: ["Py", "Cpy"], sulphideMin: 2 });
  assert.equal(cleanLayerStyle({ sulphideMin: 0 }, "point"), null);
  const rows = withTotalSulphides([R("DH-1", 0, 2, "Py", 1), R("DH-1", 2, 4, "Py", 5), R("DH-1", 4, 6, "Cpy", 9)], ["Py", "Cpy"]).rows;
  const f = fieldStyler(rows, st);
  assert.deepEqual(rows.map((r) => f.shown(r)), [false, true, true]);
  assert.notEqual(f.colourOf(rows[1]), f.colourOf(rows[2]));
  assert.equal(fieldStyler(rows, null), null);
  const g = categoryLegendGroups({ keys: ["mnlgy"], layers: { mnlgy: rows }, layerVisible: { mnlgy: true }, styles: { mnlgy: st }, labelFor: (k, v) => v, colorFor: () => "#888888" });
  assert.equal(g.length, 1);
  assert.ok(g[0].ramp && g[0].label.includes(TOTAL_SULPHIDES_FIELD));
});

test("#3941 wiring: the box in the Mineralization panel, the scene's styler, the legend given the styles", () => {
  const parts = fs.readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(parts, /<TotalSulphidesBox rows=\{rows\} style=\{style\} onStyle=\{onStyle\} \/>/);
  assert.match(parts, /const TotalSulphidesBox = React\.lazy\(\(\) => import\("\.\.\/\.\.\/components\/TotalSulphidesBox\.jsx"\)\)/); // its own chunk (startup size)
  const scene = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(scene, /rb\?\.colourOf \? rb\.colourOf\(row\)/);
  assert.match(scene, /\(!rb \|\| rb\.shown\(r\)\)/);
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /styles: layerStyles, hidden: categoryFilter/);
  assert.match(vm, /onStyle=\{\(p\) => setLayerStyle\(key, "point", p\)\}/);
});
