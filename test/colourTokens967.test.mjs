// TASKS.csv #967 — every var(--color-*) the code uses is declared in app.css. Three were not (--color-warning,
// --color-on-accent, --color-border-strong), so their fallbacks rendered: warning text at 3.6:1 and white on the amber
// pressed buttons at 2.2:1, below the contrast bar of #384, and no dark-theme value (review #918).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../src/", import.meta.url);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(jsx?|css)$/.test(e.name)) files.push(p);
  }
})(fileURLToPath(root));

test("#967 every colour token used is declared", () => {
  const css = fs.readFileSync(new URL("styles/app.css", root), "utf8");
  const declared = new Set([...css.matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]));
  const missing = [];
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/var\((--color-[\w-]+)/g)) if (!declared.has(m[1])) missing.push(`${m[1]} (${path.basename(f)})`);
  }
  assert.deepEqual([...new Set(missing)], []);
});
