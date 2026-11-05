// TASKS.csv #1600 — numeric map-layer fields coloured in graduated classes, not one random colour per value
import { test } from "node:test";
import assert from "node:assert/strict";
import { isNumericField, suggestedBreaks, parseBreaks, graduatedClassKey, graduatedCategories, graduatedStyle } from "../src/lib/mapGraduated.js";
import { layerCategoryValue, drawMapLayer, mapStyleSignature } from "../src/lib/mapLayers.js";
import { buildLayer } from "../src/lib/mapLayerBuild.js";

const feats = Array.from({ length: 300 }, (_, i) => ({ parts: [[[i, i]]], attributes: { au_ppm: i < 290 ? (i % 40) / 1000 : 1 + i / 10, lith: ["QFP", "AND", "VOLC"][i % 3], code: (i % 3) + 1 } }));

test("numeric vs categorical fields", () => {
  assert.equal(isNumericField(feats, "au_ppm"), true);
  assert.equal(isNumericField(feats, "lith"), false);
  assert.equal(isNumericField(feats, "code"), false, "a coded unit (1/2/3) stays categorical");
  assert.equal(isNumericField([{ attributes: { v: "<0.005" } }, ...feats.map((f) => ({ attributes: { v: f.attributes.au_ppm } }))], "v"), true, "a below-detection '<' value still reads as a number");
});

test("breaks: percentiles to 2 significant figures, sorted, unique; typed ones parsed", () => {
  const b = suggestedBreaks(feats, "au_ppm");
  assert.deepEqual(b, [...b].sort((x, y) => x - y));
  assert.ok(b.length >= 3 && b.every((x) => +x.toPrecision(2) === x), JSON.stringify(b));
  assert.deepEqual(parseBreaks("5, 0.1; 0.5 1 / 1 x"), [0.1, 0.5, 1, 5]);
});

test("classes: lowest below the first break, top at or above the last; sorted legend labels and counts", () => {
  const br = [0.1, 0.5, 1, 5];
  assert.equal(graduatedClassKey(0.05, br), "g0"); assert.equal(graduatedClassKey(0.1, br), "g1"); assert.equal(graduatedClassKey(5.68, br), "g4"); assert.equal(graduatedClassKey("", br), null);
  const cats = graduatedCategories(feats, "au_ppm", br);
  assert.deepEqual(cats.map((c) => c.label), ["< 0.1", "0.1 – 0.5", "0.5 – 1", "1 – 5", "≥ 5"]);
  assert.equal(cats.reduce((n, c) => n + c.count, 0), 300);
  assert.equal(new Set(cats.map((c) => c.color)).size, 5);
});

test("drawing and 3D use the class; the signature changes with the breaks", () => {
  const style = graduatedStyle(feats, "au_ppm");
  const layer = { geomType: "point", features: feats, styleField: "au_ppm", ...style };
  assert.equal(layerCategoryValue(layer, feats[299]), `g${style.styleBreaks.length}`);
  assert.equal(layerCategoryValue({ ...layer, styleBreaks: null }, feats[0]), "0");
  const fills = []; const ctx = new Proxy({}, { get: (t, k) => (k === "fillStyle" ? undefined : () => {}), set: (t, k, v) => { if (k === "fillStyle") fills.push(v); return true; } });
  drawMapLayer(ctx, layer, [0, 0, 300, 300], 100, 100);
  assert.ok(fills.includes(style.categories[style.categories.length - 1].color), "top class colour drawn");
  assert.notEqual(mapStyleSignature(layer), mapStyleSignature({ ...layer, styleBreaks: [0.2] }));
});

test("import: a numeric style field opens graduated; a text one keeps categories", () => {
  const num = buildLayer({ name: "r", geomType: "point", features: feats.map((f) => ({ ...f, attributes: { au_ppm: f.attributes.au_ppm } })) }, { sourceName: "r" });
  assert.ok(num.styleBreaks?.length > 0); assert.ok(num.categories.length <= 7);
  const txt = buildLayer({ name: "r", geomType: "point", features: feats }, { sourceName: "r" });
  assert.equal(txt.styleField, "lith"); assert.equal(txt.styleBreaks, undefined);
});

test("3D legend: a graduated layer drops empty classes and, cut short, keeps its highest", async () => {
  const { mapLayerLegendGroups, allocateLegendRows } = await import("../src/lib/legendGroups.js");
  const br = [0.1, 0.5, 1, 5];
  const layer = { id: "r", name: "rocks", geomType: "point", features: feats, styleField: "au_ppm", styleBreaks: br, categories: graduatedCategories(feats, "au_ppm", br) };
  const [g] = mapLayerLegendGroups([layer]);
  assert.equal(g.grade, true);
  assert.ok(g.items.every(([label]) => layer.categories.find((c) => c.label === label).count > 0));
  const { rows } = allocateLegendRows([g], 1);
  assert.equal(rows[0].label, g.items[g.items.length - 1][0], "the top class survives a one-row budget");
});
