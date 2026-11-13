// TASKS.csv #3100 — writes the REAL tables of sample_data/harry_property (collars.csv, litho.csv, assay_wide.csv) from the BC Geological
// Survey's assessment-report drillhole database (GeoFile 2025-11, bcgs_ardh.gpkg), ARIS report 37584. The conversion is
// electron/sampleSources.js convertHarry, which the app also runs on a downloaded copy (the installer no longer ships this sample: BC's
// terms). The sample's other layers were synthesized around the real assays (its README says which) and are not written here.
// Needs Node 22.5+ (node:sqlite).
//
//   node scripts/samples/build-harry.mjs "<path to bcgs_ardh.gpkg>"
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { convertHarry } = createRequire(import.meta.url)("../../electron/sampleSources.js");
const gpkg = process.argv[2];
if (!gpkg || !existsSync(gpkg)) { console.error("usage: node scripts/samples/build-harry.mjs <path to bcgs_ardh.gpkg>"); process.exit(1); }
const out = path.resolve("sample_data/harry_property");
mkdirSync(out, { recursive: true });
console.log(convertHarry(gpkg, (name, data) => writeFileSync(path.join(out, name), data)).join(", "));
