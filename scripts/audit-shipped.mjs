// TASKS.csv #592 — dependency audit of what SHIPS. `npm audit --omit=dev` (#352) skips devDependencies, but three of
// them ship: `electron` is the runtime every user runs, and `react` / `react-dom` are bundled into the app by Vite.
// This walks package-lock.json from the shipped roots (dependencies + those three) to every package they pull in,
// runs `npm audit --json`, and FAILS when an advisory hits that set. Advisories that only touch build / dev tooling
// (electron-builder, vite's dev server, eslint...) are listed as warnings: they never reach a user's machine.
// A network failure of the audit itself is a warning, not a failure (CI must not go red because the registry did).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { BUNDLED_FROM_DEV as SHIPPED_DEV, isNotShipped } from "./shipped-roots.mjs"; // #668 — shared with third-party-licenses.mjs
// The `electron` npm package is an installer: its own dependencies (@electron/get, got, undici...) download the
// Electron binary during `npm install`; electron-builder ships that binary, not this package's node_modules. So
// electron's advisories count (they are the runtime's), its dependency tree does not.
const ROOT_ONLY = new Set(["electron"]);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = lock.packages || {};

// node's resolution over the lockfile's flat "node_modules/a/node_modules/b" keys
const resolve = (fromPath, name) => {
  let base = fromPath;
  for (;;) {
    const key = `${base ? `${base}/` : ""}node_modules/${name}`;
    if (packages[key]) return key;
    if (!base) return null;
    const i = base.lastIndexOf("/node_modules/");
    base = i >= 0 ? base.slice(0, i) : "";
  }
};
const shipped = new Set(), seen = new Set();
const queue = [...Object.keys(pkg.dependencies || {}), ...SHIPPED_DEV].map((n) => resolve("", n)).filter(Boolean);
while (queue.length) {
  const key = queue.pop();
  if (seen.has(key)) continue;
  seen.add(key);
  shipped.add(key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length));
  const p = packages[key];
  if (isNotShipped(key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length))) { shipped.delete(key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length)); continue; } // #668
  if (ROOT_ONLY.has(key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length))) continue;
  for (const dep of Object.keys({ ...(p.dependencies || {}), ...(p.optionalDependencies || {}) })) {
    const r = resolve(key, dep);
    if (r) queue.push(r);
  }
}

let report;
try {
  report = JSON.parse(execSync("npm audit --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }));
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout
  try { report = JSON.parse(err.stdout); } catch { console.warn("::warning::npm audit could not run (network?) — shipped-dependency audit skipped."); process.exit(0); }
}
if (report.error) { console.warn(`::warning::npm audit failed: ${report.error.summary || report.error.code} — skipped.`); process.exit(0); }

const vulns = Object.entries(report.vulnerabilities || {});
const hit = vulns.filter(([name]) => shipped.has(name));
const devOnly = vulns.filter(([name]) => !shipped.has(name));
console.log(`Shipped packages audited: ${shipped.size} (dependencies + ${SHIPPED_DEV.join(", ")}).`);
if (devOnly.length) console.log(`Dev / build tooling only (not shipped), ${devOnly.length}: ${devOnly.map(([n, v]) => `${n} (${v.severity})`).join(", ")}`);
if (hit.length) {
  for (const [name, v] of hit) console.error(`::error::${name} (${v.severity}) ships with GeoStrix: ${(v.via || []).map((x) => (typeof x === "string" ? x : x.title)).join("; ")}`);
  process.exit(1);
}
console.log("No advisory affects a shipped package.");
