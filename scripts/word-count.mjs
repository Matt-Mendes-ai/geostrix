// TASKS.csv #3899 (Text and Help batch, T3) — counts the words a person is shown, per surface, the same way every time, so the rewording of #3899 can be
// measured and can only make the app shorter (test/wordinessRatchet3899.test.mjs reads this file's collect()).
//
// usage:  node scripts/word-count.mjs                       print the Markdown report
//         node scripts/word-count.mjs --json out.json --md out.md      write the JSON and Markdown reports
//         node scripts/word-count.mjs --update-baseline     lower test/wordcount-baseline.json to today's counts (refuses a surface that grew)
//         node scripts/word-count.mjs --update-baseline --allow-growth     also raise a surface (a deliberate new feature's words: say why in the commit)
//
// What is counted (a word = a run of letters or digits, [\p{L}\p{N}][\p{L}\p{N}'%/.-]*; a {placeholder} is not a word):
//  - Help, src/help/pages/*.js, by field: title, summary, notFor, a setting's name / what / choose, a warning's says / means / do, the walk-through steps.
//    TASKS.csv #3973 — a card page (one with `line`) counts K1-K5 only as seen first: title, line, cautions, the Use-instead chips, the key settings (label and gist),
//    the step strip; the rest of it is in its closed folds.
//    "Seen first" is everything except a field called `more` (on a page, a setting or a warning) and a walk-through marked `folded`: the text kept behind the Help pane's "More" fold, which
//    search still reads. Until a page has a `more` field, seen first = all.
//  - Every tr() string outside Help (the interface's own words; a tr is any call of the i18n.js export `t`, whatever it is imported as), and every tx()
//    string (lib/i18nRich.js: one translated sentence with bold / code parts in its {slots}; TASKS.csv #3939), in ONE of:
//      tooltips      a title={…} attribute (not InfoButton's)
//      info pop-ups  an InfoButton's text and title
//      notices       a message position: say / errorNotice / notify / alert / confirm / pushIssue arguments, new Error(…), .push(…) onto notes / warnings /
//                    messages / problems / issues / reasons / notices, a variable or property named …Note / …Msg / …Message / …Warning / …Notice / …Problem
//      interface     every other tr string, by working area (AREAS below, matched on the file's path, first match wins)
//    A string used in two places counts twice: it is shown in two places.
//    TASKS.csv #3939 — a string in the body of a closed fold (a <MoreFold> or a <details>, not its <summary> or an attribute) is "behind More":
//    left out of the surfaces above and counted apart (interfaceBehindMore), as Help's `more` is.
// Not counted: strings that are not translated (data, keys, codes), the locale files, Help bodies in other languages (there are none), a project's own text.
// Re-run it after any rewording; the "before" report of #3899 is the first run of this file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_FILE = path.join(ROOT, "test", "wordcount-baseline.json");
export const LONG_WORDS = 25; // a string over this is "long" (the limit for a notice or a tooltip, plan_fable.md 3.2)

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'%/.-]*/gu;
export const wordsOf = (s) => (String(s ?? "").replace(/\{[^{}]*\}/g, " ").match(WORD) || []).length;
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---- working areas (plan_fable.md 3.1): first match wins; matched on the file's path under src/ with forward slashes
export const AREAS = [
  ["Mine Design (hidden)", /(MineGrid|PitDesign|PitShell|NestedPits|Stopes?Pane|StopeRun|DesignLines|DesignStrings|DumpPane|DumpRun|UndergroundOre|mineDesign|[Mm]ineDesign)/],
  ["Basic path", /(StartDialogs|startChecklist|startFlow|ImportMapping|AssayImport|importPipeline|useImportPipeline|importHelpers|EmptyViewerBody|EmptyState|SampleButtons|SampleDownload|modules\/ViewerModule|viewer\/(sectionPayload|importSolid|exportSurface)\.js|viewer\/ViewerParts|StripLog|strip[Ll]og|SectionWindow|SectionEdit|SectionTabs|SectionLinePlan|SectionGeoref|viewer\/guided|lib\/guide\/|DataQC|dataQC|BestIntercepts|LayoutModule|[Ll]ayout|GenerateAtlas|CrsPicker|ProjectCrsModal|LocalGridPanel|DrillTableModal|TableColumnsModal|AttributeTable|ProjectReport|ProjectKmz|SaveRecovered|ReportProblem|ShortcutsModal|ExportToast|Ribbon|App\.jsx|HoleFilterBar|BrowserDock)/],
  ["Geophysics", /(GeophysicsModule|Inversion|Dcip|Tem(Pane|Invert)|FdemPane|MtSoundings|Levelling|DiurnalCorrection|GravityReduction|Hyperspectral|EqsGrid|SpectralIndex|potential|geophys|Geophys|McdAnomaly|MagneticsBox)/],
  ["Modelling", /(viewer\/panes\/|ModellingPanes|modellingRuns|useModelling|ModellingCodes|modellingSimple|GradeEstimation|VariogramModal|DomainsPanel|DomainCaps|DomainUpdate|domainUpdate|ExplicitSurface|EstimateCheck|shell[A-Z]|Shell[A-Z]|estimationShells|BlockCalculator|BlockModel|GradeTonnage|GradeThickness|LongSectionGT|SurfaceSolids|SurfaceTonnage|Sculpt|intrusion|StructFit|UnsampledChoice|EndInOre|TopCutNote|MetalAtRisk|MiningWidth|PlanModels|SolidTools|AlterationBox|VolcanicCodes|openUnitVolume|geomathModelling|SurfaceCompare|SurfaceImport|surfaceUndo|surfacePlacement|SurfacePlacement)/],
  ["Targeting, Maps, Geological Mapping", /(Predictive|PlannedHole|SurveyPlanner|UndrilledZones|EvidenceOverlay|Catchments|MapsModule|MapsPlanView|CartographyModule|RasterModule|SurfaceMapping|SurfaceGeology|SurfacePlanMap|UnitPolygon|MapModel|MapImport|MapRedraw|Basemap|AddWebLayer|Macrostrat|Georeferencer|LocatorMap|CoveringLayers|SpatialAnalysis|ZonalStats|LidarImport|TrendsPanel|InterpretPane|Interpret|interpret|ThresholdToolkit)/],
  ["Geochem", /(GeochemModule|Geochem|geochem|GradeStatistics|CorrelationMatrix|QAQC|QcPair|OxideTotals|LabCertificate|PublicGeochem|MethodPairs|TieScatter|HoleValueGrid|ElementBasis|calcElement|equivalentElement|EquivalentBuilder|assay[A-Z]|Assay[A-Z])/],
  ["Everything else (shared dialogs and library messages)", /.*/],
];
export const areaOf = (rel) => AREAS.find(([, re]) => re.test(rel))[0];

// ---- Help
// TASKS.csv #3973 — one page's words: add(kind, text, behindMore). A card page (`line`) shows K1-K5 only (title, line, cautions, the Use-instead chips,
// the key settings' labels and gists, the step strip); everything else is in its closed folds. Any other page: everything but `more` fields and a
// folded walk-through.
export function countHelpPage(p, add) {
  if (p.line) {
    const keys = new Set(p.keys || []);
    add("title", p.title); add("line", p.line);
    for (const s of p.cautions || []) add("caution", s);
    for (const x of p.instead || []) add("instead", `${x.text || ""} ${x.to || ""}`);
    for (const s of p.strip || []) add("strip", s);
    add("summary", p.summary, true); add("more", p.more, true);
    for (const s of p.notFor || []) add("notFor", s, true);
    for (const fl of p.fields || []) { const key = keys.has(fl.name); add("name", fl.name, !key); add("gist", fl.gist, !key); add("what", fl.what, true); add("choose", fl.choose, true); add("more", fl.more, true); }
    for (const w of p.warnings || []) { add("says", w.says, true); add("means", w.means, true); add("do", w.do, true); add("more", w.more, true); }
    for (const s of p.howto?.steps || []) add("howto", s, true);
    return;
  }
  add("title", p.title); add("summary", p.summary); add("more", p.more, true);
  for (const s of p.notFor || []) add("notFor", s);
  for (const fl of p.fields || []) { add("name", fl.name); add("what", fl.what); add("choose", fl.choose); add("more", fl.more, true); }
  for (const w of p.warnings || []) { add("says", w.says); add("means", w.means); add("do", w.do); add("more", w.more, true); }
  for (const s of p.howto?.steps || []) add("howto", s, !!p.howto.folded); // a folded walk-through is behind its closed heading
}
export async function collectHelp() {
  const dir = path.join(ROOT, "src", "help", "pages");
  const out = { pages: {}, fields: {}, seenFirst: 0, behindMore: 0, total: 0, settings: 0, warnings: 0, totalWithoutMineDesign: 0, seenFirstWithoutMineDesign: 0 };
  const add = (acc, kind, text, more) => { const n = wordsOf(text); if (!n) return; acc.total += n; acc.fields[kind] = (acc.fields[kind] || 0) + n; if (more) acc.more += n; else acc.first += n; };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    const pages = (await import(pathToFileURL(path.join(dir, f)).href)).default;
    const acc = { id: f.replace(/\.js$/, ""), topics: pages.length, settings: 0, warnings: 0, total: 0, first: 0, more: 0, fields: {}, mineDesign: pages.every((p) => p.area === "Mine Design") };
    for (const p of pages) {
      acc.settings += (p.fields || []).length; acc.warnings += (p.warnings || []).length;
      countHelpPage(p, (kind, text, more) => add(acc, kind, text, more)); // #3973
    }
    out.pages[acc.id] = acc;
    for (const [k, v] of Object.entries(acc.fields)) out.fields[k] = (out.fields[k] || 0) + v;
    out.total += acc.total; out.seenFirst += acc.first; out.behindMore += acc.more; out.settings += acc.settings; out.warnings += acc.warnings;
    if (!acc.mineDesign) { out.totalWithoutMineDesign += acc.total; out.seenFirstWithoutMineDesign += acc.first; }
  }
  return out;
}

// ---- interface strings
const NOTICE_CALLS = new Set(["say", "errorNotice", "notify", "notice", "pushNotice", "addNotice", "setNotice", "alert", "confirm", "flash", "toast"]);
const NOTICE_ARRAYS = /^(notes?|warnings?|messages?|problems?|issues?|reasons?|notices?)$/i;
const NOTICE_NAME = /(Note|Msg|Message|Warning|Notice|Problem)$|^(problem|problems|note|message|warning|notice)$/;
const calleeName = (c) => (c.type === "Identifier" ? c.name : c.type === "MemberExpression" && !c.computed ? c.property.name : null);
const objName = (c) => (c.type === "MemberExpression" ? (c.object.type === "Identifier" ? c.object.name : c.object.type === "MemberExpression" ? c.object.property.name : null) : null);

function stringsOf(node) { // the text pieces of a tr() first argument
  if (!node) return [];
  if (node.type === "StringLiteral") return [node.value];
  if (node.type === "TemplateLiteral") return [node.quasis.map((q) => q.value.cooked ?? "").join(" {} ")];
  if (node.type === "ConditionalExpression") return [...stringsOf(node.consequent), ...stringsOf(node.alternate)];
  return [];
}

function categoryOf(p) { // climb from a tr() call to the position it sits in
  for (let q = p.parentPath, depth = 0; q && depth < 14; q = q.parentPath, depth++) {
    const n = q.node;
    if (n.type === "JSXAttribute") {
      const el = q.parentPath.node.name, elName = el?.type === "JSXIdentifier" ? el.name : "";
      if (elName === "InfoButton" && (n.name.name === "text" || n.name.name === "title")) return "info";
      if (n.name.name === "title") return "tooltip";
      return "interface";
    }
    if (n.type === "JSXElement" || n.type === "JSXFragment") return "interface";
    if (n.type === "CallExpression" || n.type === "NewExpression") {
      const nm = calleeName(n.callee);
      if (n.type === "NewExpression" && nm === "Error") return "notice";
      if (nm && NOTICE_CALLS.has(nm) && n.callee.type === "Identifier") return "notice";
      if (nm === "pushIssue") return "notice";
      if (nm === "push" && NOTICE_ARRAYS.test(objName(n.callee) || "")) return "notice";
      if ((nm === "alert" || nm === "confirm" || nm === "prompt") && n.callee.type === "MemberExpression") return "notice";
    }
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && NOTICE_NAME.test(n.id.name)) return "notice";
    if (n.type === "AssignmentExpression" && n.left.type === "Identifier" && NOTICE_NAME.test(n.left.name)) return "notice";
    if (n.type === "ObjectProperty" && !n.computed && (n.key.name || n.key.value) && NOTICE_NAME.test(n.key.name || n.key.value)) return "notice";
    if (/Statement$|Declaration$|^Program$|Function/.test(n.type)) return "interface";
  }
  return "interface";
}

// TASKS.csv #3939 — is this call in the body of a closed fold? (MoreFold / details children; a summary or an attribute is seen first)
function behindFold(p) {
  let viaAttr = false;
  for (let q = p.parentPath; q; q = q.parentPath) {
    const n = q.node;
    if (n.type === "JSXAttribute") { viaAttr = true; continue; }
    if (n.type === "JSXElement") {
      const nm = n.openingElement.name, name = nm.type === "JSXIdentifier" ? nm.name : "";
      if (name === "summary") return false;
      if ((name === "MoreFold" || name === "details") && !viaAttr) return true;
      if (name === "SectionToolbarGroup" && !viaAttr) return true; // TASKS.csv #4070 — the Section window's folded toolbar groups
      viaAttr = false;
    }
    if (n.type === "FunctionDeclaration" || n.type === "Program") return false;
  }
  return false;
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "locales" || e.name === "help") continue; out.push(...listFiles(p)); } else if (/\.(jsx|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out.sort();
}

// the tr() strings of one file: [{ cat, text }] (cat: tooltip | info | notice | interface); [] for a file with no i18n import
export function trStringsOf(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!/i18n(Rich)?(\.js)?["']/.test(text)) return [];
  let ast;
  try { ast = parse(text, { sourceType: "module", plugins: ["jsx"] }); } catch { return []; }
  const names = new Set(), richNames = new Set();
  for (const n of ast.program.body) {
    if (n.type === "ImportDeclaration" && /\/i18n(\.js)?$/.test(n.source.value)) for (const s of n.specifiers) if (s.type === "ImportSpecifier" && s.imported.name === "t") names.add(s.local.name);
    if (n.type === "ImportDeclaration" && /\/i18nRich(\.js)?$/.test(n.source.value)) for (const s of n.specifiers) if (s.type === "ImportSpecifier" && s.imported.name === "tx") richNames.add(s.local.name); // #3939
  }
  const out = [];
  if (!names.size && !richNames.size) return out;
  if ([...names].some((x) => x !== "t" && x !== "tr")) names.add("tr"); // PitShellPane / PitDesignPane import it as trRaw and define tr = (k, v) => withCurrency(trRaw(k, v), …) (#3797)
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type !== "Identifier" || !(names.has(c.name) || richNames.has(c.name))) return;
      const cat = categoryOf(p), more = behindFold(p);
      for (const s of stringsOf(p.node.arguments[0])) out.push({ cat, text: s, more });
    },
  });
  return out;
}

export function collectInterface() {
  const src = path.join(ROOT, "src");
  const acc = { files: {}, strings: { tooltip: [], info: [], notice: [], interface: [] }, more: [] };
  const info = {}; // file -> { n, words }
  for (const file of listFiles(src)) {
    const rel = path.relative(src, file).split(path.sep).join("/");
    const area = areaOf(rel);
    for (const { cat, text, more } of trStringsOf(file)) {
      const w = wordsOf(text);
      if (!w) continue;
      if (more) { acc.more.push({ file: rel, area, words: w }); continue; } // #3939 — behind a closed fold
      acc.strings[cat].push({ file: rel, area, words: w });
      const f = (acc.files[rel] ||= { area, count: 0, words: 0, long: 0, longWords: 0 });
      f.count++; f.words += w; if (w > LONG_WORDS) { f.long++; f.longWords += w; }
      if (cat === "info") { const i = (info[rel] ||= { n: 0, words: 0 }); i.n++; i.words += w; }
    }
  }
  const sum = (arr) => { const words = arr.reduce((t, x) => t + x.words, 0), ws = arr.map((x) => x.words), long = arr.filter((x) => x.words > LONG_WORDS); return { count: arr.length, words, median: median(ws), long: long.length, longWords: long.reduce((t, x) => t + x.words, 0) }; };
  const byArea = {};
  for (const [name] of AREAS) byArea[name] = sum(acc.strings.interface.filter((x) => x.area === name));
  return { tooltips: sum(acc.strings.tooltip), infoPopups: { ...sum(acc.strings.info), files: Object.keys(info).length }, notices: sum(acc.strings.notice), interface: { ...sum(acc.strings.interface), byArea }, all: sum(Object.values(acc.strings).flat()), interfaceBehindMore: sum(acc.more), files: acc.files };
}

export async function collect() {
  const help = await collectHelp();
  const ui = collectInterface();
  return { method: "scripts/word-count.mjs (#3899 T3)", longWords: LONG_WORDS, help, ...ui };
}

// ---- the numbers a rewording must not raise: the ratchet's surfaces
export function surfaces(r) {
  const s = { "help.seenFirst": r.help.seenFirst, "help.seenFirstWithoutMineDesign": r.help.seenFirstWithoutMineDesign, "tooltips": r.tooltips.words, "infoPopups": r.infoPopups.words, "notices": r.notices.words, "interface.other": r.interface.words, "interface.all": r.all.words };
  for (const [id, p] of Object.entries(r.help.pages)) s[`help.page.${id}`] = p.first;
  for (const [name, a] of Object.entries(r.interface.byArea)) s[`interface.area.${name}`] = a.words;
  return s;
}

// ---- Markdown
const n = (x) => Number(x).toLocaleString("en-US");
export function markdown(r, stamp = "") {
  const L = [];
  const row = (...c) => `| ${c.join(" | ")} |`;
  L.push(`# Word count${stamp ? ` (${stamp})` : ""}`, "", `Made by \`scripts/word-count.mjs\` (#3899). A word is a run of letters or digits; a {placeholder} is not one. "Long" is over ${r.longWords} words.`, "");
  L.push("## Headline", "", row("Surface", "Words seen first", "Words in all", "Items", "Long (over 25)"), row("---", "---:", "---:", "---:", "---:"));
  L.push(row("Help, all pages", n(r.help.seenFirst), n(r.help.total), `${n(Object.keys(r.help.pages).length)} pages, ${n(r.help.settings)} settings, ${n(r.help.warnings)} warnings`, ""));
  L.push(row("Help without Mine Design", n(r.help.seenFirstWithoutMineDesign), n(r.help.totalWithoutMineDesign), "", ""));
  L.push(row("Tooltips", n(r.tooltips.words), n(r.tooltips.words), n(r.tooltips.count), n(r.tooltips.long)));
  L.push(row("Info pop-ups", n(r.infoPopups.words), n(r.infoPopups.words), `${n(r.infoPopups.count)} in ${r.infoPopups.files} files`, n(r.infoPopups.long)));
  L.push(row("Notices and warnings on screen", n(r.notices.words), n(r.notices.words), n(r.notices.count), n(r.notices.long)));
  L.push(row("Other interface strings", n(r.interface.words), n(r.interface.words), n(r.interface.count), `${n(r.interface.long)} (${n(r.interface.longWords)} words)`));
  L.push(row("**All interface strings outside Help**", `**${n(r.all.words)}**`, `**${n(r.all.words + (r.interfaceBehindMore?.words || 0))}**`, n(r.all.count), `${n(r.all.long)} (${n(r.all.longWords)} words)`));
  L.push(row("Interface text behind a closed More (not in the rows above)", "", n(r.interfaceBehindMore?.words || 0), n(r.interfaceBehindMore?.count || 0), ""), ""); // #3939
  L.push("## Help by page", "", row("Page", "Topics", "Settings", "Warnings", "Seen first", "Behind More", "Total"), row("---", "---:", "---:", "---:", "---:", "---:", "---:"));
  for (const p of Object.values(r.help.pages).sort((a, b) => b.total - a.total)) L.push(row(p.id + (p.mineDesign ? " (hidden)" : ""), p.topics, p.settings, p.warnings, n(p.first), n(p.more), n(p.total)));
  L.push("", "## Help by field", "", row("Field", "Words"), row("---", "---:"));
  for (const [k, v] of Object.entries(r.help.fields).sort((a, b) => b[1] - a[1])) L.push(row(k, n(v)));
  L.push("", "## Other interface strings by working area", "", row("Area", "Words", "Strings", "Long strings", "Words in long"), row("---", "---:", "---:", "---:", "---:"));
  for (const [name, a] of Object.entries(r.interface.byArea)) L.push(row(name, n(a.words), n(a.count), n(a.long), n(a.longWords)));
  L.push("", "## Files with the most interface words (tooltips, pop-ups, notices and the rest together)", "", row("File", "Area", "Words", "Strings", "Long"), row("---", "---", "---:", "---:", "---:"));
  for (const [f, v] of Object.entries(r.files).sort((a, b) => b[1].words - a[1].words).slice(0, 30)) L.push(row(f, v.area, n(v.words), n(v.count), n(v.long)));
  L.push("");
  return L.join("\n");
}

// ---- main
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const r = await collect();
  if (process.argv.includes("--update-baseline")) {
    const now = surfaces(r);
    const old = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")).surfaces : null;
    const grew = old ? Object.keys(now).filter((k) => old[k] != null && now[k] > old[k]) : [];
    if (grew.length && !process.argv.includes("--allow-growth")) { console.error("refused: these surfaces grew (use --allow-growth for a deliberate addition):\n" + grew.map((k) => `  ${k}: ${old[k]} -> ${now[k]}`).join("\n")); process.exit(1); }
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({ note: "Recorded by scripts/word-count.mjs --update-baseline (#3899). No surface may grow past its number; lower it after a rewording.", surfaces: now }, null, 2) + "\n");
    console.log(`baseline written (${Object.keys(now).length} surfaces)`);
  }
  const jsonOut = arg("--json"), mdOut = arg("--md");
  const md = markdown(r, new Date().toISOString().slice(0, 10));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(r, null, 2) + "\n");
  if (mdOut) fs.writeFileSync(mdOut, md);
  if (!jsonOut && !mdOut && !process.argv.includes("--update-baseline")) console.log(md);
}
