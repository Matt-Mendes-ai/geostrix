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
if (total > EAGER_BUDGET_KB) {
  console.error(`Startup JavaScript is ${total.toFixed(0)} kB, over the ${EAGER_BUDGET_KB} kB budget. Lazy-load what isn't needed at launch (see src/lib/lazyModal.jsx), or raise the budget deliberately (TASKS.csv #476).`);
  process.exit(1);
}
