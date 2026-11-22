// TASKS.csv #3989 — Model from map honouring the map: the mapped unit per terrain node and the 'where it differs' overlay, each top's orientations
// from the dips near its own contacts, the map's own colour for a unit. Made-up map and points.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mappedUnitsAt, differRaster, orientationsNear, mapUnitColour, fitToMap, DIFF_COLOUR } from "../src/lib/mapFit.js";
import { sameModelBlocks, sameModelVolumes, toReplace } from "../src/lib/viewer/sameModelBlocks.js";

const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const layer = { styleField: "unit", features: [{ attributes: { unit: "Canol" }, parts: sq(0, 0, 100, 100) }, { attributes: { unit: "Tuttle Fm" }, parts: sq(100, 0, 200, 100) }],
  categories: [{ value: "Canol", color: "#aa3311" }, { value: "Tuttle Fm", color: "#33aa55" }] };
const grid = { nx: 4, ny: 1, nodes: [{ i: 0, j: 0, x: 25, y: 50 }, { i: 1, j: 0, x: 75, y: 50 }, { i: 2, j: 0, x: 125, y: 50 }, { i: 3, j: 0, x: 500, y: 50 }] };

test("#3989 the mapped unit at each node, and where the model's unit at the ground differs from it", () => {
  const mapped = mappedUnitsAt(grid, layer);
  assert.deepEqual(mapped, ["Canol", "Canol", "Tuttle Fm", null]);
  const model = ["Canol", "Tuttle Fm", "tuttle fm", "Canol"]; // the second node is wrong; the fourth is off the map
  const d = differRaster(grid, model, mapped, ["Canol", "Tuttle Fm"]);
  assert.deepEqual([d.differ, d.compared], [1, 3]);
  assert.deepEqual([...d.px.slice(4, 8)], [...DIFF_COLOUR, 200]);
  assert.equal(d.px[3], 0); // an agreeing node stays clear
  assert.equal(differRaster(grid, model, mapped, ["Canol"]).compared, 2, "a mapped unit the model does not have is not compared");
});

test("#3989 each top takes the dips near its own contacts, the nearest few when none is near", () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const ori = [{ x: 50, y: 100, dip: 20 }, { x: 5000, y: 0, dip: 70 }, { x: 150, y: 50, dip: 25 }, { x: 9000, y: 0, dip: 80 }];
  const r = orientationsNear(pts, ori, { radiusM: 500 });
  assert.deepEqual(r.orientations.map((o) => o.dip), [25, 20]);
  assert.equal(r.near, 2);
  const far = orientationsNear([{ x: 20000, y: 0 }], ori, { radiusM: 500, fallback: 1 });
  assert.deepEqual([far.near, far.orientations[0].dip], [0, 80]);
});

test("#3989 the fit card's numbers: per mapped unit and overall, scored like the #758 agreement, with the overlay", () => {
  const f = fitToMap(grid, ["Canol", "Tuttle Fm", "Tuttle Fm", "Canol"], layer, "unit", ["Canol", "Tuttle Fm"]);
  assert.equal(f.overall, 2 / 3);
  assert.deepEqual(f.units.map((u) => [u.unit, u.pct, u.modelledAs]), [["Canol", 0.5, "Tuttle Fm"], ["Tuttle Fm", 1, null]]);
  assert.deepEqual([f.differ, f.compared, f.unscored], [1, 3, []]);
  const g = fitToMap(grid, ["Canol", "Canol", "Canol", null], layer, "unit", ["Canol"]);
  assert.deepEqual([g.overall, g.unscored], [1, ["Tuttle Fm"]], "a mapped unit the model has not is listed, not scored");
  assert.equal(fitToMap(grid, [], layer, "other_field", ["Canol"]), null);
});

test("#3989 Add as block model / unit volumes: the same result again is replaced, an earlier one asked about", async () => {
  const lb = { title: "stack A over B", when: "7:13:47 PM" };
  const vms = [{ id: 1, name: "Model units: stack A over B (7:02:10 PM)" }, { id: 2, name: "Model units: stack A over B (7:13:47 PM)" }, { id: 3, name: "Model units: stack A over B over C (7:00:00 PM)" }, { id: 4, name: "Grade blocks" }];
  assert.deepEqual(sameModelBlocks(vms, lb), { same: [2], earlier: [1] });
  const asked = [];
  const ask = (v) => async (msg, choices) => { asked.push([msg, choices.map((c) => c.label)]); return v; };
  assert.deepEqual(await toReplace(sameModelBlocks(vms, lb), "blocks", ask("replace")), { drop: [2, 1], cancelled: false });
  assert.deepEqual(asked[0][1], ["Replace", "Keep both"]);
  assert.deepEqual(await toReplace(sameModelBlocks(vms, lb), "blocks", ask("keep")), { drop: [2], cancelled: false });
  assert.deepEqual(await toReplace(sameModelBlocks(vms, lb), "blocks", ask(null)), { drop: [], cancelled: true }, "Escape adds nothing");
  assert.deepEqual(await toReplace(sameModelBlocks(vms.slice(1), lb), "blocks", ask("x")), { drop: [2], cancelled: false });
  assert.equal(asked.length, 3, "no question when only the same result is there");
  const vol = (id, model, builtAt) => ({ id, type: "unit_volume", params: { model, builtAt } });
  const sv = sameModelVolumes([vol("a", lb.title, lb.when), vol("b", lb.title, "7:02:10 PM"), vol("c", lb.title, "7:02:10 PM"), vol("d", lb.title, "6:00:00 PM"), vol("e", "other", lb.when), { id: "f", type: "surface" }], lb);
  assert.deepEqual(sv, { same: ["a"], earlier: ["b", "c", "d"], runs: 2 });
  await toReplace(sv, "volumes", ask("keep"));
  assert.match(asked.at(-1)[0], /^Unit volumes of 2 earlier results/);
  assert.deepEqual(asked.at(-1)[1], ["Replace", "Keep all"]);
});

test("#3989 wiring: per-top orientations, the map's colours, the fit and its overlay, the replace before adding", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /if \(!breaks\.size\) return nearOf\(u, pts, orientations\);/);
  assert.match(m, /if \(own\.length\) return nearOf\(u, pts, own\);/);
  assert.match(m, /color: unitColour\(u\), type: "stratigraphic_contact"/);
  assert.match(m, /mapLayer: p\.layer, mapField: p\.field, onFit: p\.onFit, aboveColor: unitColour\(order\[0\]\)/);
  assert.match(m, /fitToMap\(mapGrid, mapUnits, stackOpts\.mapLayer, stackOpts\.mapField,/);
  assert.match(m, /visible: false, provenance: \{ tool: DIFFER_TOOL/);
  assert.match(m, /r\.provenance\?\.tool === PREDICTED_TOOL\)\.forEach\(\(r\) => removeRaster/); // a rerun's predicted map replaces the last
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(vm, /sm\.toReplace\(sm\.sameModelBlocks\(voxelModels, lb\), "blocks"\)/);
  assert.match(vm, /sm\.toReplace\(sm\.sameModelVolumes\(implicitSurfaces, lb\), "volumes"\)/);
  assert.match(vm, /addRaster, rasters, removeRaster, updateRaster,/);
  assert.doesNotMatch(vm, /import \{[^}]*\} from "\.\.\/lib\/viewer\/sameModelBlocks\.js"/, "loaded on use");
  const panel = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(panel, /onFit: setFit \/\* #3989 \*\//);
  assert.match(panel, /<MapFitCard fit=\{fit\} shown=\{showDiff\}/);
});

test("#3989 a unit's colour from the map layer (its category), not a palette of the model's own", () => {
  assert.equal(mapUnitColour(layer, "unit", "Canol"), "#aa3311");
  assert.equal(mapUnitColour(layer, "unit", "tuttle fm"), "#33aa55");
  assert.equal(mapUnitColour(layer, "other_field", "Canol"), null);
  assert.equal(mapUnitColour(layer, "unit", "Keno Hill"), null);
});
