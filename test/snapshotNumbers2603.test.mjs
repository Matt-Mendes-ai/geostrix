// TASKS.csv #2603 (review #2486, WA lithium) — a section snapshot already on a sheet has its long label numbers rounded (text only), grade
// labels stay inside the plot, and Re-snapshot is offered on every section snapshot
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundLongNumbersInSvg, roundLongNumbersInSnapshot } from "../src/lib/svgNumbers.js";
import { resolveLabels } from "../src/lib/sectionLabels.js";

const svg = '<svg width="800.12345678"><text x="10.123456789" y="5">2.2915408556696244 % Li</text><title>Li: 1.409 (333.24174602201447–334 m)</title><text>RC546 12.5 m</text></svg>';

test("only text nodes change: grades and depths rounded, attributes and short numbers kept", () => {
  const r = roundLongNumbersInSvg(svg);
  assert.equal(r.n, 2);
  assert.match(r.markup, />2\.292 % Li</);
  assert.match(r.markup, /\(333\.2–334 m\)/);
  assert.match(r.markup, /width="800\.12345678"/); // geometry untouched
  assert.match(r.markup, /x="10\.123456789"/);
  assert.match(r.markup, />RC546 12\.5 m</);
});

test("a base64 snapshot is rewritten; a PNG or an already rounded one is left alone", () => {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  const r = roundLongNumbersInSnapshot(src);
  assert.equal(r.n, 2);
  assert.match(Buffer.from(r.src.split(",")[1], "base64").toString("utf8"), />2\.292 % Li</);
  assert.equal(roundLongNumbersInSnapshot(r.src).n, 0);
  assert.equal(roundLongNumbersInSnapshot("data:image/png;base64,AAAA").n, 0);
});

test("a grade label with no room inside the plot is left out, not printed across the axis", () => {
  const spec = (x) => ({ key: "g", text: "2.292 % Li", size: 9, prio: 2, within: [60, 740, 60, 540], cands: [{ x, y: 100, anchor: "end" }] });
  assert.equal(resolveLabels([spec(30)], [], { bounds: [4, 796], yBounds: [2, 598] }).length, 0); // its end at x 30: left of the plot
  assert.equal(resolveLabels([spec(300)], [], { bounds: [4, 796], yBounds: [2, 598] }).length, 1);
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /within: \[PAD, W - PAD, PAD, H - PAD\] \/\* #2603/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /\(off \|\| sel\.sectionTabId\) && \(sel\.sectionTabId/);
  assert.match(l, /roundLongNumbersInSnapshot\(el\.src\)/);
});

test("#2622 — a section bar's hover title prints its depths to the centimetre", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /\$\{\+Number\(a\.from\)\.toFixed\(2\)\}–\$\{\+Number\(a\.to\)\.toFixed\(2\)\} m\)/);
  assert.equal(`${+Number(333.24174602201447).toFixed(2)}–${+Number(334).toFixed(2)}`, "333.24–334");
});
