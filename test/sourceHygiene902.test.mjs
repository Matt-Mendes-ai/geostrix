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

// TASKS.csv #1114 — one median and one interpolating quantile, in arrayStats.js: two local medians had taken the
// upper-middle value of an even count. A new local definition fails here; import median / quantileLinear instead.
test("#1114 no local median / quantile outside arrayStats.js", () => {
  const re = /(?:function\s+|const\s+)(median|quantile|quantileSorted|quantileLinear)\s*(?:\(|=\s*(?:\(|function))/;
  const bad = walk("src").filter((p) => /\.(jsx?|mjs)$/.test(p) && !p.endsWith(path.join("lib", "arrayStats.js")) && re.test(readFileSync(p, "utf8")));
  // GradeStatistics.jsx's quantile is length-weighted, a different statistic (#740)
  assert.deepEqual(bad.filter((p) => !p.endsWith("GradeStatistics.jsx")), []);
});

// TASKS.csv #1114 — one base64 decoder (lib/base64.js b64ToBytes); comments may still mention atob
test("#1114 no atob() decoding outside base64.js", () => {
  const bad = walk("src").filter((p) => /\.(jsx?|mjs)$/.test(p) && !p.endsWith("base64.js") && readFileSync(p, "utf8").split("\n").some((l) => !/^\s*\/\//.test(l) && /\batob\(/.test(l)));
  assert.deepEqual(bad, []);
});
