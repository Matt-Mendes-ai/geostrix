// TASKS.csv #4007 — the Custom layers list in bulk: the import a layer came from, its siblings, Ctrl / Shift picks, names that keep their distinguishing end,
// and the wiring (Delete all, the pick bar, the row menu entry, one change for Undo). Made-up layers only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { layerImportKey, importSiblings, pickClick, pickedIn, middleCut, displayNames } from "../src/lib/viewer/customLayerBulk.js";
import { tableFromRows } from "../src/lib/rowTableBuild.js";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const layer = (id, name, src, n = 2) => ({ id, name, rows: Array.from({ length: n }, (_, i) => ({ hole_id: "H" + i, from: i, to: i + 1, value: i, ...(src ? { _src: src } : {}) })) });
const SRC = "db:demo_db.mineral_log";
const minerals = ["py", "cpy", "sph", "gn", "po"].map((m, i) => layer("custom_" + i, `${SRC}: ${m}_visual_pct`, SRC));

test("#4007 the import a layer came from: the _src its rows carry, in rows or in columns; none for a plain layer", () => {
  assert.equal(layerImportKey(minerals[0]), SRC);
  assert.equal(layerImportKey(layer("a", "plain", null)), "");
  assert.equal(layerImportKey({ id: "e", name: "empty", rows: [] }), "");
  const t = tableFromRows(layer("t", "cols", SRC, 50).rows);
  assert.equal(layerImportKey({ id: "t", name: "cols", rows: t }), SRC, "a layer held as columns");
});

test("#4007 siblings: the layers of one import (itself included), in list order; none when alone, from no import, or from another one", () => {
  const other = layer("x", "other file: a", "other.csv"), plain = layer("p", "plain", null);
  const all = [minerals[0], other, minerals[1], plain, minerals[2]];
  assert.deepEqual(importSiblings(all, minerals[1]).map((l) => l.id), ["custom_0", "custom_1", "custom_2"]);
  assert.deepEqual(importSiblings(all, other), [], "alone in its import");
  assert.deepEqual(importSiblings(all, plain), [], "from no known import");
  assert.deepEqual(importSiblings([], plain), []);
});

test("#4007 picks: Ctrl / Meta toggles a row, Shift picks the run from the last picked row, a plain click is not a pick", () => {
  const order = ["a", "b", "c", "d", "e"];
  let st = { picked: new Set(), anchor: null, order };
  const step = (id, mods) => { const r = pickClick(st, id, mods); if (r) st = { ...st, ...r }; return r; };
  assert.equal(step("b", {}), null, "plain click: the layer is shown or hidden");
  step("b", { ctrl: true }); assert.deepEqual([...st.picked], ["b"]);
  step("d", { ctrl: true }); assert.deepEqual(pickedIn(st.picked, order), ["b", "d"]);
  step("d", { ctrl: true }); assert.deepEqual([...st.picked], ["b"], "a second Ctrl+click unpicks");
  step("e", { shift: true }); assert.deepEqual(pickedIn(st.picked, order), ["b", "d", "e"], "Shift runs from the last clicked row (d, just unpicked) to e");
  st = { picked: new Set(["b"]), anchor: "b", order };
  step("e", { shift: true }); assert.deepEqual(pickedIn(st.picked, order), ["b", "c", "d", "e"], "Shift: b to e");
  step("a", { shift: true }); assert.deepEqual(pickedIn(st.picked, order), ["a", "b", "c", "d", "e"], "Shift upward, from the same anchor");
  st = { picked: new Set(), anchor: null, order }; step("c", { shift: true }); assert.deepEqual([...st.picked], ["c"], "Shift with no anchor picks that row");
  assert.deepEqual(pickedIn(new Set(["a", "gone"]), order), ["a"], "a layer removed another way drops out of the pick");
});

test("#4007 long names: the start and the end both show; a name that fits is untouched; siblings lose what they share", () => {
  assert.equal(middleCut("short name"), "short name");
  const cut = middleCut("db:some_database.a_very_long_view_name_cpy_visual_pct");
  assert.ok(cut.length <= 20 && cut.startsWith("db:") && cut.endsWith("visual_pct") && cut.includes("…"), cut);
  const names = displayNames(minerals);
  for (const l of minerals) assert.ok(names.get(l.id).endsWith(l.name.slice(-6)), names.get(l.id));
  assert.equal(names.get("custom_1"), "…cpy_visual_pct", "the shared database and view are dropped, the mineral is read");
  assert.equal(new Set([...names.values()]).size, minerals.length, "every row reads differently");
  // longer field names: the shared start AND the shared ending go, so the field is what is read, and the tooltip has the rest
  const long = ["chalcopyrite", "sphalerite", "total_sulphide"].map((m, i) => layer("g" + i, `${SRC}: ${m}_visual_pct`, SRC));
  assert.deepEqual([...displayNames(long).values()], ["…chalcopyrite…", "…sphalerite…", "…total_sulphide…"]);
  assert.ok([...displayNames([...minerals, ...long]).values()].every((t) => t.length <= 20), "every row fits");
  const lone = layer("l", "db:some_database.a_very_long_view_name_cpy_visual_pct", null);
  assert.equal(displayNames([lone]).get("l"), cut, "no siblings: cut in the middle");
  assert.equal(displayNames([layer("s", "Short", null)]).get("s"), "Short");
});

test("#4007 the wiring: Delete all in the heading, the pick bar, Ctrl / Shift on the row, the row menu entry, one change for Undo, the full name in the tooltip", () => {
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /import \{ useCustomLayerPicks \} from "\.\/viewer\/useCustomLayerPicks\.js";/);
  assert.match(v, /const customPicks = useCustomLayerPicks\(\{ customLayers, setCustomLayers, layerGroupsRef \}\);/);
  assert.match(v, /customLayers\.length > 1 && <span role="button"[^\n]*onClick=\{customPicks\.deleteAll\}[^\n]*\{tr\("Delete all"\)\}/);
  assert.match(v, /customPicks\.pickedIds\.length > 0/); assert.match(v, /onClick=\{customPicks\.deletePicked\}/); assert.match(v, /onClick=\{customPicks\.clearPicks\}/);
  assert.match(v, /if \(!customPicks\.clickRow\(e, l\.id\)\) toggleCustom\(l\.id\)/);
  assert.match(v, /customPicks\.hasSiblings\(l\) && \{ label: tr\("Delete this import's layers…"\), onClick: \(\) => customPicks\.deleteImport\(l\) \}/);
  assert.match(v, /title=\{l\.notes \? `\$\{l\.name\}\\n\$\{l\.notes\}` : l\.name\}>\{customPicks\.names\.get\(l\.id\) \?\? l\.name/);
  const h = read("src/modules/viewer/useCustomLayerPicks.js");
  assert.equal((h.match(/setCustomLayers\(/g) || []).length, 1, "one setCustomLayers for any number of layers: one Undo step");
  assert.match(h, /confirmDestructive\(question, \{ undoable: true \}\)/);
  assert.match(h, /tr\("Delete the \{n\} custom layers\?"/);
  assert.match(h, /pickedIds\.length === 1\s*\? tr\("Remove the custom layer \\"\{name\}\\"\?"/, "one picked row asks as the row's own trash does, not 'the 1 picked layers'");
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`src/locales/${lang}.json`));
    for (const k of ["Delete the {n} custom layers?", "Delete the {n} picked layers?", "{n} picked", "Delete this import's layers…"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
