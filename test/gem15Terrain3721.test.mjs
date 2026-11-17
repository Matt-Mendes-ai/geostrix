// TASKS.csv #3721 — Google's GEM-15 as an online terrain source: the cell / group ids, finding cells from the STAC (offline, with the catalogue served from a stub),
// the credit, the allow-list and the source choice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// the main-process bridge, served from a stub: the group catalogue lists two cells, the items say where their COGs are
const served = [];
const items = {
  wm131s63: { properties: { "proj:epsg": 32609 }, assets: { dtm: { href: "https://storage.googleapis.com/climate-and-sustainability/gem-15/p60_m140/wm131s63/dtm/zall/mosaic.tif", "proj:epsg": 32609 }, dsm: { href: "https://storage.googleapis.com/climate-and-sustainability/gem-15/p60_m140/wm131s63/dsm/zall/mosaic.tif", "proj:epsg": 32609 } } },
  wm131s62: { properties: {}, assets: {} }, // an item with no assets: skipped
};
globalThis.window = {
  desktop: {
    remoteSensingFetch: async ({ url }) => {
      served.push(url);
      const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
      const m = /\/stac\/gem-15\/([^/]+)\/(catalog|([^/]+)\/\3)\.json$/.exec(url);
      if (m && m[2] === "catalog" && m[1] === "p60_m140") return { ok: true, status: 200, data: enc({ links: [{ rel: "item", title: "wm131s63" }, { rel: "item", title: "wm131s62" }, { rel: "parent" }] }) };
      if (m && m[3] && items[m[3]]) return { ok: true, status: 200, data: enc(items[m[3]]) };
      return { ok: false, status: 404, data: new Uint8Array() };
    },
  },
};
const G = await import("../src/lib/gem15Dem.js");

test("ids: the group is the 10-degree block, the cell names its south-west corner", () => {
  assert.equal(G.gemGroupId(63.1, -130.3), "p60_m140");
  assert.equal(G.gemCellId(63.1, -130.3), "wm131s63");
  assert.equal(G.gemCellId(60, -121), "wm121s60");
  assert.equal(G.gemCellId(-0.5, 10.2), "w10sm1");
  assert.equal(G.gemCellId(0.2, 10.2), "w10s0");
  assert.equal(G.gemGroupId(-0.5, 10.2), "m10_p10");
  assert.equal(G.gemGroupId(-5, -50.5), "m10_m60");
  const c = G.gemCellsFor(-130.31, 63.1, -129.9, 63.4);
  assert.deepEqual(c.map((x) => x.id), ["wm131s63", "wm130s63"]);
});

test("cells in a box come from the STAC: a cell the group lists and whose item has COGs; the rest are no data", async () => {
  const r = await G.gemCellsInBox({ lonMin: -130.9, latMin: 62.1, lonMax: -130.2, latMax: 63.9 });
  const ids = r.cells.map((c) => c.id);
  assert.ok(ids.includes("wm131s63"), ids.join());
  assert.ok(!ids.includes("wm131s62"), "an item with no assets is skipped");
  assert.equal(r.asked, 2, "the two cells the box touches (lat 62, 63) were asked about");
  const c = r.cells.find((x) => x.id === "wm131s63");
  assert.equal(c.epsg, 32609);
  assert.match(c.hrefs.dtm, /\/p60_m140\/wm131s63\/dtm\/zall\/mosaic\.tif$/);
  assert.match(c.hrefs.dsm, /\/dsm\/zall\/mosaic\.tif$/);
  // the group catalogue and the items are kept for the session
  const before = served.length;
  await G.gemCellsInBox({ lonMin: -130.9, latMin: 62.1, lonMax: -130.2, latMax: 63.9 });
  assert.equal(served.length, before, "no second request");
});

test("a box with no listed cell is told plainly", async () => {
  await assert.rejects(G.fetchGemTerrain({ lonMin: 100, latMin: 55, lonMax: 100.1, latMax: 55.1, targetEpsg: 32647, gridMax: 50 }), /GEM-15 has no data in this area/);
});

test("the credit line: GEM-15's CC-BY wording, with Copernicus' when GLO-30 filled gaps", async () => {
  const { terrainCredit, projectCredits } = await import("../src/lib/credits.js");
  const plain = terrainCredit({ source: { service: "Google GEM-15 (15 m bare-earth terrain model)" } });
  assert.match(plain, /Google GEM-15 \(CC BY 4\.0\)\. This dataset is produced by Google\./);
  assert.doesNotMatch(plain, /Copernicus/);
  const filled = terrainCredit({ source: { service: "Google GEM-15 (15 m bare-earth terrain model)", gapFilledNodes: 12 } });
  assert.match(filled, /produced by Google/);
  assert.match(filled, /Copernicus DEM GLO-30/);
  assert.match(projectCredits({ source: { service: "Google GEM-15 (15 m surface model)" } }, [], ""), /produced by Google/);
});

test("wiring: the allow-list is path-limited to the bucket, the source is a choice, the gaps are said", () => {
  const m = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(m, /const RS_PATH_LIMITS = \{ "storage\.googleapis\.com": "\/climate-and-sustainability\/gem-15\/" \};/);
  assert.match(m, /!RS_HOSTS\.has\(u\.hostname\) \|\| !rsPathOk\(u\)/);
  assert.match(m, /RS_HOSTS\.has\(h\.hostname\) && rsPathOk\(h\)/, "every redirect hop too");
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /<option value="gem15">\{tr\("Google GEM-15 \(15 m, bare earth\)"\)\}<\/option>/);
  assert.match(g, /<option value="gem15dsm">/);
  assert.match(g, /\(await import\("\.\.\/lib\/gem15Dem\.js"\)\)\.fetchGemTerrain/);
  assert.match(g, /parsed\.source\?\.gapNodes > 0/);
  assert.match(readFileSync(new URL("../src/lib/srtmFetch.js", import.meta.url), "utf8"), /gem15: 15, gem15dsm: 15/);
  assert.match(readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8"), /useState\(\(\) => savedTerrainSource\(localStorage\)\)/, "GEM-15 is a choice, not the default (#3882: Copernicus GLO-30 is, test/terrainDefault3882.test.mjs)");
});
