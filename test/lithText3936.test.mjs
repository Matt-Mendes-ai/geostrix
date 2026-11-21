// TASKS.csv #3936 — Macrostrat's lithology block ('Major: {shale},Minor: {chert}') written in words in unit names, the Identify card, the map legend
// and Model from map's role list (lib/lithText.js plainLith). Synthetic strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plainLith } from "../src/lib/lithText.js";

test("the lithology block in words: major as is, then each lesser class named; any other text unchanged", () => {
  assert.equal(plainLith("Major: {shale},Minor: {chert}"), "shale; minor chert");
  assert.equal(plainLith("Pass Fm (Major: {basalt autobreccias, flows},Minor: {volcaniclastics})"), "Pass Fm (basalt autobreccias, flows; minor volcaniclastics)");
  assert.equal(plainLith("Major: {argillite,siltstone}, Minor: {}, Incidental: {limestone}"), "argillite, siltstone; incidental limestone");
  assert.equal(plainLith("Major: {granodiorite}"), "granodiorite");
  for (const s of ["Earn Gp", "Unit {A}", "", "1.5"]) assert.equal(plainLith(s), s);
  assert.equal(plainLith(null), null);
});

test("wired: Macrostrat's unit names, the Identify card, the map legend and the role list", () => {
  const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(read("lib/macrostrat.js"), /withLith = \(u\) => \(u\.lith \? `\$\{u\.name\} \(\$\{plainLith\(u\.lith\)\}\)` : u\.name\)/);
  assert.match(read("components/IdentifyPanel.jsx"), /\{typeof v === "string" \? plainLith\(v\) : v\}/);
  assert.match(read("lib/legendGroups.js"), /cats\.map\(\(c\) => \[plainLith\(c\.label \?\?/);
  const m = read("components/MapModelPanel.jsx");
  assert.match(m, /<span style=\{\{ fontWeight: 600 \}\}>\{plainLith\(u\)\}<\/span>/);
  assert.match(m, /<option key=\{u\} value=\{u\}>\{plainLith\(u\)\}<\/option>/); // shown in words, the value kept
});
