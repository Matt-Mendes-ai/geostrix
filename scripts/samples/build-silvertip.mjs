// TASKS.csv #1346 — builds sample_data/silvertip/ from the public assessment report ARIS 42807 (Silvertip property, 2024
// drilling and surface sampling; the property and operator are named in the report's lab certificates). The acQuire tables are
// copied into tidy CSVs whose column names GeoStrix's importer matches exactly, so "Sample: Silvertip" imports them without
// questions. Nothing is invented: every value comes from the report's files (README.md maps them one by one).
//
//   node scripts/samples/build-silvertip.mjs "<path to 42807Z>"

// TASKS.csv #3100 — the conversion itself is electron/sampleSources.js convertSilvertip, which the app runs on a downloaded copy too
// (the installer no longer ships this sample: BC's terms), so the two cannot drift apart.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { convertSilvertip } = createRequire(import.meta.url)("../../electron/sampleSources.js");
const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-silvertip.mjs <path to the 42807Z folder>"); process.exit(1); }
const out = path.resolve("sample_data/silvertip");
mkdirSync(out, { recursive: true });
convertSilvertip((rel) => readFileSync(path.join(src, rel), "utf8"), (name, data) => writeFileSync(path.join(out, name), data), console.log);
