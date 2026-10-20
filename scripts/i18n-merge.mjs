// TASKS.csv #786 — codemod: after i18n-wrap.mjs, a sentence with numbers or names in it is left as fragments
//   {tr("The data plot down to")}{" "}{deep}{" "}{tr("m (pseudo-depth: …).")}
// which cannot be reordered for Spanish / Portuguese. This merges each run of JSX children made only of tr("…") calls,
// {" "} spacers, plain text and value expressions (no elements) into ONE sentence:
//   {tr("The data plot down to {deep} m (pseudo-depth: …).", { deep })}
// A run needs at least one tr() literal and one value. A value that is itself a ternary of translated branches stays a
// placeholder (its branches are still translated). Runs whose placeholder names would clash with a tr() call's own
// variables are left alone.
// usage: node scripts/i18n-merge.mjs <file> [--dry]   -> prints each merged key
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const edits = [];
const code = (n) => src.slice(n.start, n.end);

// React's JSXText rule: lines trimmed, blank lines dropped, joined by one space (text without a newline is kept as is)
const jsxText = (v) => (v.includes("\n") ? v.split("\n").map((l, i, a) => (i === 0 ? l.replace(/\s+$/, "") : i === a.length - 1 ? l.replace(/^\s+/, "") : l.trim())).filter(Boolean).join(" ") : v);
const isTrLiteral = (e) => e.type === "CallExpression" && e.callee.type === "Identifier" && e.callee.name === "tr" && e.arguments[0]?.type === "StringLiteral" && (e.arguments.length === 1 || (e.arguments.length === 2 && e.arguments[1].type === "ObjectExpression"));
const isSpacer = (e) => e.type === "StringLiteral" && /^\s*$/.test(e.value);

function nameFor(expr, names) {
  let base = "v";
  if (expr.type === "Identifier") base = expr.name;
  else if (expr.type === "MemberExpression" && !expr.computed) base = expr.property.name === "length" ? (expr.object.property?.name || expr.object.name || "n") : expr.property.name;
  else if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression" && ["toFixed", "toLocaleString", "toPrecision", "join", "toUpperCase", "toLowerCase", "trim"].includes(expr.callee.property.name)) return nameFor(expr.callee.object, names);
  base = String(base).replace(/[^\w]/g, "") || "v";
  if (/^\d/.test(base)) base = "v" + base;
  const c = code(expr);
  if (names.has(base) && names.get(base) !== c) { let i = 2; while (names.has(base + i) && names.get(base + i) !== c) i++; base += i; }
  names.set(base, c);
  return base;
}

// a value's own English words (cond ? "longer" : "shorter") are wrapped in tr() too
function valueCode(e) {
  if (e.type === "StringLiteral" && /[A-Za-z]{3,}/.test(e.value)) return `tr(${JSON.stringify(e.value)})`;
  const ins = [];
  const walk = (n, parent) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "tr") return; // already translated
    if (n.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(n.operator)) return; // a compared value is not text
    if (n.type === "StringLiteral" && parent && /[A-Za-z]{3,}/.test(n.value)
      && ((parent.type === "ConditionalExpression" && parent.test !== n) || (parent.type === "LogicalExpression" && parent.right === n))) ins.push(n);
    for (const k of Object.keys(n)) {
      if (["loc", "start", "end", "extra", "leadingComments", "trailingComments"].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => walk(x, n)); else if (v && typeof v.type === "string") walk(v, n);
    }
  };
  walk(e, null);
  let out = code(e);
  for (const n of ins.sort((x, y) => y.start - x.start)) out = out.slice(0, n.start - e.start) + `tr(${JSON.stringify(n.value)})` + out.slice(n.end - e.start);
  return out;
}

function mergeRun(run) {
  // trim whitespace-only text at both ends
  while (run.length && run[0].type === "JSXText" && !jsxText(run[0].value).trim()) run.shift();
  while (run.length && run[run.length - 1].type === "JSXText" && !jsxText(run[run.length - 1].value).trim()) run.pop();
  const kinds = run.map((c) => (c.type === "JSXText" ? "text" : isTrLiteral(c.expression) ? "tr" : isSpacer(c.expression) ? "space" : "value"));
  if (!kinds.includes("tr") || !kinds.includes("value")) return;
  const names = new Map(), vars = [];
  const own = new Set(); // variables of tr("… {x} …", { x }) calls inside the run
  let key = "";
  for (let i = 0; i < run.length; i++) {
    const c = run[i], k = kinds[i];
    if (k === "text") key += jsxText(c.value);
    else if (k === "space") key += c.expression.value;
    else if (k === "tr") {
      const [lit, obj] = c.expression.arguments;
      key += lit.value;
      if (obj) for (const p of obj.properties) {
        if (p.type !== "ObjectProperty" || p.computed) return;
        const nm = p.key.name || p.key.value;
        if (own.has(nm) || names.has(nm)) return;
        own.add(nm); names.set(nm, code(p.value)); vars.push({ name: nm, code: code(p.value) });
      }
    } else {
      const e = c.expression;
      if (e.type === "JSXEmptyExpression") return;
      if (e.type === "StringLiteral" && !/[A-Za-z]/.test(e.value)) { key += e.value; continue; } // " · ", " — ": text, not a value
      const nm = nameFor(e, names);
      if (own.has(nm)) return;
      if (!vars.some((v) => v.name === nm)) vars.push({ name: nm, code: valueCode(e) });
      key += `{${nm}}`;
    }
  }
  if (/\{\w+\}\s*$/.test(key.trim()) && !/[A-Za-z]{2}/.test(key.replace(/\{\w+\}/g, ""))) return;
  const lead = key.match(/^\s*/)[0], trail = key.match(/\s*$/)[0];
  const body = key.trim();
  const args = `${JSON.stringify(body)}, { ${vars.map((v) => (v.code === v.name ? v.name : `${v.name}: ${v.code}`)).join(", ")} }`;
  const out = `${lead ? '{" "}' : ""}{tr(${args})}${trail ? '{" "}' : ""}`;
  edits.push([run[0].start, run[run.length - 1].end, out]);
  console.log(body);
}

function scan(children) {
  let run = [];
  const flush = () => { if (run.length) mergeRun(run); run = []; };
  for (const c of children) {
    if (c.type === "JSXText") { run.push(c); continue; }
    if (c.type === "JSXExpressionContainer") {
      const e = c.expression;
      // a value that renders elements (JSX, && / ternary with JSX, .map) ends the run
      let jsx = e.type === "JSXElement" || e.type === "JSXFragment";
      traverse(e, { noScope: true, enter(p) { if (p.isJSXElement() || p.isJSXFragment()) { jsx = true; p.stop(); } } }, null, {}, null);
      if (jsx || (e.type === "CallExpression" && e.callee.type === "MemberExpression" && e.callee.property.name === "map")) { flush(); continue; }
      run.push(c); continue;
    }
    flush();
  }
  flush();
}
traverse(ast, { JSXElement(p) { scan(p.node.children); }, JSXFragment(p) { scan(p.node.children); } });

let out = src;
const kept = [];
for (const e of edits.sort((a, b) => b[0] - a[0])) { if (kept.length && e[1] > kept[kept.length - 1][0]) continue; kept.push(e); }
for (const [s, e, r] of kept) out = out.slice(0, s) + r + out.slice(e);
if (!process.argv.includes("--dry")) fs.writeFileSync(file, out);
console.error(`${file}: ${kept.length} run(s) merged`);
