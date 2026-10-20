// TASKS.csv #731 — the backlog file is private (gitignored), so its ids must not reach the user: no "TASKS.csv"
// inside a string, template or JSX text in src/ or electron/ (comments are fine).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? files(p) : /\.(js|jsx|mjs)$/.test(d.name) ? [p] : [];
});

test("no TASKS.csv id in a user-visible string", () => {
  const hits = [];
  for (const f of [...files("src"), ...files("electron")]) {
    const src = fs.readFileSync(f, "utf8");
    if (!/TASKS(.csv| #)/.test(src)) continue;
    const tokens = espree.tokenize(src, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true });
    for (const t of tokens) {
      if (["String", "Template", "JSXText"].includes(t.type) && /TASKS(\.csv| #\d)/.test(t.value)) hits.push(`${f}:${t.loc.start.line}`); // #786: also "TASKS #52"
    }
  }
  assert.deepEqual(hits, []);
});
