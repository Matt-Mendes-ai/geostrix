// TASKS.csv #3330 (review #3195) — small slips in the Geophysics tab: the Inversion refusal for points at depth, a removed survey's metadata, a batch file's missing column
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3330 (1) the Inversion refusal covers points at depth of any kind, not only a downhole log", () => {
  const p = rd("../src/components/InversionPanel.jsx");
  assert.equal((p.match(/points at depth, a downhole log, an inversion model or a pseudo-section as points/g) || []).length, 2);
  assert.doesNotMatch(p, /A downhole log cannot be inverted as a surface survey; import it with the drillholes and use/);
});

test("#3330 (2) removing a survey drops its Method, units and legend with it", () => {
  const g = rd("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /setGeophysSurveys\(\(m\) => \{ const \{ \[sv\.key\]: _gone, \.\.\.rest \} = m \|\| \{\}; return rest; \}\);/);
});

test("#3330 (5) a batch file's missing column is named, not all three", () => {
  const g = rd("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const lack = \[xCol, yCol, valueCol\]\.filter\(\(c\) => !columns\.includes\(c\)\);/);
  assert.match(g, /lack\.length === 1 \? tr\("it has no \{c\} column\.", \{ c: lack\[0\] \}\) : tr\("it has none of the columns \{c\}\.", \{ c: lack\.join\(", "\) \}\)/);
  // the same rule, as the message would be built
  const lack = (cols, want) => want.filter((c) => !cols.includes(c));
  assert.deepEqual(lack(["X", "Y", "Z"], ["X", "Y", "AppMx"]), ["AppMx"]);
});
