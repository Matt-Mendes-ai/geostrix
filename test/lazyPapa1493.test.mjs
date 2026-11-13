// TASKS.csv #1493 — papaparse (and lib/tabular.js with it) is not in the startup bundle: no static import path from the app
// entry reaches it; the 3D View's CSV writer and the import helpers' table reader load it on first use
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resolveImport = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec.split("?")[0]);
  for (const c of [base, base + ".js", base + ".jsx"]) if (existsSync(c) && /\.(jsx?|mjs)$/.test(c)) return c;
  return null;
};
// the files reached from `entry` by static `import ... from` lines only (a dynamic import() is not followed)
function staticReach(entry) {
  const parents = new Map([[entry, null]]), queue = [entry], seen = new Set(), packages = new Map();
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, "utf8"), re = /^\s*import\s+(?:[^'"()]+?\s+from\s+)?["']([^"']+)["']/gm;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (!spec.startsWith(".")) { if (!packages.has(spec)) packages.set(spec, f); continue; }
      const r = resolveImport(f, spec);
      if (r && !parents.has(r)) { parents.set(r, f); queue.push(r); }
    }
  }
  return { seen, packages, parents };
}

test("no static import path from the app entry reaches papaparse or lib/tabular.js", () => {
  const { seen, packages, parents } = staticReach(resolve(ROOT, "src/main.jsx"));
  assert.ok(seen.size > 100, `only ${seen.size} files reached: the walk is broken`);
  const tab = resolve(ROOT, "src/lib/tabular.js");
  const chain = (f) => { const out = []; for (let x = f; x; x = parents.get(x)) out.push(x.replace(ROOT, "")); return out.reverse().join(" -> "); };
  assert.ok(!seen.has(tab), `tabular.js reached: ${chain(tab)}`);
  assert.ok(!packages.has("papaparse"), `papaparse imported statically by ${packages.get("papaparse")}`);
  assert.ok(packages.has("three")); // the walk does see packages
});

test("the 3D View writes its CSVs through the lazily loaded writer; the import helpers read tables the same way", () => {
  const v = readFileSync(resolve(ROOT, "src/modules/ViewerModule.jsx"), "utf8");
  assert.match(v, /const toExportCsv = async \(rows, opts\) => \(await import\("\.\.\/lib\/tabular\.js"\)\)\.toExportCsv\(rows, opts\);/);
  assert.equal((v.match(/content: await toExportCsv\(/g) || []).length, 4);
  assert.match(v, /import \{ crsCell \} from "\.\.\/lib\/crsCell\.js"/);
  const h = readFileSync(resolve(ROOT, "src/lib/viewer/importHelpers.js"), "utf8");
  assert.match(h, /const tabular = \(\) => import\("\.\.\/tabular\.js"\);/);
  assert.doesNotMatch(h, /from "\.\.\/tabular\.js"/);
  assert.match(h, /tabular\(\)\.then\(async \(m\) => \{[\s\S]*?return m\.parseTableFile\(file, spec \? \{ logRead: spec \} : undefined\);/);
  const t = readFileSync(resolve(ROOT, "src/lib/tabular.js"), "utf8");
  assert.match(t, /export \{ crsCell \} from "\.\/crsCell\.js";/);
});
