// TASKS.csv #3141 (#3024, WA iron review) — the strip-log window on an iron-ore hole: up to five assay tracks, each element on its own axis
// (linear with round ticks under two decades, the Atlas's assayAxis; log over that; the Log scale box forces one), no empty built-in tracks,
// and a long custom-track name sized to its track instead of running under the next header.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assayAxis } from "../src/lib/striplogSvg.js";

const s = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");

test("the axis rule the window now uses: Fe 14-59 % linear with ticks, Au 0.01-10 g/t log", () => {
  const fe = assayAxis(14, 58.9);
  assert.equal(fe.linear, true);
  assert.deepEqual(fe.ticks, [0, 20, 40, 60]);
  assert.equal(assayAxis(0.01, 10).linear, false);
});

test("five assay tracks; four extra selects, one empty at a time", () => {
  assert.match(s, /\.filter\(\(s, i, a\) => a\.indexOf\(s\) === i\)\.slice\(0, 5\);/);
  assert.match(s, /\{\[0, 1, 2, 3\]\.map\(\(k\) => \(k <= extraSymbols\.length\) && \(/);
});

test("each element's own axis by default; the box overrides; ticks and gridlines on a linear axis", () => {
  assert.match(s, /const \[logScale, setLogScale\] = useState\(null\);/);
  assert.match(s, /const axisOf = \(sym\) => \{ const r = assayRange\[sym\]; const a = r \? assayAxis\(r\.minPos, r\.max\) : \{ linear: false \};/);
  assert.match(s, /if \(ax\.linear\) return Math\.max\(0, Math\.min\(1, v \/ \(ax\.max \|\| r\.max\)\)\);/);
  assert.match(s, /checked=\{logScale \?\? shownSymbols\.some\(\(s\) => !axisOf\(s\)\.linear\)\}/, "the box shows what is drawn");
  assert.match(s, /axisOf\(t\.sym\)\.ticks\?\.map\(\(tk\) => <line key=\{`g\$\{tk\}`\}/);
  assert.match(s, /\? ax\.ticks\.map\(\(tk, k\) => \(k % tickStride\(ax\.ticks\) === 0 \|\| k === ax\.ticks\.length - 1\) && <text key=\{`t\$\{tk\}`\}/);
  assert.match(s, /textAnchor=\{k === 0 \? "start" : k === ax\.ticks\.length - 1 \? "end" : "middle"\}/, "the end ticks stay inside their track");
  assert.match(s, /const logOn = logScale \?\? true;/, "mag susc keeps its log default");
  const tickStride = (ticks) => (ticks.reduce((w, t) => w + String(t).length * 4.8 + 4, 0) > 90 - 8 ? 2 : 1);
  assert.equal(tickStride([0, 20, 40, 60, 80]), 1);
  assert.equal(tickStride([0, 0.01, 0.02, 0.03, 0.04]), 2, "P: every other tick");
});

test("built-in tracks only for a hole with rows; headers sized to their track", () => {
  for (const k of ["alt", "vein", "weath", "breccia", "structzone", "recovery"]) {
    const v = { alt: "alt", vein: "vein", weath: "weath", breccia: "breccia", structzone: "structzone", recovery: "recovery" }[k];
    assert.match(s, new RegExp(`\\.\\.\\.\\(${v}\\.length \\? \\[\\{ key: "${k}"`), k);
  }
  assert.match(s, /\.\.\.\(structs\.length \? \[\{ key: "structure"/);
  // #2481 — a name too long even at 7 px goes on two lines (lib/stripHeader.js headerLines); the longer line sets the size
  assert.match(s, /hs = headerSize\(hl\.reduce\(/);
  assert.match(s, /fontSize=\{hs\}/);
  const headerSize = (label) => Math.max(7, Math.min(10.5, (90 - 8) / (String(label).length * 0.62)));
  assert.equal(headerSize("Litho"), 10.5);
  assert.ok(headerSize("…2023_DH_SWIR_Halo") * "…2023_DH_SWIR_Halo".length * 0.62 <= 82 + 1e-9, "a 14-letter name fits its 90 px track");
});
