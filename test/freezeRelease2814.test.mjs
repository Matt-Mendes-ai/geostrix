// TASKS.csv #2814 — the hidden 3D View (FreezeStore, #438) kept the store value of the moment it was hidden, so a big map layer removed in
// another tab stayed in memory until the view was shown again. The hold now takes the live value when it still has a big layer the project
// no longer has (one render of the hidden view); other writes still skip it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// heldBigLayerGone is exported from store.jsx (JSX): read it from the source with its two helpers
async function load() {
  const src = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function heldBigLayerGone"), src.indexOf("export function FreezeStore"));
  const lib = new URL("../src/lib/undoMapLayerCap.js", import.meta.url).href;
  return import("data:text/javascript," + encodeURIComponent(`import { vertexCount, BIG_VERTICES } from "${lib}";\n${fn}`));
}
const ring = (n) => Array.from({ length: n }, (_, i) => [i, i]);
const layer = (name, verts) => ({ id: name, name, features: [{ parts: [[ring(verts)]] }] });

test("#2814 a big held layer gone from the project releases the hold; small ones, restyled copies and additions do not", async () => {
  const { heldBigLayerGone } = await load();
  const big = layer("A", 100000), small = layer("s", 10), other = layer("B", 120000);
  assert.equal(heldBigLayerGone([big, small], [small]), true, "the big layer removed");
  assert.equal(heldBigLayerGone([big, small], [big]), false, "only the small one removed");
  assert.equal(heldBigLayerGone([big], [{ ...big, style: { fill: "#f00" } }]), false, "restyled: the same features");
  assert.equal(heldBigLayerGone([big], [big, other]), false, "a layer added");
  assert.equal(heldBigLayerGone([], [other]), false);
  const list = [big];
  assert.equal(heldBigLayerGone(list, list), false);
  assert.equal(heldBigLayerGone(undefined, []), false);
});

test("#2814 FreezeStore: the release only while frozen, on a changed value, after the transition check", () => {
  const src = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(src, /if \(hold\.frozen !== frozen\) setHold\(\{ frozen, value: live \}\);[\s\S]{0,700}else if \(frozen && hold\.value !== live && \(heldBigLayerGone\(hold\.value\?\.mapLayers, live\?\.mapLayers\) \|\| heldItemGone\(hold\.value\?\.rasters, live\?\.rasters\) \|\| heldItemGone\(hold\.value\?\.voxelModels, live\?\.voxelModels\)\)\) setHold\(\{ frozen, value: live \}\);/ /* #2873: rasters and models too */);
});

test("#2873 a raster or block model removed while hidden releases the hold; edits that keep the id do not", async () => {
  const { heldItemGone } = await load();
  const r1 = { id: "r1" }, r2 = { id: "r2" };
  assert.equal(heldItemGone([r1, r2], [r2]), true);
  assert.equal(heldItemGone([r1, r2], [{ ...r1, opacity: 0.5 }, r2]), false); // restyled, same id
  assert.equal(heldItemGone([r1], [r1, r2]), false); // added
  assert.equal(heldItemGone([], [r1]), false);
  assert.equal(heldItemGone(undefined, []), false);
});

test("#2783 the shell line names the restricting solid and the Model area; the estimate's tooltip its trend and grid", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{s\.params\.domain \? tr\(" · inside \\"\{solid\}\\"", \{ solid: s\.params\.domain \}\) : ""\}\{s\.params\.modelArea \? tr\(" · model area: \{area\}", \{ area: s\.params\.modelArea \}\) : ""\}/);
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /\$\{p\.searchTrend\?\.name \? `, trend "\$\{p\.searchTrend\.name\}"/);
  assert.match(g, /\$\{p\.gridFrom \? `, grid: \$\{p\.gridFrom\}` : ""\}/);
});
