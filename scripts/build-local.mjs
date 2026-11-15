// TASKS.csv #3445 (b) — a local build whose output stays out of OneDrive: `npm run build:local` (installer) or `npm run build:local -- --dir` (unpacked app only).
// GEOSTRIX_BUILD_DIR must be set (for example C:\GeoStrixBuild): the installer and the unpacked app are written to <dir>\release, and the packaged engine is read from
// <dir>\sidecar\dist, where `npm run build:sidecar` puts it when the same variable is set. Nothing the release flow reads moves: `npm run build`, the CI workflow and
// scripts/sign-release.ps1 do not use this script or the variable. The electron-builder settings are package.json's "build", with only those two paths changed (written to
// <dir>\builder.local.json). Source, docs and sample data stay where they are.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.GEOSTRIX_BUILD_DIR;
if (!base) { console.error("[build:local] Set GEOSTRIX_BUILD_DIR to a folder outside OneDrive (for example C:\GeoStrixBuild) first."); process.exit(1); }
const dir = path.resolve(base), release = path.join(dir, "release"), sidecarDist = path.join(dir, "sidecar", "dist");
if (path.resolve(dir).toLowerCase().startsWith(root.toLowerCase())) { console.error("[build:local] GEOSTRIX_BUILD_DIR is inside the repository: choose a folder outside it."); process.exit(1); }
if (!existsSync(path.join(sidecarDist, "geostrix-sidecar"))) console.warn(`[build:local] No frozen engine at ${sidecarDist}: run \`npm run build:sidecar\` with GEOSTRIX_BUILD_DIR set first, or the app is packaged without its Python engine.`);
mkdirSync(dir, { recursive: true });

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const cfg = JSON.parse(JSON.stringify(pkg.build));
cfg.directories = { ...(cfg.directories || {}), output: release };
const sidecarRes = (cfg.extraResources || []).find((r) => r && typeof r === "object" && /python-sidecar[\/]dist$/.test(r.from));
if (sidecarRes) sidecarRes.from = sidecarDist; else console.warn("[build:local] package.json's build.extraResources has no python-sidecar/dist entry: nothing to redirect.");
const cfgFile = path.join(dir, "builder.local.json");
writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

const run = (cmd, args) => { const r = spawnSync(process.execPath, [cmd, ...args], { cwd: root, stdio: "inherit", env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" } }); if (r.status !== 0) process.exit(r.status || 1); };
run(path.join(root, "node_modules", "vite", "bin", "vite.js"), ["build"]);
run(path.join(root, "node_modules", "electron-builder", "cli.js"), ["--config", cfgFile, "--publish", "never", ...(process.argv.includes("--dir") ? ["--dir"] : [])]);
console.log(`[build:local] Output in ${release}`);
