// TASKS.csv #2790 (split from #2787) — Geophysics > Downhole logs groups readings by code with the case / space variants of a code folded
// into one (lib/domainLayers.js foldDomainRows, as Estimation #2427 and Isocon #2787 do): Dcb, DCB and "Dcb " (a trailing space) were three boxes. SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foldDomainRows } from "../src/lib/domainLayers.js";
import { logByCode } from "../src/lib/downholeLogs.js";

test("folded, the variants are one code with every reading", () => {
  const dom = [];
  const log = [];
  ["Dcb", "Dcb", "Dcb", "DCB", "DCB", "Dcb ", "Sst", "Sst", "Sst"].forEach((code, i) => {
    dom.push({ hole_id: "H1", from: i * 2, to: i * 2 + 2, value: code });
    for (let k = 0; k < 4; k++) log.push({ hole_id: "H1", from: i * 2 + k * 0.5, to: i * 2 + k * 0.5 + 0.5, values: { g: code === "Sst" ? 10 + k : 100 + i + k } });
  });
  const raw = logByCode(log, "g", dom, { minN: 3 }).map((g) => g.key).sort();
  assert.ok(raw.includes("DCB") && raw.includes("Dcb") && raw.includes("Dcb "));
  const f = foldDomainRows(dom);
  assert.deepEqual(f.folded.map((x) => x.codes), [["Dcb", "DCB", "Dcb "]]);
  const folded = logByCode(log, "g", f.rows, { minN: 3 });
  assert.deepEqual(folded.map((g) => g.key).sort(), ["Dcb", "Sst"]);
  assert.equal(folded.find((g) => g.key === "Dcb").n, 24); // 6 intervals x 4 readings
});

test("the pane folds the chosen code layer and says which spellings it joined", () => {
  const src = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(src, /const domainFold = useMemo\(\(\) => \(domain \? foldDomainRows\(domain\.rows\) : null\), \[domain\]\);/);
  assert.match(src, /logByCode\(data\.assays, data\.symbol, domainFold\.rows,/);
  assert.match(src, /tr\("Spellings that differ only by case or spaces are one domain here: \{list\}\.", \{ list: domainFold\.folded\.map/);
});
