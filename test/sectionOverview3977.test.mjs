// TASKS.csv #3977 — the section window's overview pane: the plan model built with each section (traces, boundaries, the series and its step,
// the hillshade), its one SVG drawing (band, line, A / B, north arrow, scale bar), the drag's snap, the export inset, and the wiring (the drag
// goes through the ± steps' own message as an exact offset). Made-up holes and sections only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewPlan, overviewSeries, overviewSvg, overviewView, sectionInModel, snapOffset, shadeGrid, withOverviewInset, insetSize, niceMetres, sectionOverview, figureWidth } from "../src/lib/sectionOverview.js";
import { stepSection } from "../src/lib/sectionDigitise.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SEC = { ax: 500000, ay: 6000200, bx: 500800, by: 6000200, corridor: 12 }; // runs east: its normal points north
const grid = (n) => Array.from({ length: n }, (_, i) => { const x0 = 500000 + (i % 30) * 25, y0 = 6000000 + Math.floor(i / 30) * 25; return { hole_id: `DH-${i}`, wx: Array.from({ length: 40 }, (_, k) => x0 + k * 2), wy: Array.from({ length: 40 }, (_, k) => y0 + k) }; });
const SECTIONS = [{ id: "s1", ...SEC, stepped: true, stepM: 50 }, { id: "s2", ax: 500000, ay: 6000250, bx: 500800, by: 6000250 }, { id: "s3", ax: 500000, ay: 6000100, bx: 500800, by: 6000100 }, { id: "x", ax: 500000, ay: 6000000, bx: 500000, by: 6000500 }];

test("#3977 the plan: visible holes thinned, the series (parallel only) with its step, relative and rounded", () => {
  const m = overviewPlan({ traces: grid(60), visible: { "DH-0": false }, sections: SECTIONS, id: "s1", section: SEC });
  assert.equal(m.holes.length, 59, "a hidden hole is left out");
  assert.ok(m.holes.every((pl) => pl.length <= 12), "at most 6 points each");
  assert.equal(m.holes[0][0], Math.round((500025 - m.origin[0]) * 10) / 10, "DH-1's collar, relative to the origin");
  assert.deepEqual(m.series.map((s) => [s.id, s.offset]).sort(), [["s2", 50], ["s3", -100]], "the cross line is not in the series");
  assert.equal(m.stepM, 50, "a stepped section keeps its own step");
  assert.equal(overviewSeries(SEC, [{ id: "s1", ...SEC }, SECTIONS[2]], "s1").stepM, 100, "otherwise the nearest spacing");
  assert.equal(overviewSeries(SEC, [{ id: "s1", ...SEC }], "s1").stepM, null, "alone: free");
  assert.ok(JSON.stringify(m) && m.holes.flat().every((v) => Math.round(v * 10) === v * 10), "JSON-safe, 0.1 m");
  assert.equal(overviewPlan({ section: { ax: NaN } }), null);
});

test("#3977 framed on the section (padded by its length, at least 300 m), square; holes far outside left out, a far series line not framed", () => {
  const short = { ax: 500000, ay: 6000000, bx: 500250, by: 6000000, corridor: 30 };
  const far = { hole_id: "DH-FAR", wx: [508000, 508010], wy: [6000000, 6000000] };
  const m = overviewPlan({ traces: [...grid(4), far], section: short, sections: [{ id: "f", ax: 500000, ay: 6009000, bx: 500250, by: 6009000 }], id: "s" });
  assert.deepEqual(m.size, [850, 850], "250 m + 2 x 300 m, made square");
  assert.equal(m.holes.length, 4, "the hole 8 km away is not drawn");
  assert.equal(m.series.length, 1, "the far parallel line is listed (and clipped), not framed");
});

test("#3977 cheap at 600 holes: built and drawn in well under a frame budget, a few tens of kB", () => {
  const traces = grid(600);
  let t = performance.now();
  const m = overviewPlan({ traces, sections: SECTIONS, id: "s1", section: SEC });
  const build = performance.now() - t;
  t = performance.now();
  const svg = overviewSvg(m, SEC, 280, 210);
  const draw = performance.now() - t;
  assert.ok(build < 150 && draw < 150, `build ${build.toFixed(1)} ms, draw ${draw.toFixed(1)} ms`);
  assert.ok(JSON.stringify(m).length < 80000 && svg.length < 100000, "small enough to send with each section");
  assert.equal((svg.match(/<path /g) || []).length <= 8, true, "one path per kind, not one per hole");
});

test("#3977 the drawing: the band, the line, A at the start and B at the end, the series faint, north arrow and scale bar; a drag shown dashed", () => {
  const m = overviewPlan({ traces: grid(30), boundaries: [{ polylines: [[{ x: 499950, y: 5999950 }, { x: 500900, y: 5999950 }]] }], sections: SECTIONS, id: "s1", section: SEC });
  const svg = overviewSvg(m, SEC, 280, 210);
  assert.match(svg, /fill="#c0392b" fill-opacity="0.16"/, "the buffer band");
  assert.match(svg, />A<\/text>/); assert.match(svg, />B<\/text>/); assert.match(svg, />N<\/text>/);
  assert.match(svg, /stroke-opacity="0.35"/, "the series, faint");
  assert.match(svg, /stroke-dasharray="4 2"/, "a boundary");
  assert.match(svg, />(\d+ m|[\d.]+ km)<\/text>/, "the scale bar's length");
  const v = overviewView(m, 280, 210), s = sectionInModel(m, SEC);
  const ax = v.X(s.a[0]), bx = v.X(s.b[0]);
  const xs = [...svg.matchAll(/<text x="([\d.]+)"[^>]*>(A|B)<\/text>/g)].map((q) => [q[2], Number(q[1])]);
  assert.ok(xs.find((q) => q[0] === "A")[1] < ax && xs.find((q) => q[0] === "B")[1] > bx, "A beyond the start, B beyond the end");
  assert.equal(Math.abs(v.k - v.k), 0); assert.deepEqual(v.toRel(v.X(120), v.Y(40)).map((q) => +q.toFixed(6)), [120, 40], "one scale both ways");
  assert.match(overviewSvg(m, SEC, 280, 210, { offset: 50 }), /stroke-dasharray="5 3"/);
  assert.equal(niceMetres(340), 200); assert.equal(niceMetres(4.2), 2);
});

test("#3977 a drag snaps to the series' step, else to a metre; moving it is the ± steps' exact offset (an existing section at that offset is reopened)", () => {
  assert.equal(snapOffset(37, 50), 50); assert.equal(snapOffset(-74, 50), -50); assert.equal(snapOffset(-76, 50), -100); assert.equal(snapOffset(37.4, null), 37);
  const s = sectionInModel(overviewPlan({ section: SEC, sections: SECTIONS, id: "s1" }), SEC);
  assert.deepEqual(s.n.map((v) => v + 0), [0, 1], "+ is north for a line running east (stepSection's normal)");
  const there = stepSection(SECTIONS[0], SECTIONS, 1, { fallback: 50, exact: true });
  assert.equal(there.existing?.id, "s2", "dragged 50 m north: the series' section there");
  const free = stepSection(SECTIONS[0], SECTIONS, -1, { fallback: 37, exact: true });
  assert.equal(free.create.ay, 6000200 - 37, "37 m south: a new parallel section");
});

test("#3977 the hillshade: the terrain resampled over the extent, off-terrain cells transparent; none without a terrain", () => {
  const el = new Float32Array(50 * 50).map((_, i) => (i % 50) * 3);
  const g = shadeGrid({ bbox: [499900, 5999900, 501000, 6001000], gridW: 50, gridH: 50, elevations: el }, [499800, 5999800, 501100, 6001100]);
  assert.equal(Math.max(g.w, g.h), 192);
  assert.equal(g.rgba[3], 0, "the corner lies off the terrain");
  assert.equal(g.rgba[((g.h >> 1) * g.w + (g.w >> 1)) * 4 + 3], 255);
  assert.equal(shadeGrid({ bbox: [0, 0, 10, 10], gridW: 5, gridH: 5, elevations: new Float32Array(25) }, [100, 100, 200, 200]), null, "no overlap");
  assert.equal(sectionOverview({ section: SEC }, null).shade, null);
  assert.equal(sectionOverview({ get traces() { throw new Error("x"); }, section: SEC }, null), null, "a failure leaves the section without its overview");
});

test("#3977 the export inset: beside the figure at its top right (not over the plot), the figure widened on a white strip", () => {
  const m = overviewPlan({ traces: grid(30), section: SEC, sections: SECTIONS, id: "s1" });
  const { w, h } = insetSize(m, 1100, 790);
  assert.ok(w <= 242 && h <= 474 && Math.abs(w / h - m.size[0] / m.size[1]) < 0.05, "a fifth of the width at most, the plan's shape");
  const fig = '<svg font-family="x" viewBox="0 0 1100 790" width="1100" style="" height="790"><rect width="1100" height="790" stroke-width="2"/></svg>';
  const out = withOverviewInset(fig, null, m, SEC), W2 = 1100 + w + 24;
  assert.match(out, new RegExp(`^<svg font-family="x" viewBox="0 0 ${W2} 790" width="${W2}" style="" height="790">`), "viewBox and width widened");
  assert.match(out, new RegExp(`<g class="ge-section-overview-inset"><rect x="1100" y="0" width="${w + 24}" height="790" fill="#ffffff"/><svg x="1112.0" y="12.0" width="${w}" height="${h}"`));
  assert.match(out, /<rect width="1100" height="790" stroke-width="2"\/>/, "the figure itself untouched");
  assert.ok(out.endsWith("</svg></g></svg>"));
  assert.equal(figureWidth(out), W2); assert.equal(figureWidth(fig), 1100);
  assert.equal(withOverviewInset("<svg/>", null, m, SEC), "<svg/>", "no viewBox: left as it is");
});

test("#3977 wired: built with each section sent, lazy in the window, the drag through the step message, the inset on every export, off in print", () => {
  const v = read("../src/modules/ViewerModule.jsx"), w = read("../src/components/SectionWindow.jsx"), a = read("../src/App.jsx"), css = read("../src/styles/app.css"), o = read("../src/components/SectionOverview.jsx");
  assert.match(v, /overview: \(await import\("\.\.\/lib\/sectionOverview\.js"\)\)\.sectionOverview\(\{ traces: tracesRef\.current, visible: visibleHoles, boundaries, sections, id: sent\.id, section: sent\.section \}, terrain\)/);
  assert.match(v, /const r = offsetM > 0 \? stepSection\(s, sections, step, \{ fallback: offsetM, exact: true \}\) :/);
  assert.match(a, /detail: \{ id, step, refresh, by, corridor, offsetM/);
  assert.match(w, /const SectionOverview = lazyPart\(\(\) => import\("\.\/SectionOverview\.jsx"\)\);/);
  assert.match(w, /onMove=\{\(off\) => stepTo\(\{ id: data\.id, step: Math\.sign\(off\), offsetM: Math\.abs\(off\) \}\)\}/);
  assert.equal((w.match(/ovInset\(/g) || []).length, 3, "SVG, PNG and the Layout snapshot");
  assert.match(w, /const undo = overviewRef\.current\?\.pdf\?\.\(svgRef\.current\);/);
  assert.match(w, /naturalW: figW, naturalH: dims\.h/); assert.match(w, /worldWidthAtCaptureM: hScale \? figW \/ hScale : null/);
  assert.match(w, /w = overviewRef\.current\?\.width\?\.\(xml\) \|\| d\.w;/, "the PNG as wide as the widened figure");
  assert.match(w, /const left = `\$\{zoomed \? "" : "A  "\}\$\{/); assert.match(w, /N\$\{zoomed \? "" : "  B"\}`;/); // #4009: A / B only at fit
  assert.match(css, /\.ge-section-tabbar, \.ge-section-overview \{ display: none !important; \}/);
  assert.match(o, /exportRef\.current = pref\.onExport \?/, "the inset only while ticked");
  assert.match(o, /const KEY = "geostrix\.sectionOverview";/);
});
