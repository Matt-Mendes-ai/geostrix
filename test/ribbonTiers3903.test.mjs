// TASKS.csv #3903 / #3914 / #3906 (the #3901 redesign, batch P3) — the tool tiers inside the tabs. An advanced tool carries a thin blue
// bar on its ribbon button and Basic tools hides it as before; a basic tool carries no mark.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

test("#3903 an advanced tool's ribbon button carries the blue bar; Basic tools still hides it", () => {
  const css = rd("src/styles/app.css");
  assert.match(css, /--tier-tool-bar: 0\.25em;/);
  assert.match(css, /\.ge-adv \.ge-ribbon-btn \{ box-shadow: inset 0 var\(--tier-tool-bar\) 0 var\(--color-tier-advanced\); \}/);
  assert.match(css, /\.ge-adv \.ge-ribbon-btn\.active \{ box-shadow: inset 0 var\(--tier-tool-bar\) 0 var\(--color-tier-advanced\), inset 0 -2px 0 var\(--color-accent-dark\); \}/);
  assert.match(css, /\.ge-ribbon-group\.ge-adv > \.ge-ribbon-caption \{ color: var\(--color-tier-advanced\); \}/);
  assert.match(css, /\.ge-ribbon-simple \.ge-adv \{ display: none; \}/);
  const rib = rd("src/components/Ribbon.jsx");
  assert.match(rib, /<div className=\{`ge-ribbon-cell\$\{advanced \? " ge-adv" : ""\}`\}>/);
  assert.match(rib, /<div className=\{`ge-ribbon-group\$\{advanced \? " ge-adv" : ""\}`\}/);
});
