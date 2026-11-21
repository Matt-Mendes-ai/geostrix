// TASKS.csv #3956 (Matt picked style A: a small geology block) — the empty cards' pictures are one style: every picture is the block with what its file becomes on it; the file
// is a spreadsheet dropping in; colours and shadows are tokens; no words in the SVG; two cards on screen never share a gradient id.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3956 every picture is the geology block", () => {
  const d = read("../src/components/DropDiagram.jsx");
  const body = d.slice(d.indexOf("const PICTURES = {"), d.indexOf("\n};", d.indexOf("const PICTURES = {")));
  const kinds = [...body.matchAll(/^ {2}(\w+): \(id\) => <Block id=\{id\}/gm)].map((m) => m[1]);
  assert.deepEqual(kinds.sort(), ["grid", "holes", "map", "plot", "points", "terrain", "units"]);
  for (const user of ["../src/modules/viewer/EmptyViewerBody.jsx", "../src/modules/GeochemModule.jsx", "../src/modules/GeophysicsModule.jsx", "../src/modules/MapsModule.jsx", "../src/components/StartDialogs.jsx", "../src/components/MacrostratModal.jsx"]) {
    for (const m of read(user).matchAll(/picture=\{?["']?(\w+)["']?/g)) if (!["noDrill", "picture"].includes(m[1])) assert.ok(kinds.includes(m[1]), `${user}: ${m[1]}`);
  }
  assert.match(d, /function FileIcon\(/);
  assert.match(d, /const useSvgId = \(\) => `dd\$\{useId\(\)\.replace\(\/\[\^A-Za-z0-9\]\/g, ""\)\}`;/, "a unique id per picture");
});

test("#3956 tokens only: colours and shadows; no words in the SVG; app.css and theme.js agree on the shadows", () => {
  for (const f of ["../src/components/DropDiagram.jsx", "../src/components/LayoutStartCard.jsx"]) {
    const s = read(f);
    assert.doesNotMatch(s, /rgba?\(/, `${f}: a raw colour`);
    assert.doesNotMatch(s, /["'`]#[0-9a-fA-F]{3,6}\b/, `${f}: a hex colour`);
  }
  assert.doesNotMatch(read("../src/components/EmptyState.jsx"), /rgba?\(/, "EmptyState's shadow is a token (its translucent ground and button colours are older, documented literals)");
  assert.doesNotMatch(read("../src/components/DropDiagram.jsx"), /<text\b/);
  const css = read("../src/styles/app.css"), theme = read("../src/lib/theme.js");
  for (const [k, v] of [...css.matchAll(/--shadow-(\w+): ([^;]+);/g)].map((m) => [m[1], m[2]])) {
    assert.match(theme, new RegExp(`${k}: "${v.replace(/[()]/g, "\\$&")}"`), `theme.js shadows.${k}`);
  }
  assert.match(read("../src/components/DropDiagram.jsx"), /boxShadow: "var\(--shadow-lift\)"/);
  assert.match(read("../src/components/EmptyState.jsx"), /<div className="ge-card" style=\{\{ \.\.\.card, position: "relative" \}\}>/, "the empty cards use the shared card class");
  assert.match(read("../src/styles/app.css"), /\.ge-card \{ background: var\(--color-bg\); border: 1px solid var\(--color-border\); border-radius: 12px; box-shadow: var\(--shadow-card\); \}/);
});
