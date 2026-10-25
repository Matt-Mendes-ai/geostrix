// TASKS.csv #902 — a NUL byte makes ripgrep / Grep treat a source file as binary and skip it in searches
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test("#902 no source file contains a NUL byte", () => {
  const bad = walk("src").filter((p) => /\.(jsx?|mjs|json|css)$/.test(p) && readFileSync(p).includes(0));
  assert.deepEqual(bad, []);
});
