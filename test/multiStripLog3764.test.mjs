// TASKS.csv #3764 (Scottie Gold review) — strip logs side by side offered twelve of 34 elements (Au to Cu: no Pb, Zn, S, Sb, Fe beside gold); the depth
// ticks were every 15 m on the first column and 10 m on the others; hung 'from their collar elevations' the scale stayed downhole metres on inclined
// holes, unsaid. Synthetic holes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { composeStripLogs } from "../src/lib/multiStripLog.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hole = (id, len, z) => ({ hole_id: id, x: 0, y: 0, z, length: len });
const collars = [hole("A", 305, 850), hole("B", 142, 852), hole("C", 90, 830)];
const lith = (id, len) => Array.from({ length: Math.floor(len / 10) }, (_, i) => ({ hole_id: id, from: i * 10, to: i * 10 + 10, value: i % 2 ? "ANDS" : "TUFF" }));
const layers = { litho: [...lith("A", 305), ...lith("B", 142), ...lith("C", 90)] };
const opts = { collars, layers, assays: [], assaySymbols: [], elementUnits: {} };
const ticks = (svg) => { const out = []; for (const m of svg.matchAll(/<svg x="(\d+)" y="\d+"[^>]*>([\s\S]*?)<\/svg>/g)) out.push([...m[2].matchAll(/<text x="4" y="[\d.]+" font-size="10" fill="#5a6472">(\d+)<\/text>/g)].map((t) => +t[1])); return out; };

test("one depth tick step for every column (each took its own hole's length)", () => {
  const { svg } = composeStripLogs(["A", "B", "C"], opts, { align: "depth" });
  const cols = ticks(svg);
  assert.equal(cols.length, 3);
  const step = (c) => c[1] - c[0];
  assert.equal(new Set(cols.map(step)).size, 1, `steps ${cols.map(step)}`);
  assert.equal(step(cols[0]), 20, "set by the longest hole (305 m)");
  assert.ok(cols[2].at(-1) <= 90 && cols[0].at(-1) <= 305);
});

test("hung by collar elevation says the scale is downhole depth; hung by depth does not", () => {
  const rl = composeStripLogs(["A", "B"], opts, { align: "rl" }), depth = composeStripLogs(["A", "B"], opts, { align: "depth" });
  assert.match(rl.svg, /Hung by collar elevation: the scale is downhole depth, so the same line across is the same level only in vertical holes\./);
  assert.ok(rl.note);
  assert.doesNotMatch(depth.svg, /downhole depth/);
  assert.equal(depth.note, "");
  assert.equal(composeStripLogs(["A"], opts, { align: "rl" }).note, "", "one hole: nothing to line up");
  assert.ok(rl.height > depth.height - 2, "the note has its own line");
});

test("every element can be chosen: the first twelve as chips, any ticked one too, the rest in an 'Add an element' list", () => {
  const m = read("../src/components/MultiStripLogModal.jsx");
  assert.match(m, /const QUICK = 12, quick = \(assayElements \|\| \[\]\)\.slice\(0, QUICK\), ticked = /);
  assert.match(m, /rest = \(assayElements \|\| \[\]\)\.filter\(\(e\) => !chips\.includes\(e\)\)/);
  assert.match(m, /tr\("Add an element… \(\{n\} more\)", \{ n: rest\.length \}\)/);
  assert.match(m, /disabled=\{syms\.length >= 3\}/, "three at most, as before");
  assert.doesNotMatch(m, /\.slice\(0, 12\)\.map\(\(e\) => <span/, "no fixed twelve");
  assert.match(m, /align === "rl" && <div/);
  // the picking rule, as the modal runs it
  const els = Array.from({ length: 34 }, (_, i) => ({ symbol: `E${i}` }));
  const pick = (syms) => { const quick = els.slice(0, 12), ticked = els.filter((e) => syms.includes(e.symbol) && !quick.includes(e)), chips = [...quick, ...ticked]; return { chips: chips.length, rest: els.filter((e) => !chips.includes(e)).length }; };
  assert.deepEqual(pick([]), { chips: 12, rest: 22 });
  assert.deepEqual(pick(["E30", "E2"]), { chips: 13, rest: 21 }, "Zn / Pb from the list become chips (click to remove)");
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(j["Hung by collar elevation: the scale is downhole depth, so the same line across is the same level only in vertical holes."], l); }
});
