// TASKS.csv #2008 — the FGDC lithology patterns that ship in public/patterns/fgdc are named in Help > Third-party licences.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bundledData } from "../scripts/third-party-licenses.mjs";

test("the bundled pattern tiles are listed with their CC0 text", () => {
  const d = bundledData();
  assert.ok(d.length >= 4); // #3107: and the samples added since, each checked by its own sample*3107 test; #2690: and the time scale's colours (timeScaleIntervals2690.test.mjs); #2829: and the Blake River sample (blakeRiver2829.test.mjs); #3106: and the WA uranium sample (waUranium3106.test.mjs)
  assert.ok(d.some((x) => x.license === "Copernicus DEM licence" && /Perk-Rocky sample terrain/.test(x.name))); // #3100 — the shipped terrain of a sample that is otherwise downloaded
  assert.match(d[0].name, /^FGDC lithology patterns/);
  assert.equal(d[0].license, "CC0-1.0 (public domain)");
  assert.match(d[0].text, /FGDC-STD-013-2006/);
  assert.match(d[0].text, /Creative\s+Commons CC0/);
  assert.match(fs.readFileSync("src/components/LicensesModal.jsx", "utf8"), /bundled\.map\(\(p\) => row\("data", p\)\)/);
});
