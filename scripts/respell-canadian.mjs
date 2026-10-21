// Canadian spelling in UI text (CLAUDE.md conventions): colour, centre, favourite, neighbour, behaviour, honour, grey,
// but -ize: recognize, normalize, realization, magnetization… Only text a person reads is touched — the first argument
// of t / tr / tx / notice (and ternary branches inside it), JSX text and text attributes (title, aria-label,
// placeholder, label, text, headline, …). Words that are also code (color, center, equalise) are changed ONLY there;
// the unambiguous -ise words are also changed in other message strings. Never object keys, compared values or imports.
// usage: node scripts/respell-canadian.mjs <file>… [--dry]  — also respells the keys of src/locales/*.json (the English
// text is the key) when run with --locales, keeping their translations.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const UI_ONLY = { Color: "Colour", color: "colour", Colors: "Colours", colors: "colours", Center: "Centre", center: "centre", Equalise: "Equalize", equalised: "equalized", Grayscale: "Greyscale", gray: "grey", Gray: "Grey" };
const ANY_TEXT = {
  Analyse: "Analyze", Favorites: "Favourites", favorites: "favourites", favorite: "favourite", Honor: "Honour", honor: "honour",
  behavior: "behaviour", neighbor: "neighbour", neighbors: "neighbours", neighboring: "neighbouring",
  Magnetisation: "Magnetization", magnetisation: "magnetization", magnetised: "magnetized", Realisations: "Realizations",
  realisation: "realization", realisations: "realizations", Unrecognised: "Unrecognized", unrecognised: "unrecognized",
  recognise: "recognize", recognised: "recognized", recognises: "recognizes", discretisation: "discretization",
  mineralisation: "mineralization", Mineralisation: "Mineralization", mineralised: "mineralized", minimises: "minimizes",
  minimise: "minimize", normalised: "normalized", normalise: "normalize", regularisation: "regularization",
  visualisation: "visualization", visualise: "visualize", Visualise: "Visualize", summarise: "summarize",
};
const ALL = { ...UI_ONLY, ...ANY_TEXT };
const words = (map) => new RegExp(`\\b(${Object.keys(map).join("|")})\\b`, "g");
export const respell = (s, map = ALL) => (Object.keys(map).length ? s.replace(words(map), (w) => map[w]) : s);
const TEXT_ATTRS = new Set(["title", "aria-label", "placeholder", "label", "alt", "text", "headline", "actionLabel", "actionTitle", "footnote", "defaultText", "confirmLabel", "disabledReason", "aria-description"]);
const TR = new Set(["t", "tr", "tx", "notice", "errorNotice", "infoNotice"]);

function uiContext(p) {
  for (let q = p.parentPath, child = p; q; child = q, q = q.parentPath) {
    if (q.isCallExpression() && q.node.callee.type === "Identifier" && TR.has(q.node.callee.name)) return q.node.arguments[0] === child.node || child.isConditionalExpression() || child.isLogicalExpression();
    if (q.isJSXAttribute()) return TEXT_ATTRS.has(q.node.name.name);
    if (q.isConditionalExpression() || q.isLogicalExpression() || q.isJSXExpressionContainer() || q.isTemplateLiteral() || (q.isBinaryExpression() && q.node.operator === "+")) continue;
    return false;
  }
  return false;
}
function notCode(p) {
  const par = p.parentPath;
  if (par.isObjectProperty() && par.node.key === p.node) return false;
  if (par.isBinaryExpression() && ["===", "!==", "==", "!="].includes(par.node.operator)) return false;
  if (par.isImportDeclaration() || par.isExportAllDeclaration() || par.isExportNamedDeclaration()) return false;
  if (par.isCallExpression() && par.node.callee.type === "MemberExpression" && ["includes", "startsWith", "endsWith", "indexOf", "test", "match", "get", "has", "querySelector"].includes(par.node.callee.property.name)) return false;
  return true;
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
let total = 0;
for (const file of args.filter((a) => !a.startsWith("--"))) {
  const src = fs.readFileSync(file, "utf8");
  let ast;
  try { ast = parse(src, { sourceType: "module", plugins: ["jsx"] }); } catch { continue; }
  const edits = [];
  const visit = (node, text, quote, p) => {
    const map = uiContext(p) || p.isJSXText() ? ALL : notCode(p) && /\s/.test(text) ? ANY_TEXT : null;
    if (!map) return;
    const out = respell(text, map);
    if (out !== text) edits.push([node.start + quote, node.end - quote, out]);
  };
  traverse(ast, {
    StringLiteral(p) { const raw = src.slice(p.node.start + 1, p.node.end - 1); visit(p.node, raw, 1, p); },
    JSXText(p) { visit(p.node, p.node.value, 0, p); },
    TemplateElement(p) { const raw = p.node.value.raw; const out = respell(raw, uiContext(p.parentPath) ? ALL : notCode(p.parentPath) ? ANY_TEXT : {}); if (out !== raw) edits.push([p.node.start, p.node.end, out]); },
  });
  if (!edits.length) continue;
  let out = src;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  total += edits.length;
  console.log(`${file}: ${edits.length}`);
  if (!dry) fs.writeFileSync(file, out);
}
if (args.includes("--locales")) {
  for (const lang of fs.readdirSync("src/locales").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))) {
    const p = `src/locales/${lang}.json`;
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    const o = {};
    let n = 0;
    for (const [k, v] of Object.entries(d)) { const k2 = respell(k); if (k2 !== k) n++; if (!(k2 in o) || k2 === k) o[k2] = v; }
    if (!dry) fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
    console.log(`${p}: ${n} key(s) respelled`);
  }
}
console.error(`${total} string(s) respelled`);
