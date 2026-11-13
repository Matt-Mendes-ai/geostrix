// TASKS.csv #3134 (Matt, 2026-11-13: "remove the folders now, history later") — the four BC ARIS samples are not in the repository: BC's terms
// do not let GeoStrix redistribute assessment-report data (#3100). Perk-Rocky's Copernicus terrain stays (the installer ships it); the two
// synthetic geophysics files that sat in harry_property moved to sample_data/synthetic_geophysics, and the help sends users there.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SD = new URL("../sample_data/", import.meta.url);
const tracked = (p) => execFileSync("git", ["ls-files", p], { cwd: new URL("..", import.meta.url), encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

test("no file of Harry, Woodjam or Silvertip is tracked; of Perk-Rocky only its terrain and README", () => {
  for (const d of ["harry_property", "woodjam", "silvertip"]) assert.deepEqual(tracked(`sample_data/${d}`), [], d);
  assert.deepEqual(tracked("sample_data/perk_rocky").sort(), ["sample_data/perk_rocky/README.md", "sample_data/perk_rocky/terrain_copernicus_glo30.tif"]);
  const readme = fs.readFileSync(new URL("perk_rocky/README.md", SD), "utf8");
  assert.match(readme, /downloads\s+report\s+42317's\s+data\s+package\s+from\s+the\s+Province's\s+public\s+server/);
  assert.match(readme, /Copernicus DEM GLO-30/);
});

test("a copy rebuilt or copied into the repository stays local (gitignored); the terrain does not", () => {
  const ignored = (p) => { try { execFileSync("git", ["check-ignore", "-q", p], { cwd: new URL("..", import.meta.url) }); return true; } catch { return false; } };
  for (const p of ["sample_data/harry_property/collars.csv", "sample_data/woodjam/assays.csv", "sample_data/silvertip/litho.csv", "sample_data/perk_rocky/PR-Litho_interpV3.TAB"]) assert.ok(ignored(p), p);
  for (const p of ["sample_data/perk_rocky/terrain_copernicus_glo30.tif", "sample_data/perk_rocky/README.md", "sample_data/synthetic_geophysics/geophys_mag_survey.csv"]) assert.ok(!ignored(p), p);
});

test("the synthetic geophysics files are shareable, say they are simulated, and the help points at them", () => {
  for (const f of ["geophys_mag_survey.csv", "geophys_resistivity.tif", "README.md"]) assert.ok(fs.existsSync(new URL(`synthetic_geophysics/${f}`, SD)), f);
  assert.match(fs.readFileSync(new URL("synthetic_geophysics/README.md", SD), "utf8"), /entirely\s+simulated/);
  assert.match(fs.readFileSync(new URL("synthetic_geophysics/geophys_mag_survey.csv", SD), "utf8").split(/\r?\n/)[0], /^x,y,z,value,label$/);
  const help = fs.readFileSync(new URL("../src/help/pages/geophysics.js", import.meta.url), "utf8");
  assert.equal((help.match(/geophys_mag_survey\.csv in the sample_data\/synthetic_geophysics folder/g) || []).length, 2);
  assert.doesNotMatch(help, /sample_data\/(harry_property|woodjam|silvertip|perk_rocky)/, "no step sends a user to a folder that is gone");
});

test("no test reads a BC sample folder except through test/helpers/bcSample.mjs (which skips, saying why, where it is absent)", () => {
  const dir = new URL("./", import.meta.url);
  const direct = /sample_data\/(harry_property|woodjam|silvertip)\/|sample_data\/perk_rocky\/(?!terrain_copernicus_glo30\.tif)|\.\.\/sample_data\/(harry_property|woodjam|silvertip|perk_rocky)\//;
  const own = new Set(["bcSamplesRemoved3134.test.mjs", "samplesNotBundled3100.test.mjs", "samplePerkRocky819.test.mjs"]); // the packaging check and the folder's own tests read the repository itself
  const bad = fs.readdirSync(dir).filter((f) => f.endsWith(".test.mjs") && !own.has(f)).filter((f) => direct.test(fs.readFileSync(new URL(f, dir), "utf8")));
  assert.deepEqual(bad, []);
});
