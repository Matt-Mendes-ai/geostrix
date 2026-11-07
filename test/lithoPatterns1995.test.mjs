// TASKS.csv #1995 — FGDC lithology patterns on strip logs: which pattern a code gets, the shipped tiles, the SVG they make
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { patternForUnit, lithoPatternMap, sanitizeTile, loadPatternTiles, patternDefs, patternFill, FGDC_PATTERNS } from "../src/lib/lithoPatterns.js";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

test("codes, names and descriptions from the bundled samples get the pattern a geologist would draw", () => {
  const cases = [
    ["LMST", "", "", 627], ["SNDST", "", "", 607], ["SLST", "", "", 616], ["MSULF", "", "", 733], ["VEIN", "", "White massive quartz vein", 732],
    ["DLST", "", "Extensive calcite veining/nearly stockwork/breccia", 642], // the code wins over a description that mentions breccia
    ["DACT", "", "", 720], ["FINT", "", "", 719], ["VCL", "", "", 711], ["ANDS", "", "", 717], ["BSL", "", "", 717],
    ["S7", "S7 — Argillite (graphitic)", "", 624], ["I6", "I6 — Meta-gabbro/diabase dyke", "", 721], ["S4", "S4 — Meta-greywacke", "", 654],
    ["VANSS", "", "Fg And V-clast, mod perv propy alt", 711], ["VANAB", "", "polymictic and. breccia wt/ varying degrees of alt", 715],
    ["IMMOQ", "", "mg qtz monz wt perv hem alt", 719], ["IPDA", "", "Fg Hbl-Plag Phyric Dacite", 729],
  ];
  for (const [c, n, d, want] of cases) assert.equal(patternForUnit(c, n, d), want, `${c} ${n} ${d}`);
  for (const [c, n, d] of [["OB", "", ""], ["OBN", "OBN — Overburden", ""], ["NRCV", "", "No recovery."], ["FAULT", "", ""], ["UTG", "", "clayey and chl-ser alt. flt gouge"], ["CAS", "", ""], ["SED", "", ""], ["XYZ", "", ""]]) {
    assert.equal(patternForUnit(c, n, d), null, `${c}: no pattern`);
  }
});

test("a code's most frequent description decides, and the user's choice wins", () => {
  const rows = [{ value: "A", description: "sandstone" }, { value: "A", description: "shale" }, { value: "A", description: "shale" }, { value: "B" }, { value: "C", description: "limestone" }];
  const m = lithoPatternMap(rows, (v) => v, { C: { pattern: "" }, B: { pattern: "705" } });
  assert.deepEqual(m, { A: 620, B: 705, C: null });
});

test("the tiles ship, hold only shapes, and every pattern the mapping can name is there; CC0 notice beside them", () => {
  const dir = new URL("../public/patterns/fgdc/", import.meta.url);
  const files = readdirSync(dir);
  for (const c of Object.keys(FGDC_PATTERNS)) assert.ok(files.includes(`${c}.svg`), `${c}.svg shipped`);
  for (const f of files.filter((x) => x.endsWith(".svg"))) {
    const s = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(s, /script|href|on[a-z]+=|<image|<style|foreignObject/i, f);
    assert.ok(sanitizeTile(s)?.viewBox.length === 4, `${f}: a viewBox`);
    const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    assert.equal(sanitizeTile(s).inner, inner, `${f}: a shipped tile passes the sanitizer unchanged (x1 / y1 kept)`);
  }
  assert.match(readFileSync(new URL("LICENSE.txt", dir), "utf8"), /CC0/);
});

test("the sanitizer keeps plain shapes only; tiles load once; the defs are patterns sized to the tile", async () => {
  const t = sanitizeTile('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 10 10"><script>alert(1)</script><g onload="x()"><line x1="0" y1="0" x2="1" y2="1" style="stroke:#000"/><image href="evil.png"/><path d="M0 0" fill="url(#x)"/></g></svg>');
  assert.deepEqual(t.viewBox, [0, -10, 10, 10]);
  assert.doesNotMatch(t.inner, /script|onload|image|href|url\(/);
  assert.match(t.inner, /<line x1="0" y1="0" x2="1" y2="1" style="stroke:#000"\/>/);
  let calls = 0;
  const fetcher = async (u) => { calls++; return /627/.test(u) ? '<svg viewBox="1.6 -55.725 54.125 54.125"><line x1="1" y1="1" x2="2" y2="2"/></svg>' : null; };
  const tiles = await loadPatternTiles([627, 627, 999, null], fetcher);
  assert.deepEqual(Object.keys(tiles), ["627"]);
  await loadPatternTiles([627], fetcher);
  assert.equal(calls, 2, "627 fetched once, 999 once");
  assert.match(patternDefs(tiles), /^<pattern id="fgdc-627" patternUnits="userSpaceOnUse" width="40" height="40" viewBox="1.6 -55.725 54.125 54.125">/);
});

test("the strip-log image draws the pattern over the litho colour; without patterns it is unchanged", () => {
  const args = { holeId: "H1", collars: [{ hole_id: "H1", length: 100 }], layers: { litho: [{ hole_id: "H1", from: 0, to: 60, value: "LMST" }, { hole_id: "H1", from: 60, to: 100, value: "OB" }] } };
  const plain = buildStripLogSvgMarkup(args).svg;
  assert.doesNotMatch(plain, /fgdc|<defs>/);
  const tiles = { 627: { viewBox: [0, 0, 10, 10], inner: "<line/>" } };
  const withP = buildStripLogSvgMarkup({ ...args, lithoPatterns: { byCode: { LMST: 627, OB: null }, tiles } }).svg;
  assert.match(withP, /<defs><pattern id="fgdc-627"/);
  assert.equal((withP.match(/fill="url\(#fgdc-627(-w)?\)"/g) || []).length, 1, "on the limestone only");
});

test("white lines over a dark colour, black over a light one (black limestone lines vanished on a dark blue)", () => {
  assert.equal(patternFill(627, "#1f4e8c"), "url(#fgdc-627-w)");
  assert.equal(patternFill(607, "#f2e394"), "url(#fgdc-607)");
  assert.equal(patternFill(607, "rgb(1,2,3)"), "url(#fgdc-607)", "an unreadable colour keeps black");
  const defs = patternDefs({ 627: { viewBox: [0, 0, 10, 10], inner: '<line style="stroke:#000000"/>' } });
  assert.match(defs, /<pattern id="fgdc-627-w"[^>]*><line style="stroke:#ffffff"\/><\/pattern>/);
});

test("wired: the strip-log window, Atlas, and the 3D View's legend edits", () => {
  const s = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(s, /\{t\.key === "litho" && patternOf\(r\.value\) && <rect /);
  assert.match(s, /<defs dangerouslySetInnerHTML=\{\{ __html: patternDefs\(tiles\) \}\} \/>/);
  const a = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.match(a, /buildStripLogDataUrl\(\{ holeId, collars, layers, legendOverride, lithoPatterns,/);
  const g = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(g, /generateAtlasPages\(\{ mode, items: \[chosen\[i\]\], templateElements, collars, layers, includeStripLog, legendOverride, page, assayTracks, lithoPatterns \}\)/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("patternOverride={legendOverride.litho} onPatternChange={(v, p) => setLegendOverride((o) => ({ ...o, litho: { ...(o.litho || {}), [v]: { ...(o.litho?.[v] || {}), pattern: p } } }))}"));
});
