// TASKS.csv #786 — after scripts/i18n-wrap.mjs: list English text that is still rendered untranslated inside JSX children —
// string / template literals with words inside a {…} child expression (ternaries, &&, template parts), not inside a
// t / tr / tx call. These are the fragments that would show English in the middle of a translated sentence.
// Also checks text attributes (title / aria-label / placeholder / label / alt / text / headline) written as expressions.
// usage: node scripts/i18n-leftovers.mjs <file> [startLine endLine] [--fix]   (--fix wraps the plain string ones in tr() and turns
// templates into tr("… {name} …", { name: expr }); afterwards check any word{v} plural by hand — "+s" is wrong for many
// Spanish / Portuguese words)
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const [file, a, b] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const fix = process.argv.includes("--fix");
const edits = [];
const from = a ? Number(a) : 1, to = b ? Number(b) : Infinity;
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const words = (s) => /[A-Za-z]{2,}[^]*\s[^]*[A-Za-z]|^\s*\(?[a-z]{3,}/.test(s) || /^[ (]?[A-Za-z]{3,}/.test(s);
const hits = [];
// not text: a compared value (toolPane === "fence"), one lowercase token ("model", "slab"), a pane title (TaskPaneHeader
// translates it), an argument to a function that is not rendering text (e.g. openRowMenu labels are handled by the codemod)
const notText = (p) => {
  const par = p.parentPath;
  if (par.isBinaryExpression() && ["===", "!==", "==", "!="].includes(par.node.operator)) return true;
  if (par.isCallExpression() && par.node.callee.type === "Identifier" && ["paneHeader", "setToolPane", "toggle", "includes"].includes(par.node.callee.name)) return true;
  if (par.isCallExpression() && par.node.callee.type === "MemberExpression") return true; // .includes("x"), .startsWith(...)
  if (p.isStringLiteral() && /^(rgba?|hsla?|var)\(|^#[0-9a-f]{3,8}$/i.test(p.node.value)) return true; // a colour, not text
  return p.isStringLiteral() && /^[a-z][a-zA-Z0-9_-]*$/.test(p.node.value);
};
const inTranslation = (p) => { for (let q = p.parentPath; q; q = q.parentPath) { if (q.isCallExpression() && ["t", "tr", "tx"].includes(q.node.callee.name)) return true; if (q.isJSXExpressionContainer()) return false; } return false; };
const TEXT_ATTRS = new Set(["title", "aria-label", "placeholder", "label", "alt", "text", "headline", "aria-description", "disabledReason"]);
const childOfJsx = (p) => {
  if (p.parentPath.isJSXAttribute()) return false; // a quoted attribute value: i18n-wrap's job, and tr() there is not valid JSX
  for (let q = p.parentPath; q; q = q.parentPath) {
    if (q.isJSXExpressionContainer()) {
      if (q.parentPath.isJSXElement() || q.parentPath.isJSXFragment()) return true;
      if (q.parentPath.isJSXAttribute()) { const nm = q.parentPath.node.name.name, owner = q.parentPath.parentPath.node.name?.name || ""; return TEXT_ATTRS.has(nm) && !/^Ribbon|^TaskPaneHeader$/.test(owner); }
      return false;
    }
    if (q.isFunction()) return false;
  }
  return false;
};
// a template -> the argument list of tr(): "key with {names}", { names: expressions } (nested text in ternary branches wrapped)
const textPos = (p) => { const par = p.parentPath; return (par.isConditionalExpression() && par.node.test !== p.node) || (par.isLogicalExpression() && par.node.right === p.node); };
function nameFor(expr, names) {
  let base = "v";
  if (expr.type === "Identifier") base = expr.name;
  else if (expr.type === "MemberExpression" && !expr.computed) base = expr.property.name === "length" ? (expr.object.property?.name || expr.object.name || "n") : expr.property.name;
  else if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression" && ["toFixed", "toLocaleString", "toPrecision", "join", "toUpperCase", "toLowerCase", "trim"].includes(expr.callee.property.name)) return nameFor(expr.callee.object, names);
  base = String(base).replace(/[^\w]/g, "") || "v";
  if (/^\d/.test(base)) base = "v" + base;
  const code = src.slice(expr.start, expr.end);
  if (names.has(base) && names.get(base) !== code) { let i = 2; while (names.has(base + i) && names.get(base + i) !== code) i++; base += i; }
  names.set(base, code);
  return base;
}
function innerSource(node, nodePath) {
  const ins = [];
  nodePath.traverse({
    StringLiteral(q) { if (words(q.node.value) && !notText(q) && textPos(q)) ins.push([q.node.start, q.node.end, `tr(${JSON.stringify(q.node.value)})`]); },
    TemplateLiteral(q) { if (!textPos(q)) return; const r = templateArgs(q.node, q); if (r) { ins.push([q.node.start, q.node.end, `tr(${r})`]); q.skip(); } },
  });
  let out = src.slice(node.start, node.end);
  for (const [s0, e0, r] of ins.sort((x, y) => y[0] - x[0])) out = out.slice(0, s0 - node.start) + r + out.slice(e0 - node.start);
  return out;
}
function templateArgs(node, nodePath) {
  const cooked = node.quasis.map((q) => q.value.cooked);
  if (!words(cooked.join(" "))) return null;
  const names = new Map(), vars = [];
  let key = cooked[0];
  node.expressions.forEach((expr, i) => {
    const name = nameFor(expr, names), code = innerSource(expr, nodePath.get(`expressions.${i}`));
    if (!vars.some((v) => v.name === name)) vars.push({ name, code });
    key += `{${name}}` + cooked[i + 1];
  });
  return vars.length ? `${JSON.stringify(key)}, { ${vars.map((v) => (v.code === v.name ? v.name : `${v.name}: ${v.code}`)).join(", ")} }` : JSON.stringify(key);
}
traverse(ast, {
  // plain JSX text the wrap codemod left (it skips text that starts lowercase, e.g. SVG labels "albite"); listed only, never fixed
  JSXText(p) {
    const n = p.node, v = n.value.trim();
    if (n.loc.start.line < from || n.loc.start.line > to || !/[A-Za-z]{3,}/.test(v)) return;
    hits.push(`${n.loc.start.line}: text ${JSON.stringify(v).slice(0, 90)}`);
  },
  StringLiteral(p) {
    const n = p.node;
    if (n.loc.start.line < from || n.loc.start.line > to) return;
    if (!words(n.value) || notText(p) || inTranslation(p) || !childOfJsx(p)) return;
    if (p.parentPath.isObjectProperty() && p.parentPath.node.key === n) return;
    if (fix) { edits.push([n.start, n.end, `tr(${JSON.stringify(n.value)})`]); return; }
    hits.push(`${n.loc.start.line}: ${JSON.stringify(n.value).slice(0, 90)}`);
  },
  TemplateLiteral(p) {
    const n = p.node;
    if (n.loc.start.line < from || n.loc.start.line > to) return;
    const text = n.quasis.map((q) => q.value.cooked).join("{}");
    if (!words(text.replace(/\{\}/g, "")) || inTranslation(p) || !childOfJsx(p)) return;
    if (fix) { const r = templateArgs(n, p); if (r) { edits.push([n.start, n.end, `tr(${r})`]); p.skip(); return; } }
    hits.push(`${n.loc.start.line}: \`${text.slice(0, 90)}\``);
  },
});
if (fix && edits.length) {
  let out = src;
  const kept = [];
  for (const e of edits.sort((x, y) => y[0] - x[0])) { if (kept.length && e[1] > kept[kept.length - 1][0]) continue; kept.push(e); } // nested: the outer one took it
  for (const [st, en, r] of kept) out = out.slice(0, st) + r + out.slice(en);
  fs.writeFileSync(file, out);
  console.error(`${file}: wrapped ${edits.length} string fragment(s) in tr()`);
}
console.log(hits.join("\n"));
console.error(`${file}: ${hits.length} untranslated fragment(s)`);
