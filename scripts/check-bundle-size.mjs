// TASKS.csv #476 — fail the build when the JavaScript loaded at startup grows past its budget.
// "Startup" = the entry script in dist/index.html plus every chunk it modulepreloads (vendor-three, react...).
// Lazy chunks (modals, other tabs, file-format parsers) don't count: they load on first use.
// The startup bundle drifted 653 -> 757 kB unnoticed between #439 and the 2026-09-25 review; this catches that.
// Raising the budget is fine when a startup cost is deliberate — change EAGER_BUDGET_KB with a TASKS.csv note.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const EAGER_BUDGET_KB = 1625; // measured 2026-09-26 after #476: 1,548 kB, +5% headroom

const dist = path.resolve(process.argv[2] || "dist");
const html = readFileSync(path.join(dist, "index.html"), "utf8");
const files = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="\.?\/?([^"]+\.js)"/g)].map((m) => m[1]);
if (!files.length) { console.error("check-bundle-size: no startup scripts found in dist/index.html"); process.exit(1); }
let total = 0;
for (const f of files) {
  const kb = statSync(path.join(dist, f)).size / 1000;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(9)} kB  ${f}`);
}
console.log(`${total.toFixed(1).padStart(9)} kB  startup JavaScript (budget ${EAGER_BUDGET_KB} kB)`);
// TASKS.csv #958 — a non-English start also loads its dictionary before the first render (src/lib/i18n.js); it is not
// in the budget (it grows with every string), but the largest one is printed so its growth is visible
const { readdirSync } = await import("node:fs");
const locales = readdirSync(path.join(dist, "assets")).filter((f) => /^(es|pt|fr|ar)(\.json)?-[\w-]+\.js$/.test(f)).map((f) => [f, statSync(path.join(dist, "assets", f)).size / 1000]).sort((a, b) => b[1] - a[1]);
if (locales.length) console.log(`${locales[0][1].toFixed(1).padStart(9)} kB  largest dictionary (${locales[0][0]}), loaded before the first render in that language: ${(total + locales[0][1]).toFixed(1)} kB with the startup JavaScript`);
// TASKS.csv #693 — ViewerModule.jsx re-accreted (9,284 -> 10,215 lines in three weeks) after #445's extraction; the
// modelling panes moved to modules/viewer/ModellingPanes.jsx (9,525 lines left). Fail above the budget; raising it is
// fine when deliberate - change VIEWER_LINE_BUDGET with a TASKS.csv note, or move the next cohesive block out.
const VIEWER_LINE_BUDGET = 9400; // #1084: lowered from 10,000 (the file was 9,287); test/viewerModuleSize1084 also caps the bytes
const viewerLines = readFileSync(path.resolve("src/modules/ViewerModule.jsx"), "utf8").split(/\r?\n/).length;
console.log(`${String(viewerLines).padStart(9)} lines src/modules/ViewerModule.jsx (budget ${VIEWER_LINE_BUDGET})`);
if (viewerLines > VIEWER_LINE_BUDGET) {
  console.error(`ViewerModule.jsx has ${viewerLines} lines, over its ${VIEWER_LINE_BUDGET}-line budget. Move a cohesive block out (TASKS.csv #693 lists the next ones), or raise the budget deliberately.`);
  process.exit(1);
}
if (total > EAGER_BUDGET_KB) {
  console.error(`Startup JavaScript is ${total.toFixed(0)} kB, over the ${EAGER_BUDGET_KB} kB budget. Lazy-load what isn't needed at launch (see src/lib/lazyModal.jsx), or raise the budget deliberately (TASKS.csv #476).`);
  process.exit(1);
}
