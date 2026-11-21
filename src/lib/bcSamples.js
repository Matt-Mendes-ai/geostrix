// TASKS.csv #3100 — what the download dialog says about each BC sample (the server side is electron/sampleSources.js: the same reports,
// URLs and sizes). Woodjam has no download (its ARIS package is 1.94 GB): where it is not bundled it is not offered at all.
import { t as tr } from "./i18n.js";

export const BC_SAMPLE_INFO = {
  harry: { name: "Harry", report: "37584", host: "cmscontent.nrs.gov.bc.ca", bytes: 77992695,
    note: () => tr("From the BC Geological Survey's assessment-report drillhole database (GeoFile 2025-11): the 37 holes' collars, lithology and assays. The interval layers and geophysics synthesized around those assays in GeoStrix's source code cannot be made here, so this download leaves them out.") },
  perk: { name: "Perk-Rocky", report: "42317", host: "apps.nrs.gov.bc.ca", bytes: 18055542,
    note: () => tr("The report's mapping layers are downloaded; the terrain (Copernicus DEM) is included in GeoStrix.") },
  silvertip: { name: "Silvertip", report: "42807", host: "apps.nrs.gov.bc.ca", bytes: 15244094, note: null },
};
