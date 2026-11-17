// TASKS.csv #3867 (Scottie Gold review) — a split strip log's pages made a 22-page PDF of 10 MB and 5-8 s. Measured live: the weight was the pattern fills (434 bitmap tiles of 100 kB for a 254 kB log
// split over two pages: 13.3 MB and 1.9-4.1 s; the same slices with the tiles as vector shapes: 0.08 MB, 0.5-0.9 s). Tested here on a minimal DOM (no browser in the test runner).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cropLeaves, expandPatternFills } from "../src/lib/svgCrop.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
class N {
  constructor(tag, attrs = {}, kids = []) { this.tagName = tag; this.attrs = { ...attrs }; this.children = []; this.parentNode = null; kids.forEach((k) => this.append(k)); this.ownerDocument = DOC; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  append(k) { k.parentNode = this; this.children.push(k); return k; }
  appendChild(k) { return this.append(k); }
  insertBefore(k, ref) { k.parentNode = this; const i = ref ? this.children.indexOf(ref) : this.children.length; this.children.splice(i < 0 ? this.children.length : i, 0, k); return k; }
  replaceChild(n, o) { const i = this.children.indexOf(o); n.parentNode = this; this.children[i] = n; o.parentNode = null; return o; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
  getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; }
  setAttribute(a, v) { this.attrs[a] = String(v); }
  cloneNode() { return new N(this.tagName, this.attrs, this.children.map((c) => c.cloneNode())); }
  getElementsByTagName(t) { const out = []; const walk = (n) => n.children.forEach((c) => { if (c.tagName === t) out.push(c); walk(c); }); walk(this); return out; }
  closest(sel) { const tags = sel.split(",").map((s) => s.trim()); for (let n = this; n; n = n.parentNode) if (tags.includes(n.tagName)) return n; return null; }
}
const DOC = { createElementNS: (_ns, t) => new N(t) };
const el = (t, a, k) => new N(t, a, k);

function drawing() {
  // a drawing 1,000 px tall (viewBox from y = -100): a pattern of 40 x 40 (viewBox 0 0 20 20), two pattern-filled rects, and plain lines
  const pat = el("pattern", { id: "p1", patternUnits: "userSpaceOnUse", width: 40, height: 40, viewBox: "0 0 20 20" }, [el("path", { d: "M0 0L20 20" })]);
  const calc = el("pattern", { id: "hatch", patternUnits: "userSpaceOnUse", width: 4, height: 4, patternTransform: "rotate(45)" }, [el("line", {})]);
  return el("svg", { viewBox: "0 -100 300 1000" }, [
    el("defs", {}, [el("style", {}), pat, calc]),
    el("g", {}, [
      el("rect", { x: 0, y: 0, width: 80, height: 300, fill: "url(#p1)" }),       // user y 0..300 (picture px 100..400)
      el("rect", { x: 100, y: 500, width: 40, height: 100, fill: "url(#p1)" }),   // user y 500..600 (picture px 600..700)
      el("rect", { x: 200, y: 0, width: 40, height: 40, fill: "url(#hatch)" }),   // a pattern with a transform: not expanded
      el("line", { y1: 10, y2: 10 }), el("line", { y1: 800, y2: 800 }),
    ]),
  ]);
}

test("cropLeaves keeps what touches a range and the definitions, drops the rest and an emptied group", () => {
  const root = drawing();
  // picture px from the leaf's own y (+100 for the band): the first rect 100-400, the second 600-700, the lines 110 and 900
  const rect = { rect: (e) => (e.attrs.y == 0 ? { top: 100, bottom: 400 } : { top: 600, bottom: 700 }), line: (e) => (e.attrs.y1 === 10 ? { top: 109, bottom: 111 } : { top: 899, bottom: 901 }) };
  const r = cropLeaves(root, [[0, 450]], (e) => rect[e.tagName](e));
  assert.deepEqual(r, { kept: 3, removed: 2 }); // the first rect, the hatch rect (y 0 too) and the line at 110 stay; the second rect and the line at 900 go
  assert.equal(root.getElementsByTagName("defs").length, 1);
  assert.equal(root.getElementsByTagName("pattern").length, 2, "patterns stay");
  const none = cropLeaves(drawing(), [[2000, 2100]], () => ({ top: 0, bottom: 10 }));
  assert.equal(none.kept, 0); // no group is left holding nothing: the g went with its leaves
  assert.equal(drawing().getElementsByTagName("g").length, 1);
});

test("expandPatternFills: a tiled fill becomes a clipped group of <use> tiles on the pattern's own grid, only over the part the ranges show", () => {
  const root = drawing();
  const n = expandPatternFills(root, [[0, 300], [500, 600]]);
  assert.equal(n, 2, "the patterned rects; the rotated one is left");
  const clips = root.getElementsByTagName("clipPath"); assert.equal(clips.length, 2);
  assert.equal(root.getElementsByTagName("symbol").length, 1, "the tile once, in the defs");
  const uses = root.getElementsByTagName("use");
  // rect 1: 80 x 300 at (0, 0): 2 columns x 8 rows (300 / 40 = 7.5); rect 2: 40 x 100 at (100, 500) straddles two columns (80, 120) and three rows (480, 520, 560)
  assert.equal(uses.length, 16 + 6);
  assert.deepEqual([uses[0].attrs.x, uses[0].attrs.y, uses[0].attrs.width, uses[0].attrs.height], ["0", "0", "40", "40"]);
  const last = uses[uses.length - 1]; assert.deepEqual([last.attrs.x, last.attrs.y], ["120", "560"]);
  assert.equal(root.getElementsByTagName("rect").filter((r) => /url\(#p1\)/.test(r.attrs.fill || "")).length, 0);
  assert.ok(root.getElementsByTagName("rect").some((r) => r.attrs.fill === "url(#hatch)"), "an unsupported pattern is left as it was");
  // a range that shows nothing of a rect: no tiles for it
  const r2 = drawing(); expandPatternFills(r2, [[0, 100]]);
  assert.equal(r2.getElementsByTagName("use").filter((u) => Number(u.attrs.y) >= 480).length, 0);
});

test("expandPatternFills leaves a drawing alone past its tile cap, and one with no pattern", () => {
  const r = drawing(); assert.equal(expandPatternFills(r, null, { maxTiles: 5 }), 0);
  assert.equal(expandPatternFills(el("svg", { viewBox: "0 0 10 10" }, [el("rect", { x: 0, y: 0, width: 5, height: 5, fill: "#fff" })])), 0);
});

test("wiring: a split's slices take their own cropped, tile-expanded picture; Whole log again keeps the original", () => {
  const l = read("../src/modules/LayoutModule.jsx"), p = read("../src/lib/stripLogPages.js");
  assert.match(l, /crops = cropStripLogSlices\(el\.src, r\.pages\.map\(\(p\) => p\.parts\)\)/);
  assert.match(l, /src: crops\?\.\[j \+ 1\] \|\| null/);
  assert.match(p, /\.\.\.\(src \? \{ src \} : \{\}\), id: i === 0/);
  assert.match(p, /\.\.\.\(src && i === 0 \? \{ src: el\.src \} : \{\}\)/);
});
