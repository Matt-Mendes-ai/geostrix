// TASKS.csv #786 — codemod for messages built in library code (src/lib): wraps text in tr("… {name} …", { name }) ONLY in
// explicit message positions, because other English strings in src/lib are data (column aliases, codes, keys) and
// translating one of those would change what the code matches. Message positions:
//   pushIssue(issues, severity, category, holeId, MESSAGE)        (Data QC)
//   notes / warnings / messages / parts / reasons .push(MESSAGE)
//   note / message / warning / reason / detail = or += MESSAGE;   { note: MESSAGE, message: MESSAGE, … }
//   new Error(MESSAGE)
//   return MESSAGE  inside a function named …Note / …Text / …Advice / …Message / …Warning / …Summary
// A MESSAGE that is a ternary / && / + chain is followed into its parts. Placeholders and nested text as in
// scripts/i18n-notices.mjs. Adds `import { t as tr } from ".../i18n.js"` (refuses if tr is already a local name).
// usage: node scripts/i18n-lib.mjs <file> [--dry] [--only=errors]   (--only=errors: just new Error(…), e.g. in an exporter
// whose written file text must stay English)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const file = process.argv[2];
const dry = process.argv.includes("--dry");
const errorsOnly = process.argv.includes("--only=errors"); // exporters: their file text (provenance lines) stays English
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const isText = (s) => /[A-Za-z]{2}/.test(s) && /\s/.test(s.trim()); // a phrase, not a code or a key
const keys = new Set();
const edits = [];
let used = false;

const textPosition = (p) => {
  const par = p.parentPath;
  if (par.isConditionalExpression() && par.node.test !== p.node) return true;
  if (par.isLogicalExpression() && par.node.right === p.node) return true;
  return false;
};
function nameFor(expr, names) {
  let base = "v";
  if (expr.type === "Identifier") base = expr.name;
  else if (expr.type === "MemberExpression" && !expr.computed) base = expr.property.name === "length" ? (expr.object.property?.name || expr.object.name || "n") : expr.property.name;
  else if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression" && ["toFixed", "toLocaleString", "toPrecision", "join", "toUpperCase", "toLowerCase", "trim", "slice"].includes(expr.callee.property.name)) return nameFor(expr.callee.object, names);
  base = String(base).replace(/[^\w]/g, "") || "v";
  if (/^\d/.test(base)) base = "v" + base;
  const code = src.slice(expr.start, expr.end);
  if (names.has(base) && names.get(base) !== code) { let i = 2; while (names.has(base + i) && names.get(base + i) !== code) i++; base += i; }
  names.set(base, code);
  return base;
}
function inner(node, nodePath) {
  const ins = [];
  nodePath.traverse({
    StringLiteral(p) { if (isText(p.node.value) && textPosition(p)) { ins.push([p.node.start, p.node.end, `tr(${JSON.stringify(p.node.value)})`]); keys.add(p.node.value); used = true; } },
    TemplateLiteral(p) { if (!textPosition(p)) return; const r = call(p.node, p); if (r) { ins.push([p.node.start, p.node.end, `tr(${r})`]); used = true; p.skip(); } },
  });
  let out = src.slice(node.start, node.end);
  for (const [s, e, r] of ins.sort((a, b) => b[0] - a[0])) out = out.slice(0, s - node.start) + r + out.slice(e - node.start);
  return out;
}
function call(node, nodePath) {
  const cooked = node.quasis.map((q) => q.value.cooked);
  if (!isText(cooked.join(" x "))) return null;
  const names = new Map(), vars = [];
  let key = cooked[0];
  node.expressions.forEach((expr, i) => {
    const name = nameFor(expr, names);
    const code = inner(expr, nodePath.get(`expressions.${i}`));
    if (!vars.some((v) => v.name === name)) vars.push({ name, code });
    key += `{${name}}` + cooked[i + 1];
  });
  keys.add(key);
  return vars.length ? `${JSON.stringify(key)}, { ${vars.map((v) => (v.code === v.name ? v.name : `${v.name}: ${v.code}`)).join(", ")} }` : JSON.stringify(key);
}
function message(p) {
  const n = p?.node;
  if (!n) return;
  if (n.type === "StringLiteral" && isText(n.value)) { edits.push([n.start, n.end, `tr(${JSON.stringify(n.value)})`]); keys.add(n.value); used = true; return; }
  if (n.type === "TemplateLiteral") {
    const r = call(n, p);
    if (r) { edits.push([n.start, n.end, `tr(${r})`]); used = true; }
    else n.expressions.forEach((_, i) => { const ep = p.get(`expressions.${i}`); const code = inner(ep.node, ep); if (code !== src.slice(ep.node.start, ep.node.end)) edits.push([ep.node.start, ep.node.end, code]); });
    return;
  }
  if (n.type === "ConditionalExpression") { message(p.get("consequent")); message(p.get("alternate")); return; }
  if (n.type === "LogicalExpression") { message(p.get("right")); return; }
  if (n.type === "BinaryExpression" && n.operator === "+") { message(p.get("left")); message(p.get("right")); return; }
  if (n.type === "ArrayExpression") { p.get("elements").forEach(message); return; } // [`…`, cond ? `…` : null].filter(Boolean).join(" ")
  if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && ["join", "filter", "concat", "trim"].includes(n.callee.property.name)) message(p.get("callee.object"));
}
const MSG_NAME = /^(note|notes|message|msg|warning|reason|detail)$/i; // not text / name / label: those also hold data (layout element text, default names)
const LIST_NAME = /^(notes|warnings|messages|parts|reasons|lines|msgs|bits)$/i;
const FN_NAME = /(Note|Text|Advice|Message|Warning|Summary)$/;
traverse(ast, {
  CallExpression(p) {
    if (errorsOnly) return;
    const c = p.node.callee;
    if (c.type === "Identifier" && c.name === "pushIssue") { message(p.get("arguments.4")); return; }
    // a component's message state: setMsg("…"), setError(`…`), setNote({ ok, text: "…" })
    if (c.type === "Identifier" && /^set\w*(Msg|Message|Error|Err|Note|Notice|Status|Warning|Info|Hint)$/.test(c.name)) {
      const a0 = p.get("arguments.0");
      if (a0?.node?.type === "ObjectExpression") a0.get("properties").forEach((pp) => { if (pp.isObjectProperty() && ["text", "message", "msg"].includes(pp.node.key.name)) message(pp.get("value")); });
      else message(a0);
      return;
    }
    if (c.type === "MemberExpression" && c.property.name === "push" && LIST_NAME.test(c.object.name || c.object.property?.name || "")) p.get("arguments").forEach(message);
  },
  NewExpression(p) { if (p.node.callee.type === "Identifier" && /Error$/.test(p.node.callee.name)) message(p.get("arguments.0")); },
  AssignmentExpression(p) {
    if (errorsOnly) return;
    const l = p.node.left, nm = l.type === "Identifier" ? l.name : l.type === "MemberExpression" && !l.computed ? l.property.name : "";
    if (MSG_NAME.test(nm) && ["=", "+="].includes(p.node.operator)) message(p.get("right"));
  },
  VariableDeclarator(p) { if (!errorsOnly && p.node.id.type === "Identifier" && MSG_NAME.test(p.node.id.name)) message(p.get("init")); },
  ObjectProperty(p) {
    if (errorsOnly) return;
    const k = p.node.key, nm = k.type === "Identifier" ? k.name : k.type === "StringLiteral" ? k.value : "";
    if (MSG_NAME.test(nm) && !p.node.computed) message(p.get("value"));
  },
  ReturnStatement(p) {
    if (errorsOnly) return;
    const fn = p.getFunctionParent();
    const nm = fn?.node.id?.name || (fn?.parentPath.isVariableDeclarator() ? fn.parentPath.node.id.name : "");
    if (nm && FN_NAME.test(nm)) message(p.get("argument"));
  },
});
edits.sort((a, b) => b[0] - a[0]);
const kept = [];
for (const e of edits) { if (kept.length && e[1] > kept[kept.length - 1][0]) continue; kept.push(e); } // an outer message already took its parts
let out = src;
for (const [s, e, r] of kept) out = out.slice(0, s) + r + out.slice(e);
if (used && !/import \{[^}]*\bt as tr\b[^}]*\} from "[^"]*i18n\.js"/.test(out)) {
  if (/\btr\s*=|function tr\b|\(tr[,)]|\btr\s*=>/.test(src)) throw new Error(`${file}: tr is already a local name — rename it first`);
  let rel = path.relative(path.dirname(file), "src/lib/i18n.js").replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  const m = [...out.matchAll(/^import [^;]*;[^\n]*$/gm)].pop();
  const line = `import { t as tr } from "${rel}"; // TASKS.csv #786 — messages in the interface language`;
  out = m ? out.slice(0, m.index + m[0].length) + "\n" + line + out.slice(m.index + m[0].length) : line + "\n" + out;
}
if (!dry) fs.writeFileSync(file, out);
process.stderr.write(`${file}: ${kept.length} edits, ${keys.size} keys\n`);
for (const k of keys) console.log(JSON.stringify(k));
