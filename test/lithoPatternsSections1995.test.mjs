// TASKS.csv #1995 (remainder) — the FGDC lithology patterns on sections, fences, and the Layout legend of a section or a strip log.
// The 3D View's own legend keeps plain colours on purpose: the 3D View draws none.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withSectionPatterns, patternDefs, patternSwatchUrl, sectionTilePx, PATTERN_TILE_PX, sanitizeTile } from "../src/lib/lithoPatterns.js";
import { groupSectionLegend } from "../src/lib/sectionLegend.js";
import { fenceFurniture } from "../src/lib/figureFurniture.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const tile = sanitizeTile(read("public/patterns/fgdc/627.svg"));

test("a section payload: litho intervals and their legend rows get the code's pattern, nothing else does", () => {
  const payload = {
    intervals: [
      { hole_id: "A", from: 0, to: 10, color: "#3366cc", label: "Lithology: Limestone", layer: "litho", code: "LMST" },
      { hole_id: "A", from: 10, to: 20, color: "#aa8844", label: "Lithology: Overburden", layer: "litho", code: "OB" },
      { hole_id: "A", from: 0, to: 20, color: "#cc3333", label: "Alteration: Sericite", layer: "alt", code: "SER" },
    ],
    legendItems: [["Alteration: Sericite", "#cc3333"], ["Lithology: Limestone", "#3366cc"], ["Lithology: Overburden", "#aa8844"]],
  };
  const out = withSectionPatterns(payload, { LMST: 627, OB: null, SER: 627 });
  assert.equal(out.intervals[0].pat, 627);
  assert.equal(out.intervals[1].pat, undefined);
  assert.equal(out.intervals[2].pat, undefined, "alteration codes are not lithology");
  assert.deepEqual(out.legendItems, [["Alteration: Sericite", "#cc3333"], ["Lithology: Limestone", "#3366cc", null, 627], ["Lithology: Overburden", "#aa8844"]]);
  assert.equal(withSectionPatterns(payload, { OB: null }), payload, "no pattern: the payload is unchanged");
  // grouped for Layout: the pattern rides in the row's options, and grouping twice changes nothing
  const g = groupSectionLegend(out.legendItems);
  assert.deepEqual(g.find((r) => r[0] === "Limestone"), ["Limestone", "#3366cc", { pattern: 627 }]);
  assert.deepEqual(g.find((r) => r[0] === "Overburden"), ["Overburden", "#aa8844"]);
  assert.deepEqual(groupSectionLegend(g), g);
});

test("small tiles keep the 40 px tile's line widths; the swatch is one whole tile over the colour", () => {
  const w = (defs) => Math.max(...[...defs.matchAll(/stroke-width:([\d.]+)/g)].map((m) => Number(m[1])));
  const big = patternDefs({ 627: tile }), small = patternDefs({ 627: tile }, 20, "s");
  assert.ok(Math.abs(w(small) / w(big) - 2) < 1e-6, "half the tile, twice the stroke in tile units: the same px on screen");
  assert.ok(small.includes('id="s-627"') && small.includes('id="s-627-w"') && small.includes('width="20"'));
  assert.equal(sectionTilePx(5), 15); assert.equal(sectionTilePx(2), 12); assert.equal(sectionTilePx(20), PATTERN_TILE_PX);
  const url = patternSwatchUrl(tile, 627, "#1a2a5a", 14);
  const svg = decodeURIComponent(url.replace("data:image/svg+xml,", ""));
  assert.ok(svg.includes('fill="#1a2a5a"') && svg.includes("url(#s-627-w)"), "white lines on a dark colour");
  assert.ok(svg.includes(`width="${PATTERN_TILE_PX}"`), "a window of the 40 px tile, not a whole tile squeezed into the swatch");
  assert.equal(patternSwatchUrl(null, 627, "#fff"), null);
});

test("the fence's figure key carries the pattern; the export draws it over the swatch", () => {
  const f = fenceFurniture({ holeIds: ["A"], azimuth: 90, fitted: true, ve: 1, offsetLimit: 100, bands: false, codes: ["LMST", "OB"], colorOf: () => "#3366cc", patternOf: (c) => (c === "LMST" ? "url(#fgdc-627)" : null), date: "2026-11-07" });
  assert.deepEqual(f.keys[0].items, [{ label: "LMST", color: "#3366cc", pattern: "url(#fgdc-627)" }, { label: "OB", color: "#3366cc" }]);
  assert.ok(read("src/lib/figureFurniture.js").includes("...(it.pattern ? { overlay: it.pattern } : {})"));
  assert.ok(read("src/lib/svgExport.js").includes('o.setAttribute("fill", it.overlay)'));
});

test("wired: the section window, the fence, the strip log's Layout legend, Layout's swatch, and the payload in ViewerModule", () => {
  const vm = read("src/modules/ViewerModule.jsx");
  assert.ok(vm.includes("openSectionWindow(withSectionPatterns(payload, lithoPatternMap(layers.litho,"));
  assert.ok(vm.includes("layer: key, code: row.value });"));
  assert.ok(vm.includes("labelFor={effectiveLabel} patternOverride={legendOverride.litho}"));
  const sw = read("src/components/SectionWindow.jsx");
  assert.ok(sw.includes('localStorage.getItem("geostrix.sectionPatterns") === "1"'), "off by default in sections");
  assert.ok(sw.includes("patternDefs(patterns, sectionTilePx(holeWidth), patId)") && sw.includes("patternFill(row.pat, row.color, patId)"));
  assert.ok(sw.includes("it.length > 3 && !(patternsOn && patternTiles[it[3]]) ? [it[0], it[1]] : it"), "no pattern in the legend unless drawn");
  assert.ok(sw.includes("!hiddenGroups.some((g) => String(label).startsWith(g))"), "a hidden ribbon's group leaves the legend");
  const fd = read("src/components/FenceDiagramModal.jsx");
  assert.ok(fd.includes('localStorage.getItem("geostrix.fencePatterns") !== "0"') && fd.includes("patternDefs(tiles, sectionTilePx(colWidth))") && fd.includes("<path d={quad} fill={pat}"));
  assert.ok(read("src/components/StripLog.jsx").includes("t.colorFn(v), null, patternOf(v)]"));
  assert.ok(read("src/modules/LayoutModule.jsx").includes("<PatternSwatch code={opt.pattern} color={color}"));
});
