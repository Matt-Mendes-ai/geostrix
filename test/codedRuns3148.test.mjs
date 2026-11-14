// TASKS.csv #3148 (split from #2926) — Modelling codes' 'Use the order from the holes' ran 2.1 s on the main thread on WA iron's 150,456 strand
// rows: codedRuns took 1.7 s and codesInUse 0.46 s, most of it building a row key for every row to look in an empty `assign`. codeResolver
// builds the key only when there are overrides and resolves each logged value once (93 ms and 80 ms on the same rows). The same results.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codedRuns, codesInUse, codeResolver, effectiveCode, rowKey } from "../src/lib/modellingCodes.js";

// the implementation before #3148, as the reference
function codedRunsBefore(lithoRows, mc, groupOf) {
  const byHole = new Map();
  (lithoRows || []).forEach((r) => {
    if (r == null || r.hole_id == null || !Number.isFinite(Number(r.from)) || !Number.isFinite(Number(r.to)) || !(Number(r.to) > Number(r.from))) return;
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
  });
  const runs = [];
  byHole.forEach((rows, hole_id) => {
    rows.sort((a, b) => Number(a.from) - Number(b.from));
    let cur = null;
    rows.forEach((r) => {
      const code = effectiveCode(r, mc, groupOf);
      const from = Number(r.from), to = Number(r.to);
      if (cur && cur.code === code && Math.abs(from - cur.to) < 1e-3) { cur.to = Math.max(cur.to, to); cur.rows.push(r); return; }
      const touching = cur && Math.abs(from - cur.to) < 1e-3;
      const run = { hole_id, code, from, to, rows: [r], above: touching ? cur : null, holeStart: !cur };
      runs.push(run);
      cur = run;
    });
  });
  return runs;
}

// 200 holes of A / B / C / D runs with splits, gaps, string depths, blanks, unsorted rows and bad rows
function rows() {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let h = 0; h < 200; h++) {
    let d = 0;
    for (let k = 0; k < 25; k++) {
      const len = 0.5 + Math.floor(rnd() * 8) / 2, gap = rnd() < 0.08 ? 1 : 0;
      const v = ["A", "B", "C", "D", " B ", "", null][Math.floor(rnd() * 7)];
      out.push({ hole_id: `H${h}`, from: rnd() < 0.3 ? String(d + gap) : d + gap, to: d + gap + len, value: v });
      d += gap + len;
    }
  }
  out.push({ hole_id: "H1", from: 9, to: 9, value: "A" }, { hole_id: null, from: 0, to: 1, value: "A" }, { hole_id: "H2", from: "x", to: 3, value: "A" }, null);
  return out.sort(() => rnd() - 0.5);
}
const sig = (runs) => runs.map((r) => [r.hole_id, r.code, r.from, r.to, r.rows.map((x) => rowKey(x)).join(","), r.above ? runs.indexOf(r.above) : -1, r.holeStart].join("|"));

test("codedRuns and codesInUse give exactly what they gave before: no overrides, overrides, groups, both", () => {
  const L = rows();
  const assign = {};
  L.forEach((r, i) => { if (r && r.hole_id && i % 13 === 0 && Number.isFinite(Number(r.from))) assign[rowKey(r)] = i % 2 ? "OVR" : "A"; });
  const groupOf = (v) => (v === "C" || v === "D" ? "CD" : null);
  for (const [mc, g] of [[{ codes: [], assign: {}, ties: [] }, null], [{ codes: [], assign, ties: [] }, null], [{ codes: [], assign: {}, ties: [] }, groupOf], [{ codes: [], assign, ties: [] }, groupOf], [null, null]]) {
    assert.deepEqual(sig(codedRuns(L, mc, g)), sig(codedRunsBefore(L, mc, g)));
    const names = new Set(); for (const r of L) { if (!r) continue; const c = effectiveCode(r, mc, g); if (c) names.add(c); }
    assert.deepEqual(codesInUse(L.filter(Boolean), mc, g, () => "stratigraphic").map((c) => c.name).sort(), [...names].sort());
  }
});

test("codeResolver is effectiveCode, row by row; the row key only when there are overrides", () => {
  const L = rows().filter((r) => r && r.hole_id);
  const assign = { [rowKey(L[3])]: "X1" };
  for (const mc of [{ assign: {} }, { assign }, null]) {
    const f = codeResolver(mc, (v) => (v === "A" ? "GA" : null));
    for (const r of L) assert.equal(f(r), effectiveCode(r, mc, (v) => (v === "A" ? "GA" : null)));
  }
  const src = readFileSync(new URL("../src/lib/modellingCodes.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const assign = mc\?\.assign, hasAssign = !!assign && Object\.keys\(assign\)\.length > 0;/);
  assert.match(src, /if \(hasAssign\) \{ const o = assign\[rowKey\(row\)\]; if \(o\) return o; \}/);
});

test("the pane: the coded runs memoized on the overrides only, shared by the counts and 'Use the order from the holes'", () => {
  const p = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const runsAll = useMemo\(\(\) => codedRuns\(litho, \{ assign: assignOnly \}, groupOf\), \[litho, assignOnly, groupOf\]\);/);
  assert.match(p, /const runs = runsAll\.map\(\(r\) => \(\{ hole_id: r\.hole_id, from: r\.from, value: r\.code \}\)\);/);
  // codedRuns reads the codes only through their overrides (codeResolver), so the order a click changes cannot change the runs
  const lib = readFileSync(new URL("../src/lib/modellingCodes.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = lib.indexOf("{", lib.indexOf("export function codedRuns(")) + 1;
  const body = lib.slice(start, lib.indexOf("\n}\n", start));
  assert.doesNotMatch(body.replace("codeResolver(mc, groupOf)", ""), /\bmc\b/);
});
