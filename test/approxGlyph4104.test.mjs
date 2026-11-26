// TASKS.csv #4104 (Matt's screenshot, Osborne Inversion > Estimate) — (1) "× ~2,471,974 underground cells" and "~1645 s to build" read as negative
// numbers: Exo 2 draws "~" low, like a minus. Every value prefixed with "about" says "≈ " now, in src and in every language. (2) The pane said
// "The terrain covers every station." beside the plan's "3 station(s) lie outside the terrain surface": it says "every" only when none is out,
// else the one count, the plan's own once an estimate has run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stationCoverage, coverageCount } from "../src/lib/stationCoverage.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
// file formats whose "~" is syntax (LAS sections, Crone / downhole EM tags) or a path test, not a value prefix
const FORMAT = /src[\\/]lib[\\/](las|cronePem|downholeEm|boreholeEm|mcpTools)\.js$/;
const files = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? (n === "locales" ? [] : files(p)) : /\.(js|jsx)$/.test(n) ? [p] : []; });
// the string-literal spans of one line (not comments): [text inside the quotes]
function strings(line) {
  const out = []; let q = null, start = 0, depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i], n = line[i + 1];
    if (!q) {
      if (c === "/" && n === "/") break;
      if (c === "/" && n === "*") { const e = line.indexOf("*/", i + 2); if (e < 0) break; i = e + 1; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; start = i + 1; continue; }
      if (c === "}" && depth) { depth--; q = "`"; start = i + 1; }
      continue;
    }
    if (c === "\\") { i++; continue; }
    if (q === "`" && c === "$" && n === "{") { out.push(line.slice(start, i)); depth++; q = null; i++; continue; }
    if (c === q) { out.push(line.slice(start, i)); q = null; }
  }
  return out;
}
const TILDE_VALUE = /~(\{|\$\{|\d)|^~$/;

test("#4104 no value in src is prefixed with '~' (it reads as a minus in Exo 2): '≈ ' says 'about'", () => {
  const bad = [];
  for (const f of files(path.join(root, "src"))) {
    if (FORMAT.test(f)) continue;
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => { for (const s of strings(line)) if (TILDE_VALUE.test(s)) bad.push(`${path.relative(root, f)}:${i + 1}: ${s.slice(0, 80)}`); });
  }
  assert.deepEqual(bad, []);
  // the two values of the screenshot
  const inv = read("src/components/InversionPanel.jsx");
  assert.match(inv, /\{nData\} stations × \{v\}\{nActiveEst\} underground cells", \{ nData: plan\.nData\.toLocaleString\(\), v: plan\.octree \? "" : "≈ "/);
  assert.match(inv, /peak memory ≈ \{v3\}, ≈ \{v4\} s to build it/);
  // the sidecar's own messages, shown as they come (found live: "would need ~171.70 GB" under the estimate)
  const py = read("python-sidecar/app/geophys/potential.py") + read("python-sidecar/app/main.py");
  assert.doesNotMatch(py, /f"[^"\n]*~\{/);
  assert.match(py, /would need ≈ \{sens \/ 1e9:\.2f\} GB/);
});

test("#4104 in every language: no translation of a key that says '≈ ' keeps a '~' (some say 'about' in words: also fine)", () => {
  let n = 0;
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const t = JSON.parse(read(`src/locales/${lang}.json`));
    for (const [k, v] of Object.entries(t)) if (/≈ (\{|\d)/.test(k)) { n++; assert.ok(!/~(\{|\d)/.test(v), `${lang}: ${k.slice(0, 60)} -> ${v.slice(0, 60)}`); }
  }
  assert.ok(n >= 4 * 50, `the renamed keys are there (${n})`);
});

test("#4104 a lab reason saved with '~12 %' (before) and one with '≈ 12 %' (now) are both read", () => {
  const src = read("src/lib/labCertificate.js");
  assert.match(src, /reason: tr\("Within ≈ \{v\} % of \{id\}/);
  const re = /[~≈] ?(\d+) %/;
  assert.ok(src.includes("r.reason.match(/[~≈] ?(\\d+) %/)"));
  assert.equal("Within ~12 % of DUP-1".match(re)[1], "12");
  assert.equal("Within ≈ 12 % of DUP-1".match(re)[1], "12");
});

test("#4104 the coverage line: 'every station' only when none is outside, else the one count (the plan's when it has one)", () => {
  const rows = (n, out) => Array.from({ length: n }, (_, i) => ({ x: i < out ? -1 : i, y: 0 }));
  const at = (x) => (x < 0 ? NaN : 100);
  assert.deepEqual(stationCoverage(rows(16633, 0), at), { outside: 0, total: 16633, pct: 100 });
  const three = stationCoverage(rows(16633, 3), at);
  assert.equal(three.outside, 3); assert.ok(three.pct >= 99.95, "the old test called this 'every station'");
  assert.equal(stationCoverage(rows(100, 40), at).outside, 40);
  assert.equal(stationCoverage([], at), null);
  // the plan's count wins (the same as its warning); an older sidecar's plan has none: the pane's own
  assert.deepEqual(coverageCount({ outside: 0, total: 16633 }, { stationsOutside: 3, nData: 16633 }), { outside: 3, total: 16633 });
  assert.deepEqual(coverageCount({ outside: 3, total: 16633 }, { nData: 16633 }), { outside: 3, total: 16633 });
  assert.deepEqual(coverageCount(null, null), null);
  const inv = read("src/components/InversionPanel.jsx");
  assert.match(inv, /covered\.outside === 0 \? tr\("The terrain covers every station\."\) : tr\("\{n\} of \{total\} stations are outside the terrain and would be left out\."/);
  assert.doesNotMatch(inv, /pct >= 99\.95/);
  assert.match(read("python-sidecar/app/geophys/potential.py"), /"stationsOutside": outside\}/);
});
