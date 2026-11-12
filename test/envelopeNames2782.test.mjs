// TASKS.csv #2782 (split from #2540 (3), review #2486 WA lithium) — the same body of a code was named 'Envelope: P' from Lithology,
// 'Alteration halo: Rock2 P (GEOL_Rock2_pct ≥ 20)' from a custom layer and 'Unit body: P' from Modelling codes, and repeats were told
// apart only by their run's time ('Unit body: P (22:16)'). Every route now names it 'Envelope: P', and repeats show the settings that
// differ between them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfaceOptionLabels } from "../src/lib/viewer/surfaceLabels.js";

const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");

test("one name whatever the route: lithology, a custom layer, Modelling codes", () => {
  assert.doesNotMatch(runs, /`Unit body: \$\{altValue\}`/);
  assert.match(runs, /const head = sourceKey === "vein" \? "Vein set envelope" : sourceKey === "alt" && !customSrc \? "Alteration halo" : "Envelope";/);
  assert.match(runs, /sourceLayer: customSrc \? customSrc\.name : isCode \? "Modelling codes" : SOURCE_NAME\[sourceKey\] \|\| sourceKey/);
});

test("repeats are told apart by the settings that differ, not the time", () => {
  const at = (h) => `2026-11-12T${String(h).padStart(2, "0")}:16:00`;
  const L = surfaceOptionLabels([
    { id: "a", name: "Envelope: P", params: { sourceLayer: "Lithology", searchRadiusM: 50, cellSizeM: 5, anisotropy: null, domain: null, interceptSet: null, generatedAt: at(9) } },
    { id: "b", name: "Envelope: P", params: { sourceLayer: "Rock2", searchRadiusM: 50, cellSizeM: 5, anisotropy: null, domain: null, interceptSet: null, generatedAt: at(10) } },
    { id: "c", name: "Envelope: P", params: { sourceLayer: "Rock2", searchRadiusM: 80, cellSizeM: 5, anisotropy: { trend: "Flat" }, domain: null, interceptSet: null, generatedAt: at(11) } },
  ]);
  assert.equal(L.get("a"), "Envelope: P (from Lithology, 50 m search, no trend)");
  assert.equal(L.get("b"), "Envelope: P (from Rock2, 50 m search, no trend)");
  assert.equal(L.get("c"), "Envelope: P (from Rock2, 80 m search, trend Flat)");
});

test("two of three runs share their settings: those two add their times (WA uranium, live)", () => {
  const p = { sourceLayer: "Lithology", searchRadiusM: 86.5, cellSizeM: 57.7, anisotropy: null, domain: null, interceptSet: null };
  const L = surfaceOptionLabels([
    { id: "a", name: "Envelope: SAN", params: { ...p, generatedAt: "2026-11-12T09:16:00" } },
    { id: "b", name: "Envelope: SAN", params: { ...p, generatedAt: "2026-11-12T09:18:00" } },
    { id: "c", name: "Envelope: SAN", params: { ...p, sourceLayer: "Modelling codes", searchRadiusM: 423.6, cellSizeM: "282.4 × 282.4 × 1.5", generatedAt: "2026-11-12T09:20:00" } },
  ]);
  assert.equal(L.get("a"), "Envelope: SAN (from Lithology, 86.5 m search, 57.7 m cells, 09:16)");
  assert.equal(L.get("b"), "Envelope: SAN (from Lithology, 86.5 m search, 57.7 m cells, 09:18)");
  assert.equal(L.get("c"), "Envelope: SAN (from Modelling codes, 423.6 m search, 282.4 × 282.4 × 1.5 m cells)");
});

test("the same settings twice: the time, as before (#1192); an older run without a setting saved is not compared on it", () => {
  const p = { sourceLayer: "Lithology", searchRadiusM: 50, cellSizeM: 5, anisotropy: null, domain: null, interceptSet: null };
  const L = surfaceOptionLabels([
    { id: "a", name: "Envelope: P", params: { ...p, generatedAt: "2026-11-12T09:16:00" } },
    { id: "b", name: "Envelope: P", params: { ...p, generatedAt: "2026-11-12T10:20:00" } },
  ]);
  assert.match(L.get("a"), /^Envelope: P \(09:16\)$/);
  assert.match(L.get("b"), /^Envelope: P \(10:20\)$/);
  const M = surfaceOptionLabels([
    { id: "a", name: "Top of X", params: { generatedAt: "2026-11-12T09:16:00" } },
    { id: "b", name: "Top of X", params: { searchRadiusM: 50, generatedAt: "2026-11-12T10:20:00" } },
  ]);
  assert.match(M.get("a"), /\(09:16\)$/, "the first run saved no search radius: the time");
});
