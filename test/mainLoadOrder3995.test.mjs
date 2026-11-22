// TASKS.csv #3995 follow-up — electron/main.js used createAsker one line above `const { createAsker } = require(...)`, so loading main.js threw
// "Cannot access 'createAsker' before initialization" and the app never opened a window (found by side 2 before v0.2.7). Every top-level
// `const { name } = require(...)` in main.js must come before the first top-level use of that name.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
const lines = src.split(/\r?\n/);

test("#3995 main.js: each top-level destructured require comes before the first top-level use of its names", () => {
  const bad = [];
  lines.forEach((line, i) => {
    const m = /^const \{([^}]+)\} = require\(/.exec(line);
    if (!m) return;
    for (const raw of m[1].split(",")) {
      const name = raw.split(":").pop().trim();
      if (!name) continue;
      const use = new RegExp(`\\b${name}\\b`);
      for (let j = 0; j < i; j++) {
        const l = lines[j];
        if (/^\s*\/\//.test(l) || /^\s/.test(l)) continue; // comments, and code inside functions (runs later)
        if (use.test(l.replace(/\/\/.*$/, ""))) { bad.push(`${name}: used on line ${j + 1}, required on line ${i + 1}`); break; }
      }
    }
  });
  assert.deepEqual(bad, []);
});
