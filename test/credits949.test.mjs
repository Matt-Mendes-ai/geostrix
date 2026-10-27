// TASKS.csv #949 — the credit lines fetched terrain and imagery licences ask for ({credits} in Layout text)
import test from "node:test";
import assert from "node:assert/strict";
import { terrainCredit, rasterCredit, projectCredits } from "../src/lib/credits.js";

test("#949: each fetched terrain gets its licence's credit; an imported one none", () => {
  assert.match(terrainCredit({ source: { service: "Copernicus DEM GLO-30 (ESA, surface model ~30 m)" } }), /© DLR e\.V\. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS/);
  assert.match(terrainCredit({ source: { service: "NRCan MRDEM-30 terrain (30 m, bare earth)" } }), /Open Government Licence – Canada/);
  assert.match(terrainCredit({ source: { service: "AWS Terrain Tiles (Terrarium): SRTM blended with national DEMs (CDEM in Canada)" } }), /SRTM/);
  assert.equal(terrainCredit({ name: "my lidar.tif" }), "");
  assert.equal(terrainCredit(null), "");
});

test("#949: fetched scenes credit their mission with the scene year; Sentinel-2 years are merged", () => {
  assert.equal(rasterCredit({ spectralIndex: { sensor: "sentinel2", scene: "S2B_10UFE_20230812_0_L2A", date: "2023-08-12" } }), "Contains modified Copernicus Sentinel data 2023.");
  assert.match(rasterCredit({ spectralIndex: { sensor: "aster_tir", scene: "AST_L1T_00308152003", date: "2003-08-15" } }), /NASA \/ METI/);
  assert.equal(rasterCredit({ spectralIndex: { sensor: "sentinel2" } }), "", "an index from the user's own file");
  assert.equal(rasterCredit({ name: "mag.tif" }), "");
  const all = projectCredits({ source: { service: "Copernicus DEM GLO-30" } }, [
    { spectralIndex: { sensor: "sentinel2", scene: "S2A_x", date: "2023-07-01" } },
    { spectralIndex: { sensor: "sentinel2", scene: "S2B_y", date: "2021-07-01" } },
    { spectralIndex: { sensor: "sentinel2", scene: "S2B_z", date: "2023-09-01" } },
    { name: "plain" },
  ]);
  assert.match(all, /^Copernicus DEM GLO-30: .* Contains modified Copernicus Sentinel data 2021, 2023\.$/);
  assert.equal(projectCredits(null, []), "");
});
