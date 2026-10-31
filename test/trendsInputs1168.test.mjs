// TASKS.csv #1168 — a tr() placeholder is text, never a React element: TrendsPanel's dip inputs came out as "[object Object]"
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = new URL("../src/components/", import.meta.url);

test("#1168 the trend editor renders its three inputs beside translated labels", () => {
  const src = fs.readFileSync(new URL("TrendsPanel.jsx", dir), "utf8");
  for (const k of ["dip", "dipAzimuth", "pitch"]) assert.match(src, new RegExp(`\\{tr\\("[^"]+"\\)\\}\\{num\\(t, "${k}"`), k);
  assert.ok(!/tr\("[^"]*\{v\}[^"]*", \{ v: num\(t,/.test(src));
});

test("#1168 no tr() call in src/components passes a JSX element as a placeholder", () => {
  const bad = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".jsx")) continue;
    const src = fs.readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/\btr\("[^"]*", \{([^}]*)\}\)/g)) if (/:\s*</.test(m[1])) bad.push(`${f}: ${m[0].slice(0, 80)}`);
  }
  assert.deepEqual(bad, []);
});
