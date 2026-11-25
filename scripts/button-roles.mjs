// TASKS.csv #4069 — the button-role ratchet. Counts the <button> elements in src/**/*.jsx that carry no role class (.gs-btn), per file, and compares with
// test/buttonRoles-baseline.json: no file may have MORE role-less buttons than its baseline (a new file has a baseline of 0), and the total may only go down.
//   node scripts/button-roles.mjs                      the table: role-less buttons per file, worst first
//   node scripts/button-roles.mjs --update-baseline    lower the baseline to today's counts (refuses a file that grew)
// A button that deliberately keeps its own look (the ribbon, the 3D view's floating controls, a segmented toggle) is not counted when it carries data-btn-own.
// Two primaries in one dialog: primaryCounts() lists, per component function, how many .gs-btn--primary it renders; a line marked `gs-primary-alt` (one of two
// alternatives in a ternary) is not counted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_FILE = path.join(ROOT, "test", "buttonRoles-baseline.json");

export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

// the opening tags of every <button ...> (brace / quote aware, so an arrow `=>` or a `>` in an expression does not end it)
export function buttonTags(src) {
  const out = [];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 0, q = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (depth > 0 && c === "/" && src[i + 1] === "/") { const j = src.indexOf("\n", i); i = j < 0 ? src.length : j; continue; } // a comment inside an expression (an apostrophe in it is no quote)
      if (depth > 0 && c === "/" && src[i + 1] === "*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 1; continue; }
      if (c === '"' || c === "'" || (depth > 0 && c === "`")) { q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && src[i - 1] !== "=") break;
    }
    out.push({ start: m.index, end: i + 1, text: src.slice(m.index, i + 1) });
  }
  return out;
}

export const hasRole = (tag) => /gs-btn\b/.test(tag) || /\bdata-btn-own\b/.test(tag);

export function scan(srcDir = path.join(ROOT, "src")) {
  const byFile = {};
  let total = 0, without = 0;
  for (const f of walk(srcDir)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const tags = buttonTags(fs.readFileSync(f, "utf8"));
    if (!tags.length) continue;
    const w = tags.filter((t) => !hasRole(t.text)).length;
    total += tags.length; without += w;
    byFile[rel] = { total: tags.length, without: w };
  }
  return { total, without, byFile };
}

// per component function: the number of .gs-btn--primary it renders
export function primaryCounts(srcDir = path.join(ROOT, "src")) {
  const out = [];
  for (const f of walk(srcDir)) {
    const src = fs.readFileSync(f, "utf8");
    if (!src.includes("gs-btn--primary")) continue;
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const lines = src.split(/\r?\n/);
    let name = "(file)", n = 0;
    const flush = () => { if (n) out.push({ file: rel, component: name, primaries: n }); };
    for (const l of lines) {
      const m = l.match(/^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)|^(?:export\s+)?const\s+([A-Z]\w*)\s*=\s*(?:React\.memo\(|forwardRef\(|\()/);
      if (m) { flush(); name = m[1] || m[2]; n = 0; }
      if (l.includes("gs-btn--primary") && !l.includes("gs-primary-alt")) n += (l.match(/gs-btn--primary/g) || []).length;
    }
    flush();
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const now = scan();
  if (process.argv.includes("--update-baseline")) {
    const old = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) : null;
    const grew = old ? Object.entries(now.byFile).filter(([f, v]) => v.without > (old.byFile[f] ?? 0)) : [];
    if (grew.length) { console.error("refused: these files have more role-less buttons than their baseline:\n" + grew.map(([f, v]) => `  ${f}: ${old.byFile[f] ?? 0} -> ${v.without}`).join("\n")); process.exit(1); }
    const byFile = Object.fromEntries(Object.entries(now.byFile).filter(([, v]) => v.without).map(([f, v]) => [f, v.without]));
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({ note: "Recorded by scripts/button-roles.mjs --update-baseline (#4069). No file may have more <button>s without a .gs-btn role class than its number; lower it after migrating.", total: now.total, withoutRole: now.without, byFile }, null, 1) + "\n");
    console.log(`baseline written: ${now.without} of ${now.total} buttons without a role class, in ${Object.keys(byFile).length} files`);
  } else {
    console.log(`${now.without} of ${now.total} <button>s have no role class\n`);
    for (const [f, v] of Object.entries(now.byFile).sort((a, b) => b[1].without - a[1].without).slice(0, 40)) console.log(String(v.without).padStart(4), "/", String(v.total).padEnd(3), f);
  }
}
