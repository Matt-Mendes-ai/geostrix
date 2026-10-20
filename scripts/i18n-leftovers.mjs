// TASKS.csv #786 — after scripts/i18n-wrap.mjs: list English text that is still rendered untranslated inside JSX children —
// string / template literals with words inside a {…} child expression (ternaries, &&, template parts), not inside a
// t / tr / tx call. These are the fragments that would show English in the middle of a translated sentence.
// usage: node scripts/i18n-leftovers.mjs <file> [startLine endLine] [--fix]   (--fix wraps the plain string ones in tr(); templates
// with ${} parts are listed for a hand rewrite into tr("… {n} …", { n }))
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
  return p.isStringLiteral() && /^[a-z][a-zA-Z0-9_-]*$/.test(p.node.value);
};
const inTranslation = (p) => { for (let q = p.parentPath; q; q = q.parentPath) { if (q.isCallExpression() && ["t", "tr", "tx"].includes(q.node.callee.name)) return true; if (q.isJSXExpressionContainer()) return false; } return false; };
const childOfJsx = (p) => { for (let q = p.parentPath; q; q = q.parentPath) { if (q.isJSXExpressionContainer()) return q.parentPath.isJSXElement() || q.parentPath.isJSXFragment(); if (q.isJSXAttribute() || q.isFunction()) return false; } return false; };
traverse(ast, {
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
    hits.push(`${n.loc.start.line}: \`${text.slice(0, 90)}\``);
  },
});
if (fix && edits.length) {
  let out = src;
  for (const [st, en, r] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, st) + r + out.slice(en);
  fs.writeFileSync(file, out);
  console.error(`${file}: wrapped ${edits.length} string fragment(s) in tr()`);
}
console.log(hits.join("\n"));
console.error(`${file}: ${hits.length} untranslated fragment(s)`);
