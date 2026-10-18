// TASKS.csv #685 — the bundled samples must not fail their own interval checks
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roots = ["sample_data", "sample_data/harry_property", "sample_data/woodjam"];
test("no interval in a shipped sample runs backwards (from > to)", () => {
  let files = 0;
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root).filter((n) => n.endsWith(".csv"))) {
      const [head, ...lines] = fs.readFileSync(path.join(root, f), "utf8").split(/\r?\n/).filter(Boolean);
      const cols = head.split(",").map((c) => c.trim().toLowerCase());
      const fi = cols.indexOf("from"), ti = cols.indexOf("to");
      if (fi < 0 || ti < 0) continue;
      files++;
      const bad = lines.map((l) => l.split(",")).filter((c) => Number(c[fi]) > Number(c[ti]));
      assert.equal(bad.length, 0, `${root}/${f}: ${bad.length} rows with from > to, e.g. ${bad.slice(0, 2).map((c) => c.join(",")).join(" | ")}`);
    }
  }
  assert.ok(files >= 8, `checked ${files} interval files`);
});
