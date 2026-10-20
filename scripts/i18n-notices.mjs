// TASKS.csv #786 — codemod: notices in the interface language. In every setNotices(...) item list:
//   "text"                      -> notice("text")
//   `Loaded ${rows.length} x`   -> notice("Loaded {rows} x", { rows: rows.length })
//   errorNotice(`…${a}…`)       -> errorNotice(tr("…{a}…", { a }))   (infoNotice the same)
// notice() (lib/notices.js) translates and judges the severity on the English wording. Text inside a placeholder's value —
// the English branches of a ternary or && — is wrapped too (tr("…") / a nested template the same way); comparison values,
// method arguments and object keys are never touched (translating those would change what the code does).
// usage: node scripts/i18n-notices.mjs <file> [--dry]   -> prints the new keys as JSON lines; adds the imports it needs.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const file = process.argv[2];
const dry = process.argv.includes("--dry");
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const hasWords = (s) => /[A-Za-z]{2}/.test(s);
const keys = new Set();
const edits = [];
let usesNotice = false, usesTr = false;

// a text literal inside a placeholder value? (a ternary branch, a && / || operand, or a template part)
const isTextPosition = (p) => {
  const par = p.parentPath;
  if (par.isConditionalExpression() && par.node.test !== p.node) return true;
  if (par.isLogicalExpression() && par.node.right === p.node) return true;
  return false;
};

function nameFor(expr, used, srcOf) {
  let base = "v";
  if (expr.type === "Identifier") base = expr.name;
  else if (expr.type === "MemberExpression" && !expr.computed) base = expr.property.name === "length" && expr.object.type !== "ThisExpression" ? (expr.object.property?.name || expr.object.name || "n") : expr.property.name;
  else if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression" && ["toFixed", "toLocaleString", "toPrecision", "join", "toUpperCase", "toLowerCase", "trim"].includes(expr.callee.property.name)) return nameFor(expr.callee.object, used, srcOf);
  base = String(base).replace(/[^\w]/g, "") || "v";
  if (/^\d/.test(base)) base = "v" + base;
  const code = srcOf(expr);
  if (used.has(base) && used.get(base) !== code) { let i = 2; while (used.has(base + i) && used.get(base + i) !== code) i++; base += i; }
  used.set(base, code);
  return base;
}

// source of a node with its nested text literals translated (only in text positions)
function translatedSource(node, nodePath) {
  const inner = [];
  nodePath.traverse({
    StringLiteral(p) { if (hasWords(p.node.value) && isTextPosition(p)) { inner.push([p.node.start, p.node.end, `tr(${JSON.stringify(p.node.value)})`]); usesTr = true; keys.add(p.node.value); } },
    TemplateLiteral(p) {
      if (!isTextPosition(p)) return;
      const r = templateCall(p.node, p);
      if (r) { inner.push([p.node.start, p.node.end, `tr(${r})`]); usesTr = true; p.skip(); }
    },
  });
  let out = src.slice(node.start, node.end);
  for (const [s, e, r] of inner.sort((a, b) => b[0] - a[0])) out = out.slice(0, s - node.start) + r + out.slice(e - node.start);
  return out;
}

// `a ${x} b` -> '"a {x} b", { x: … }' (the argument list of t / tr / notice), or null if it has no words
function templateCall(node, nodePath) {
  const cooked = node.quasis.map((q) => q.value.cooked);
  if (!hasWords(cooked.join(""))) return null;
  const used = new Map(), vars = [];
  let key = cooked[0];
  node.expressions.forEach((expr, i) => {
    const exprPath = nodePath.get(`expressions.${i}`);
    const name = nameFor(expr, used, (e) => src.slice(e.start, e.end));
    const code = translatedSource(expr, exprPath);
    if (!vars.some((v) => v.name === name)) vars.push({ name, code });
    key += `{${name}}` + cooked[i + 1];
  });
  keys.add(key);
  if (!vars.length) return JSON.stringify(key);
  return `${JSON.stringify(key)}, { ${vars.map((v) => (v.code === v.name ? v.name : `${v.name}: ${v.code}`)).join(", ")} }`;
}

// text in place inside an expression that stays as it is (its template has no words of its own, or it is a + chain)
function translateInside(p) {
  const code = translatedSource(p.node, p);
  if (code !== src.slice(p.node.start, p.node.end)) edits.push([p.node.start, p.node.end, code]);
}

function convertItem(p) {
  const n = p.node;
  if (n.type === "StringLiteral" && hasWords(n.value)) { edits.push([n.start, n.end, `notice(${JSON.stringify(n.value)})`]); keys.add(n.value); usesNotice = true; return; }
  if (n.type === "TemplateLiteral") {
    const r = templateCall(n, p);
    if (r) { edits.push([n.start, n.end, `notice(${r})`]); usesNotice = true; }
    else n.expressions.forEach((_, i) => translateInside(p.get(`expressions.${i}`))); // `${name}: ${said || "no pick changed"}`
    return;
  }
  if (n.type === "ConditionalExpression") { convertItem(p.get("consequent")); convertItem(p.get("alternate")); return; } // cond ? `A` : `B`
  if (n.type === "BinaryExpression" && n.operator === "+") { // `…` + "…": each text part translated, the result stays a string
    for (const side of ["left", "right"]) {
      const sp = p.get(side), sn = sp.node;
      if (sn.type === "StringLiteral" && hasWords(sn.value)) { edits.push([sn.start, sn.end, `tr(${JSON.stringify(sn.value)})`]); keys.add(sn.value); usesTr = true; }
      else if (sn.type === "TemplateLiteral") { const r = templateCall(sn, sp); if (r) { edits.push([sn.start, sn.end, `tr(${r})`]); usesTr = true; } }
      else if (sn.type === "BinaryExpression") convertItem(sp);
      else translateInside(sp);
    }
    return;
  }
  if (n.type === "CallExpression" && n.callee.type === "Identifier" && ["errorNotice", "infoNotice"].includes(n.callee.name) && n.arguments.length === 1) {
    const a = n.arguments[0], ap = p.get("arguments.0");
    if (a.type === "StringLiteral" && hasWords(a.value)) { edits.push([a.start, a.end, `tr(${JSON.stringify(a.value)})`]); keys.add(a.value); usesTr = true; }
    else if (a.type === "TemplateLiteral") { const r = templateCall(a, ap); if (r) { edits.push([a.start, a.end, `tr(${r})`]); usesTr = true; } }
  }
}

traverse(ast, {
  CallExpression(p) {
    const c = p.node.callee;
    if (!(c.type === "Identifier" && c.name === "setNotices") && !(c.type === "MemberExpression" && c.property.name === "setNotices")) return;
    const arg = p.get("arguments.0");
    if (!arg?.node) return;
    let arr = null;
    if (arg.isArrowFunctionExpression() && arg.get("body").isArrayExpression()) arr = arg.get("body");
    else if (arg.isArrayExpression()) arr = arg;
    if (!arr) return;
    arr.get("elements").forEach((el) => { if (el.node && el.node.type !== "SpreadElement") convertItem(el); });
  },
});

edits.sort((a, b) => b[0] - a[0]);
for (let i = 1; i < edits.length; i++) if (edits[i][1] > edits[i - 1][0]) throw new Error("overlapping edits near " + edits[i][0]);
let out = src;
for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);

// imports: tr from lib/i18n.js, notice from lib/notices.js (relative to this file)
const rel = (target) => { let r = path.relative(path.dirname(file), path.join("src/lib", target)).replace(/\\/g, "/"); return r.startsWith(".") ? r : "./" + r; };
const addImport = (line) => { const m = [...out.matchAll(/^import [^;]*;[^\n]*$/gm)].pop(); out = m ? out.slice(0, m.index + m[0].length) + "\n" + line + out.slice(m.index + m[0].length) : line + "\n" + out; };
if (usesTr && !/import \{[^}]*\bt as tr\b[^}]*\} from "[^"]*lib\/i18n\.js"/.test(out)) {
  if (/\btr\s*=|function tr\b|\(tr\)/.test(out)) throw new Error(`${file}: tr is already a local name; import it under another name by hand`);
  addImport(`import { t as tr } from "${rel("i18n.js")}"; // TASKS.csv #786`);
}
if (usesNotice && !/import \{[^}]*\bnotice\b[^}]*\} from "[^"]*notices\.js"/.test(out)) {
  const m = out.match(/import \{([^}]*)\} from "([^"]*notices\.js)";/);
  if (m) out = out.replace(m[0], `import {${m[1].replace(/\s*$/, "")}, notice } from "${m[2]}";`);
  else addImport(`import { notice } from "${rel("notices.js")}"; // TASKS.csv #786`);
}
if (!dry) fs.writeFileSync(file, out);
process.stderr.write(`${file}: ${edits.length} notice edits, ${keys.size} keys\n`);
for (const k of keys) console.log(JSON.stringify(k));
