// TASKS.csv #786 — codemod: a translated sentence with an English plural ending passed in as a placeholder
//   tr("{n} hole{v} {v2} off the section", { n, v: n === 1 ? "" : "s", v2: n === 1 ? "is" : "are" })
// becomes two whole sentences, so each language writes its own singular and plural:
//   tr(n === 1 ? "{n} hole is off the section" : "{n} holes are off the section", { n })
// A placeholder qualifies when its value is `test ? "a" : "b"` with two short letter-only strings (≤ 4, e.g. "" / "s",
// "y" / "ies", "is" / "are") and at least one of them follows a letter in the key; every qualifying placeholder of a
// call must share the same test.
// usage: node scripts/i18n-plural-pairs.mjs <file> [--dry]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const code = (n) => src.slice(n.start, n.end);
const short = (n) => n.type === "StringLiteral" && /^[A-Za-z]{0,4}$/.test(n.value);
const edits = [];
traverse(ast, {
  CallExpression(p) {
    const n = p.node;
    if (n.callee.type !== "Identifier" || !["tr", "notice"].includes(n.callee.name)) return;
    const [lit, obj] = n.arguments;
    if (lit?.type !== "StringLiteral" || obj?.type !== "ObjectExpression") return;
    const forms = obj.properties.filter((pr) => pr.type === "ObjectProperty" && !pr.computed && pr.value.type === "ConditionalExpression" && short(pr.value.consequent) && short(pr.value.alternate));
    if (!forms.length) return;
    const name = (pr) => pr.key.name || pr.key.value;
    if (!forms.some((pr) => new RegExp(`[A-Za-z]\\{${name(pr)}\\}`).test(lit.value))) return;
    const test = code(forms[0].value.test);
    if (forms.some((pr) => code(pr.value.test) !== test)) return;
    const fill = (which) => forms.reduce((k, pr) => k.split(`{${name(pr)}}`).join(pr.value[which].value), lit.value);
    const rest = obj.properties.filter((pr) => !forms.includes(pr)).map(code);
    const args = `${test} ? ${JSON.stringify(fill("consequent"))} : ${JSON.stringify(fill("alternate"))}${rest.length ? `, { ${rest.join(", ")} }` : ""}`;
    edits.push([lit.start, obj.end, args]);
    console.log(fill("consequent"), "|", fill("alternate"));
  },
});
let out = src;
for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
if (!process.argv.includes("--dry")) fs.writeFileSync(file, out);
console.error(`${file}: ${edits.length} plural pair(s)`);
