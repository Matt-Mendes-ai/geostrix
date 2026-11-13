// TASKS.csv #3134 — the four BC ARIS samples (Harry, Woodjam, Perk-Rocky, Silvertip) are no longer in the repository: BC's terms do not let
// GeoStrix redistribute assessment-report data (#3100). A test that checks one of them on its real data finds the folder here, in order:
//   1. sample_data/<name> in this checkout (an older checkout, or one a scripts/samples/build-*.mjs run rebuilt locally; gitignored);
//   2. $GEOSTRIX_BC_SAMPLES/<name>: a folder holding them, e.g. GeoStrix's <userData>/sample_data after the app downloaded them
//      (%APPDATA%/GeoStrix/sample_data on Windows).
// Without it the test is skipped, and the skip says why and how to run it: never a silent pass. The logic each such test covers also has a
// synthetic case that always runs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_SAMPLES = fileURLToPath(new URL("../../sample_data/", import.meta.url));
// a file each sample's folder has (perk_rocky keeps its Copernicus terrain in the repository, so its probe is a mapping layer)
const PROBE = { harry_property: "collars.csv", woodjam: "collars.csv", silvertip: "collars.csv", perk_rocky: "PR-Litho_interpV3.TAB" };

export function bcSampleDir(name) {
  const probe = PROBE[name];
  if (!probe) throw new Error(`not a BC sample: ${name}`);
  const roots = [REPO_SAMPLES, process.env.GEOSTRIX_BC_SAMPLES].filter(Boolean);
  for (const r of roots) { const d = path.join(r, name); if (fs.existsSync(path.join(d, probe))) return d + path.sep; }
  return null;
}
// for test(name, { skip }, fn): false when the folder is found, else the reason
export const bcSkip = (name) => (bcSampleDir(name) ? false : `${name} is not in this checkout (BC's terms; TASKS.csv #3134). Set GEOSTRIX_BC_SAMPLES to a folder holding it to run this real-data check: ${name === "woodjam" ? "the app does not download Woodjam, so a copy from an older checkout, or one built by scripts/samples/build-woodjam.mjs from its ARIS package" : "GeoStrix's <userData>/sample_data after the app downloaded the sample"}.`);
export const bcPath = (name, f) => path.join(bcSampleDir(name), f);
export const bcText = (name, f) => fs.readFileSync(bcPath(name, f), "utf8");
export const bcBytes = (name, f) => fs.readFileSync(bcPath(name, f));
// Perk-Rocky: the mapping layers from its folder, the terrain from the repository when the folder has none (a download holds only the layers)
export function perkFile(n) {
  const d = bcSampleDir("perk_rocky");
  const own = d && path.join(d, n);
  return fs.readFileSync(own && fs.existsSync(own) ? own : path.join(REPO_SAMPLES, "perk_rocky", n));
}
