// TASKS.csv #786 — codemod: an English plural built from a translated word plus an "s" (JSX siblings
//   {tr("group")}{groups.length === 1 ? "" : "s"}   ->   {tr(groups.length === 1 ? "group" : "groups")}
// so each language gets two whole words ("sección"/"secciones", not "sección"+"s"). Also the ternary order "s" : "".
// usage: node scripts/i18n-plurals.mjs <file> [--dry]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const edits = [];
const trWord = (c) => c?.type === "JSXExpressionContainer" && c.expression.type === "CallExpression" && c.expression.callee.name === "tr" && c.expression.arguments.length === 1 && c.expression.arguments[0].type === "StringLiteral" ? c.expression.arguments[0].value : null;
const sSuffix = (c) => {
  if (c?.type !== "JSXExpressionContainer" || c.expression.type !== "ConditionalExpression") return null;
  const { test, consequent: a, alternate: b } = c.expression;
  if (a.type !== "StringLiteral" || b.type !== "StringLiteral") return null;
  if (a.value === "" && b.value === "s") return { test, pluralWhenTrue: false };
  if (a.value === "s" && b.value === "") return { test, pluralWhenTrue: true };
  return null;
};
traverse(ast, {
  JSXElement(p) { scan(p.node.children); },
  JSXFragment(p) { scan(p.node.children); },
});
function scan(children) {
  for (let i = 0; i + 1 < children.length; i++) {
    const word = trWord(children[i]), suf = sSuffix(children[i + 1]);
    if (word == null || !suf || /\s$/.test(word)) continue;
    const t = src.slice(suf.test.start, suf.test.end);
    const [one, many] = [word, word + "s"];
    const expr = suf.pluralWhenTrue ? `${t} ? ${JSON.stringify(many)} : ${JSON.stringify(one)}` : `${t} ? ${JSON.stringify(one)} : ${JSON.stringify(many)}`;
    edits.push([children[i].start, children[i + 1].end, `{tr(${expr})}`]);
    i++;
  }
}
let out = src;
for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
if (!process.argv.includes("--dry")) fs.writeFileSync(file, out);
console.error(`${file}: ${edits.length} plural(s) merged`);
