// TASKS.csv #2690 (Matt's decision 2026-11-12) — the international time scale's interval colours ship with the app (Macrostrat, CC BY 4.0,
// downloaded once on 2026-11-12), so Surface Geology's 'Time-scale colours' works offline; the source and licence are stated in the bundle's
// text file, Help > Third-party Licences and the installer notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIntervals, timeScaleColours } from "../src/lib/macrostratColours.js";
import { bundledData } from "../scripts/third-party-licenses.mjs";

const json = JSON.parse(readFileSync(new URL("../src/lib/timeScaleIntervals.json", import.meta.url), "utf8"));

test("the bundle: 170 intervals with a colour each, in Macrostrat's response shape, its licence and source stated", () => {
  assert.equal(json.success.license, "CC-BY 4.0");
  assert.equal(json.success.downloaded, "2026-11-12");
  assert.match(json.success.source, /^https:\/\/macrostrat\.org\/api\/v2\/defs\/intervals\?timescale=international%20intervals$/);
  const iv = parseIntervals(json);
  assert.equal(iv.length, 170);
  assert.ok(iv.every((i) => /^#[0-9A-F]{6}$/.test(i.color)));
  for (const k of ["Jurassic", "Late Jurassic", "Eocene", "Archean", "Holocene"]) assert.ok(iv.some((i) => i.name === k), k);
  const hit = timeScaleColours([{ value: "Late Jurassic sandstone" }, { value: "Granite" }], iv);
  assert.deepEqual(hit.map((h) => [h.value, h.interval]), [["Late Jurassic sandstone", "Late Jurassic"]]); // the longest name wins
});

test("the licence text, Help > Third-party Licences and the installer notice name it", () => {
  const txt = readFileSync(new URL("../src/lib/timeScaleIntervals.txt", import.meta.url), "utf8");
  assert.match(txt, /Creative Commons Attribution 4\.0 International \(CC BY 4\.0\)/);
  assert.match(txt, /Downloaded: 2026-11-12/);
  assert.match(txt, /Peters, S\.E\. et al\. Macrostrat/);
  const d = bundledData().find((x) => /time scale/i.test(x.name));
  assert.equal(d.license, "CC-BY-4.0");
  assert.match(d.text, /macrostrat\.org\/api\/v2\/meta/);
  const notice = readFileSync(new URL("../build/installer-notice.txt", import.meta.url), "utf8");
  assert.match(notice, /DATA INCLUDED\r?\n - FGDC lithology patterns[^\r\n]*CC0[^\r\n]*\r?\n - International time scale interval colours, from Macrostrat[^\r\n]*CC BY 4\.0/); // \r?\n: a CRLF checkout (Main, 2026-11-12)
});

test("'Time-scale colours' reads the bundle, not the network", () => {
  const c = readFileSync(new URL("../src/lib/macrostratColours.js", import.meta.url), "utf8");
  assert.match(c, /export async function bundledTimeScaleIntervals\(\) \{\s+const m = await import\("\.\/timeScaleIntervals\.json"\);/);
  const f = readFileSync(new URL("../src/lib/macrostratFetch.js", import.meta.url), "utf8");
  assert.doesNotMatch(f, /defs\/intervals/);
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /await bundledTimeScaleIntervals\(\)\);/);
});
