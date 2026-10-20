// TASKS.csv #786 — codemod for the translation work: wrap user-visible JSX text and text attributes in tr("...").
// usage: node scripts/i18n-wrap.mjs <file> [startLine endLine] [--dry] [--fn=tr]   -> prints the new keys as JSON, one per line.
// The file must import { t as tr } from lib/i18n.js (tr, because t is a common local name). Afterwards: sentences split by
// inline elements read badly in other word orders — rewrite those with tx("... {slot} ...", { slot: <b>..</b> }), and
// English plural / concatenation code next to a wrapped fragment with a whole-sentence tr("... {n} ...", { n }).
// Rules: JSXText (React's whitespace rules: the rendered string is the key; spaces that render become {" "}),
// string attributes title / aria-label / placeholder / alt / text / headline / actionLabel / actionTitle / footnote / label
// (not on Ribbon* elements, which translate internally), and `label:` strings in openRowMenu([...]) item lists.
// Skipped: no letters, inside svg / code / kbd / style / pre, template literals with expressions, already-wrapped.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const [file, a, b] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const dry = process.argv.includes("--dry");
const FN = process.argv.find((x) => x.startsWith("--fn="))?.slice(5) || "tr";
const from = a ? Number(a) : 1, to = b ? Number(b) : Infinity;
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"], ranges: true });
const ATTRS = new Set(["title", "aria-label", "placeholder", "alt", "text", "headline", "actionLabel", "actionTitle", "footnote", "label", "aria-description", "disabledReason"]);
const SKIP_PARENTS = new Set(["svg", "code", "kbd", "style", "pre", "text", "tspan", "g", "path", "option-raw"]);
const edits = [], keys = new Set();
const inRange = (n) => n.loc.start.line >= from && n.loc.end.line <= to;
const hasLetters = (s) => /[A-Za-zÀ-ÿ]{2}/.test(s);
const elName = (p) => { const n = p.node.openingElement?.name; return n?.type === "JSXIdentifier" ? n.name : n?.type === "JSXMemberExpression" ? n.property.name : ""; };
const underSkipped = (path) => { for (let p = path.parentPath; p; p = p.parentPath) if (p.isJSXElement() && SKIP_PARENTS.has(elName(p))) return true; return false; };
function cleanJSX(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) last = i; });
  let out = "";
  lines.forEach((line, i) => {
    let s = line.replace(/\t/g, " ");
    if (i !== 0) s = s.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) s = s.replace(/[ ]+$/, "");
    if (s) { if (i !== last) s += " "; out += s; }
  });
  return out;
}
const call = (k) => `${FN}(${JSON.stringify(k)})`;
traverse(ast, {
  JSXText(path) {
    const n = path.node;
    if (!inRange(n) || underSkipped(path)) return;
    const str = cleanJSX(n.value);
    const core = str.trim();
    if (!hasLetters(core)) return;
    const lead = /^\s/.test(str) ? '{" "}' : "", trail = /\s$/.test(str) ? '{" "}' : "";
    edits.push([n.start, n.end, `${lead}{${call(core)}}${trail}`]); keys.add(core);
  },
  JSXAttribute(path) {
    const n = path.node;
    if (!inRange(n) || n.name.type !== "JSXIdentifier" || !ATTRS.has(n.name.name)) return;
    const owner = path.parentPath.node.name;
    const ownerName = owner?.type === "JSXIdentifier" ? owner.name : "";
    if (/^Ribbon/.test(ownerName) || ownerName === "TaskPaneHeader") return; // translated inside
    if (["svg", "text", "path", "rect", "circle", "g", "line", "polyline", "image"].includes(ownerName) && n.name.name !== "aria-label") return;
    let v = n.value, lit = null;
    if (v?.type === "StringLiteral") lit = v;
    else if (v?.type === "JSXExpressionContainer" && v.expression.type === "StringLiteral") lit = v.expression;
    else if (v?.type === "JSXExpressionContainer" && v.expression.type === "TemplateLiteral" && v.expression.expressions.length === 0) lit = { value: v.expression.quasis[0].value.cooked, start: v.expression.start, end: v.expression.end };
    if (!lit || !hasLetters(lit.value)) return;
    const key = lit.value.replace(/\s+/g, " ").trim();
    edits.push([v.start, v.end, `{${call(key)}}`]); keys.add(key);
  },
  CallExpression(path) {
    const n = path.node;
    if (!inRange(n) || n.callee.type !== "Identifier" || n.callee.name !== "openRowMenu") return;
    path.traverse({
      ObjectProperty(p) {
        const k = p.node.key, v = p.node.value;
        if ((k.name === "label" || k.value === "label") && v.type === "StringLiteral" && hasLetters(v.value)) { edits.push([v.start, v.end, call(v.value)]); keys.add(v.value); }
      },
    });
  },
});
edits.sort((x, y) => y[0] - x[0]);
for (let i = 1; i < edits.length; i++) if (edits[i][1] > edits[i - 1][0]) throw new Error("overlapping edits at " + edits[i][0]);
let out = src;
for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
if (!dry) fs.writeFileSync(file, out);
process.stderr.write(`${file}: ${edits.length} edits, ${keys.size} keys\n`);
for (const k of keys) console.log(JSON.stringify(k));
