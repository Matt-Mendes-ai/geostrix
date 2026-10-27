// TASKS.csv #949 — the credit lines the licences of fetched terrain and imagery ask for, for Layout's {credits}
// placeholder. Derived from what each record already keeps (terrain.source.service, a raster's spectralIndex scene), so
// projects saved before this get them too. Imported files carry no source and need no credit from GeoStrix.
//   Copernicus DEM GLO-30: the wording ESA's licence requires.
//   NRCan MRDEM / HRDEM: the Open Government Licence – Canada attribution statement.
//   AWS Terrain Tiles: the sources Tilezen lists for the blend used here (SRTM, CDEM in Canada).
//   Sentinel-2: "Contains modified Copernicus Sentinel data <year>"; ASTER: the NASA/METI credit.
const COPERNICUS_DEM = "Copernicus DEM GLO-30: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.";
const NRCAN = "Elevation: contains information licensed under the Open Government Licence – Canada (Natural Resources Canada, MRDEM / HRDEM).";
const TERRARIUM = "Elevation: Terrain Tiles on AWS (Tilezen), from SRTM (NASA / USGS) and CDEM (Natural Resources Canada, Open Government Licence – Canada) among other sources.";
const ASTER = "ASTER data courtesy of NASA / METI / AIST / Japan Space Systems and the U.S. / Japan ASTER Science Team.";

export function terrainCredit(terrain) {
  const s = String(terrain?.source?.service || "");
  if (/copernicus/i.test(s)) return COPERNICUS_DEM;
  if (/nrcan|mrdem|hrdem/i.test(s)) return NRCAN;
  if (/terrarium|terrain tiles/i.test(s)) return TERRARIUM;
  return "";
}
export function rasterCredit(raster) {
  const si = raster?.spectralIndex;
  if (!si?.scene) return "";
  const id = String(si.scene), year = /^(\d{4})/.exec(String(si.date || ""))?.[1];
  if (si.sensor === "sentinel2" || /^S2[ABC]?_/i.test(id)) return year ? `Contains modified Copernicus Sentinel data ${year}.` : "Contains modified Copernicus Sentinel data.";
  if (si.sensor === "aster_tir" || /^AST/i.test(id)) return ASTER;
  return "";
}
// one line per distinct credit; Sentinel-2 years are merged ("2021, 2023")
export function projectCredits(terrain, rasters = []) {
  const out = [], s2 = new Set();
  const t = terrainCredit(terrain);
  if (t) out.push(t);
  for (const r of rasters || []) {
    const c = rasterCredit(r);
    const m = /^Contains modified Copernicus Sentinel data(?: (\d{4}))?\.$/.exec(c);
    if (m) s2.add(m[1] || "");
    else if (c && !out.includes(c)) out.push(c);
  }
  if (s2.size) { const ys = [...s2].filter(Boolean).sort(); out.push(ys.length ? `Contains modified Copernicus Sentinel data ${ys.join(", ")}.` : "Contains modified Copernicus Sentinel data."); }
  return out.join(" ");
}
