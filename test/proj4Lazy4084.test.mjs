// TASKS.csv #4084 — proj4 (with wkt-parser and mgrs, ~131 kB) is out of the startup bundle: the definition tables and lookups are in lib/crsDefs.js (no proj4), the maths in lib/reproject.js (re-exports
// crsDefs, so its 80-odd importers are unchanged), the startup code reaches the maths by lib/reprojectLazy.js (a dynamic import after the first paint), and vite puts proj4 in a chunk of its own
// that only the chunks importing reproject.js load.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../src/lib/reproject.js";
import * as D from "../src/lib/crsDefs.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4084 reproject.js still exports every name it had (its own maths and, re-exported, the definitions)", () => {
  const was = ["converter", "GDA94_TAG", "GDA2020_TAG", "gda94To2020LonLat", "NAD83_CSRS_UTM", "REGISTRY", "datumNote", "epsgRegistryLoaded", "loadEpsgRegistry", "installEpsgRegistry", "onEpsgRegistry", "registryInfo", "crsAreaOf", "registryCodes",
    "getProj4DefSync", "isGeographicCrs", "isMetricProjectedEpsg", "getProj4Def", "reprojectXY", "toLonLat", "listSupportedCrs", "crsName", "pointTransform", "turnGridBearing", "bearingTurn"];
  for (const n of was) assert.ok(n in R, `${n} is exported by reproject.js`);
  for (const n of ["getProj4DefSync", "isMetricProjectedEpsg", "crsName", "listSupportedCrs", "loadEpsgRegistry", "getProj4Def", "REGISTRY", "datumNote"]) assert.ok(n in D && D[n] === R[n], `${n} is crsDefs.js's, re-exported`);
  for (const n of ["converter", "reprojectXY", "toLonLat", "pointTransform", "turnGridBearing", "gda94To2020LonLat"]) assert.ok(!(n in D), `${n} (the maths) is not in crsDefs.js`);
});

test("#4084 the maths still give the same answers", () => {
  const ll = R.reprojectXY(500000, 6200000, 3156, 4326); // the central meridian of zone 9N: lon -129
  assert.ok(Math.abs(ll.x - -129) < 1e-4 && Math.abs(ll.y - 55.94538) < 1e-4, `${ll.x} ${ll.y}`);
  const back = R.reprojectXY(ll.x, ll.y, 4326, 3156);
  assert.ok(Math.abs(back.x - 500000) < 1e-3 && Math.abs(back.y - 6200000) < 1e-3);
  assert.equal(R.reprojectXY(1, 2, 3156, 99999999), null);
  const T = R.pointTransform(3156, 4326); assert.ok(Math.abs(T(500000, 6200000)[0] - -129) < 1e-4);
  assert.equal(Math.round(R.turnGridBearing(R.pointTransform(3156, 3156), 500000, 6200000, 45) * 1000) / 1000, 45);
});

test("#4084 crsDefs.js has no proj4; reproject.js has it and nothing eager imports reproject.js", () => {
  assert.doesNotMatch(read("src/lib/crsDefs.js"), /from "proj4"|import\(.proj4/);
  assert.match(read("src/lib/reproject.js"), /import proj4 from "proj4";/);
  assert.match(read("src/lib/reproject.js"), /export \* from "\.\/crsDefs\.js";/);
  for (const f of ["src/App.jsx", "src/modules/ViewerModule.jsx", "src/main.jsx", "src/lib/store.jsx"]) assert.doesNotMatch(read(f), /from "(\.\.?\/)+(lib\/)?reproject\.js"/, `${f} does not import reproject.js statically`);
  assert.match(read("src/App.jsx"), /from "\.\/lib\/crsDefs\.js"/);
  assert.match(read("src/App.jsx"), /reprojectModule\(\)\?\.reprojectXY\(cursor\.x, cursor\.y, project\.epsg, 4326\)/, "the cursor readout asks the module if it is here");
  assert.match(read("src/App.jsx"), /useReprojectReady\(\);/, "the status bar re-renders when it arrives");
});

test("#4084 reprojectLazy: the load starts at the first use, is shared, and the module is handed out only when it is here", async () => {
  const L = read("src/lib/reprojectLazy.js");
  assert.ok(L.includes('import("./reproject.js")') && L.includes("export function loadReproject()") && L.includes("export const reprojectModule = () => mod;") && L.includes("export function useReprojectReady()"));
  assert.ok(L.includes("if (!loading) loading ="), "one shared load");
  const lazy = await import("../src/lib/reprojectLazy.js");
  assert.equal(lazy.reprojectModule(), null, "nothing loaded yet: null, never a load started by asking");
  const m = await lazy.loadReproject();
  assert.equal(lazy.reprojectModule(), m);
  assert.equal(await lazy.loadReproject(), m, "the same module");
  const ll = await lazy.toLonLat(500000, 6200000, 3156);
  assert.ok(Math.abs(ll.lon - -129) < 1e-4);
});

test("#4084 vite gives proj4, wkt-parser and mgrs a chunk of their own (not the catch-all vendor chunk the entry imports)", () => {
  const v = read("vite.config.js");
  assert.match(v, /if \(\/node_modules\[\\\/\]\(proj4\|wkt-parser\|mgrs\)\[\\\/\]\/\.test\(id\)\) return "vendor-proj4";/);
  assert.ok(v.indexOf('"vendor-proj4"') < v.indexOf('return "vendor";'), "before the catch-all");
});
