// TASKS.csv #717 — every extension the Browser panel offers to import must be readable by the main process's
// fs-read-file allow-list, or the click does nothing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const extsIn = (file, name) => {
  const src = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const m = new RegExp(name + String.raw`\s*=\s*(?:new Set\()?\[([^\]]*)\]`).exec(src);
  assert.ok(m, `${name} not found in ${file}`);
  return [...m[1].matchAll(/"(\.[a-z0-9]+)"/g)].map((x) => x[1]);
};

test("the Browser panel's importable extensions are a subset of fs-read-file's allow-list", () => {
  const readable = new Set(extsIn("../electron/main.js", "READABLE_EXT"));
  const importable = extsIn("../src/components/DbBrowserPanel.jsx", "IMPORTABLE_EXT");
  assert.ok(importable.length >= 10);
  assert.deepEqual(importable.filter((e) => !readable.has(e)), []);
  for (const e of [".las", ".xlsx", ".kml", ".kmz"]) assert.ok(readable.has(e), e);
});
