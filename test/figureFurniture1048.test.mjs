// TASKS.csv #1048 / #1068 — exported figures carry their caption and key
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapText, furnitureLayout, stereonetFurniture, stripLogFurniture, pngScaleFor } from "../src/lib/figureFurniture.js";
import { exportSvgMarkup } from "../src/lib/svgExport.js";

test("#1048 wrapText keeps lines within the width and keeps every word", () => {
  const lines = wrapText("Equal-area (Schmidt) net, lower hemisphere, poles to planes", 20);
  assert.ok(lines.every((l) => l.length <= 20), lines.join("|"));
  assert.equal(lines.join(" "), "Equal-area (Schmidt) net, lower hemisphere, poles to planes");
});

test("#1048 furnitureLayout: nothing to draw -> no band; keys wrap inside the width", () => {
  assert.equal(furnitureLayout({ caption: [], keys: [] }, 400).height, 0);
  const items = Array.from({ length: 12 }, (_, i) => ({ label: `CODE${i}`, color: "#123456" }));
  const L = furnitureLayout({ caption: ["one line"], keys: [{ title: "Lithology", items }] }, 300);
  assert.ok(L.height > 40);
  const sw = L.items.filter((i) => i.type === "swatch");
  assert.equal(sw.length, 12);
  assert.ok(sw.every((s) => s.x >= 0 && s.x + s.w <= 300));
  assert.ok(new Set(sw.map((s) => s.y)).size > 1, "12 labels should need more than one row at 300 wide");
});

test("#1068 the stereonet caption says which net, n, filters, Terzaghi and statistics; keys for types and Kamb", () => {
  const stats = { n: 729, nEff: 541.2, meanDip: 76.04, meanDipDir: 69.3, meanPlunge: 13.96, meanTrend: 249.3, k: 12.34, alpha95: 2.41, s1: 0.71, s2: 0.2, s3: 0.09, noPreferred: false,
    terzaghi: { applied: true, weighted: 700, unweighted: 29, cappedCount: 3, maxWeight: 10 } };
  const f = stereonetFurniture({ view: "stereonet", projection: "equalArea", plotted: 729, filtered: 1021, total: 1400, source: "downhole", typeFilter: "FRAC", domainName: "",
    stats, shape: "cluster", showMean: true, contour: { countingAngleDeg: 8.1, n: 729, maxSigma: 9.4 }, contourLevels: [2, 4, 6], contourColors: ["#a", "#b", "#c"], types: [{ label: "FRAC", color: "#f00" }], date: "2026-10-28" });
  const text = f.caption.join("\n");
  assert.match(text, /Equal-area \(Schmidt\) net, lower hemisphere/);
  assert.match(text, /n = 729 of 1,021 picks plotted \(1,400 in all\); 292 without a dip direction/);
  assert.match(text, /type: FRAC · domain: whole property/);
  assert.match(text, /Terzaghi-weighted: 700 of 729 .*effective n = 541\.2/);
  assert.match(text, /Mean plane 76\.0° \/ 69\.3°.*k = 12\.3, α95 = 2\.4°/);
  assert.match(text, /Kamb density contours.*peak 9\.4σ/);
  assert.deepEqual(f.keys.map((k) => k.title), ["Kamb σ"]); // one type: named in the caption, no type key
  assert.deepEqual(f.keys[0].items.map((i) => i.label), ["2–4", "4–6", "≥ 6"]);
  const raw = stereonetFurniture({ view: "stereonet", projection: "equalAngle", plotted: 5, filtered: 5, total: 5, source: "surface", typeFilter: "all", stats: { ...stats, terzaghi: null, noPreferred: true }, showMean: true, contour: null, types: [{ label: "A", color: "#1" }, { label: "B", color: "#2" }] });
  assert.match(raw.caption.join("\n"), /Equal-angle \(Wulff\)[\s\S]*Not Terzaghi-weighted[\s\S]*no preferred orientation/);
  assert.deepEqual(raw.keys.map((k) => k.title), ["Structure type"]);
});

test("#1048 the strip log title block names the hole, collar and attitude", () => {
  const f = stripLogFurniture({ holeId: "WJ23-01", collar: { x: 612345.6, y: 5789012.3, z: 1100, azimuth: 45, dip: -60, length: 402.5 }, maxDepth: 402.5, pxPerMeter: 6,
    tracks: [{ title: "Litho", items: [{ label: "AND", color: "#0a0" }] }], date: "2026-10-28" });
  assert.equal(f.placement, "top");
  assert.equal(f.title, "Strip log: WJ23-01");
  assert.match(f.caption[0], /Collar E 612345\.6, N 5789012\.3, RL 1100\.0 · azimuth 45\.0°, dip -60\.0°/);
  assert.match(f.caption[1], /^Depth 0-402\.5 m along the hole \(EOH 402\.5 m\) · 6 px per metre/);
});

test("#1048 the PNG scale stays under the canvas side limit", () => {
  assert.deepEqual(pngScaleFor(500, 3000), { scale: 2, reduced: false });
  const r = pngScaleFor(500, 20000); // 2x would be 40,000 px
  assert.ok(r.reduced && 20000 * r.scale <= 32000);
});

// @xmldom/xmldom arrives with electron-builder (plist), not as a dependency of its own: skipped if it is ever missing
const xmldom = await import("@xmldom/xmldom").catch(() => null);
test("#1048 exportSvgMarkup draws the furniture under (or above) the figure in the copy only", { skip: !xmldom && "no @xmldom/xmldom" }, () => {
  const { DOMParser, XMLSerializer } = xmldom;
  globalThis.XMLSerializer = XMLSerializer;
  const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><circle cx="1" cy="1" r="1"/></svg>', "image/svg+xml");
  const svg = doc.documentElement;
  const out = exportSvgMarkup(svg, { furniture: { title: "Strip log: DH1", caption: ["Collar E 1"], keys: [{ title: "Lithology", items: [{ label: "AND", color: "#0a0" }] }] } });
  assert.ok(out.height > 300);
  assert.match(out.markup, /Strip log: DH1/);
  assert.match(out.markup, new RegExp(`viewBox="0 0 400 ${out.height}"`));
  assert.ok(!new XMLSerializer().serializeToString(svg).includes("Strip log"), "the page's own svg is unchanged");
  const top = exportSvgMarkup(svg, { furniture: { placement: "top", title: "T", caption: [] } });
  assert.match(top.markup, new RegExp(`viewBox="0 -${top.height - 300} 400 ${top.height}"`));
  delete globalThis.XMLSerializer;
});
