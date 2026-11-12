// TASKS.csv #2423 — a trend never reached the record of what was run: a sphere, a 10 : 1 and a 100 : 1 estimate were all named
// 'U estimate (idw2, 21m, r200m)', a shell under a trend had the same label as one without, and the parameters line said 'search 200 m' only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trendRatioText } from "../src/lib/trend.js";

test("trendRatioText writes the ratios normalised to the minor axis", () => {
  assert.equal(trendRatioText({ ratios: { max: 10, int: 10, min: 1 } }), "10:10:1");
  assert.equal(trendRatioText({ ratios: { max: 200, int: 20, min: 2 } }), "100:10:1");
  assert.equal(trendRatioText({ ratios: { max: 3, int: 2, min: 1.5 } }), "2:1.33:1");
  assert.equal(trendRatioText(null), "");
  assert.equal(trendRatioText({}), "");
  assert.equal(trendRatioText({ ratios: { max: 10, int: 0, min: 1 } }), "");
});

test("the estimate name, the shell label and the parameters line carry the trend", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /const tr3 = trendRatioText\(p\.searchTrend \|\| p\.anisotropy\), a = tr3 \? `, \$\{tr3\}` : ""/);
  assert.match(e, /estimate \(\$\{method\}, \$\{cellLabel\}m\$\{r\}\$\{a\}\)/);
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  // #2551: the trend is one of the label's tags (with the checked holes)
  assert.match(m, /anisotropy\.enabled && trendRatioText\(anisotropy\.params\) \? `trend \$\{trendRatioText\(anisotropy\.params\)\}` : ""/);
  assert.match(m, /shell\$\{shellTags\.length \? ` \(\$\{shellTags\.join\(", "\)\}\)` : ""\}/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /s\.params\.anisotropy && trendRatioText\(s\.params\.anisotropy\) \? tr\(" · trend \\"\{name\}\\" \{ratios\}\{ell\}"/);
});

// found live on #2423: '// #2544 cellSizeM: …, paddingM: padding,' had turned the cell size and padding of every estimate into a comment
// (named 'U estimate (idw2, undefinedm, …)'), and '// #1571 restrictToDomain: …' had dropped the domain restriction from the record
test("no TASKS note comment swallows the object keys after it", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(n)) files.push(p); } };
  walk(decodeURIComponent(root));
  const pat = /\/\/\s*#\d+\s+[A-Za-z_]\w*: [^"'`]*?, [A-Za-z_]\w*: /;
  const hits = files.flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => (pat.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(hits, []);
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /"every hole", \/\* #2544 \*\/ cellSizeM: matched/);
  assert.match(e, /\/\* #1571 \*\/ restrictToDomain: restrictToDomain && !!domainKey, noCodeAsDomain/);
});
