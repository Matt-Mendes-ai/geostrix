#!/usr/bin/env node
// TASKS.csv #49 — freezes the Python sidecar into a standalone executable via PyInstaller, so a
// packaged install doesn't need a separate Python/pip setup for GemPy implicit modelling and the
// RBF/IDW interpolation endpoints (see electron/main.js's startPythonSidecar, which spawns this
// output when app.isPackaged instead of `python -m uvicorn`). Run before `electron-builder` packages
// the app — wired in as the `build` script's first step (see package.json) — not committed to git
// (a ~50MB binary per platform; see .gitignore) since it's cheap to rebuild and would otherwise bloat
// every clone/checkout.
//
// A thin Node wrapper rather than a plain shell command in package.json: the venv's python lives at a
// different relative path on Windows (Scripts/python.exe) than macOS/Linux (bin/python) — one script
// that resolves the right one is simpler than juggling that in an npm script string, and gives a clear
// "the sidecar venv isn't set up" error instead of an opaque "command not found" from the shell.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const sidecarDir = __dirname;
const isWin = process.platform === "win32";
const venvPython = path.join(sidecarDir, "venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python");

if (!fs.existsSync(venvPython)) {
  console.error(`[build:sidecar] No venv found at ${venvPython}.`);
  console.error("[build:sidecar] Set up python-sidecar/venv first (see python-sidecar/README.md / setup_sidecar.bat), including `pip install pyinstaller`.");
  process.exit(1);
}

// TASKS.csv #321 — ONEDIR, not onefile. Adding SimPEG (plus numba/llvmlite, discretize, choclo, geoana)
// grows the frozen sidecar from ~52 MB to ~130 MB, and a --onefile exe unpacks ALL of it into %TEMP% on
// every single launch: measured ~10 s of pure extraction per start by the #321 performance review (16.5-17 s
// to reach /health vs 6.5 s of actual Python work). A --onedir build is already unpacked — electron-builder
// ships a folder either way — so that cost disappears. The old single-file exe is removed first so a stale
// one can never be packaged by mistake.
const oldOnefile = path.join(sidecarDir, "dist", isWin ? "geostrix-sidecar.exe" : "geostrix-sidecar");
if (fs.existsSync(oldOnefile) && fs.statSync(oldOnefile).isFile()) fs.rmSync(oldOnefile);

// TASKS.csv #456 — antivirus false positives (Bitdefender held the v0.1.20 installer). Heuristic scanners
// score an executable up for looking like the thousands of malware samples that are PyInstaller builds
// and down for looking like identifiable software. What is in our control without a certificate:
//   * --version-file: the frozen exe used to carry NO version resource at all (no company, product,
//     description, version) — a classic "anonymous dropper" trait. It now carries the same identity as
//     GeoStrix.exe, generated from package.json so it can never drift.
//   * --icon: the GeoStrix icon instead of PyInstaller's stock one (the stock icon is itself a signal).
//   * --noupx: UPX-packed executables are a strong malware indicator; PyInstaller uses UPX whenever it is
//     found on PATH, so it is refused explicitly rather than depending on the machine.
//   * The bootloader (the small launcher inside every PyInstaller exe) must be compiled from source, not
//     the prebuilt one shipped in the PyInstaller wheel, which is byte-identical across countless malware
//     samples and therefore on many detection lists. The release workflow installs PyInstaller with
//     PYINSTALLER_COMPILE_BOOTLOADER=1 --no-binary pyinstaller; locally, do the same (needs MSVC build
//     tools): see python-sidecar/README.md. checkBootloaderCompiled() below warns if it isn't.
const pkg = JSON.parse(fs.readFileSync(path.join(sidecarDir, "..", "package.json"), "utf8"));
const verParts = (pkg.version.split(/[.-]/).map((n) => parseInt(n, 10)).filter(Number.isFinite).concat([0, 0, 0, 0])).slice(0, 4);
const author = typeof pkg.author === "string" ? pkg.author.replace(/\s*<.*>/, "") : (pkg.author?.name || "GeoStrix");
const versionFile = path.join(sidecarDir, "build", "version_info.txt");
fs.mkdirSync(path.dirname(versionFile), { recursive: true });
const q = (s) => JSON.stringify(String(s));
fs.writeFileSync(versionFile, `VSVersionInfo(
  ffi=FixedFileInfo(filevers=(${verParts.join(", ")}), prodvers=(${verParts.join(", ")}), mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable("040904B0", [
      StringStruct("CompanyName", ${q(author)}),
      StringStruct("FileDescription", "GeoStrix Python engine (implicit modelling, geophysics)"),
      StringStruct("FileVersion", ${q(pkg.version)}),
      StringStruct("InternalName", "geostrix-sidecar"),
      StringStruct("LegalCopyright", ${q(`Copyright (c) ${new Date().getFullYear()} ${author}. MIT License.`)}),
      StringStruct("OriginalFilename", "geostrix-sidecar.exe"),
      StringStruct("ProductName", "GeoStrix"),
      StringStruct("ProductVersion", ${q(pkg.version)})])]),
    VarFileInfo([VarStruct("Translation", [1033, 1200])])
  ]
)
`);
function checkBootloaderCompiled() {
  // json.dumps escapes non-ASCII, so a path like "Área de Trabalho" survives the console code page.
  const r = spawnSync(venvPython, ["-c", "import PyInstaller, os, json; print(json.dumps(os.path.dirname(PyInstaller.__file__)))"], { encoding: "utf8" });
  const dir = r.stdout ? JSON.parse(r.stdout.trim()) : "";
  const distInfo = dir && fs.readdirSync(path.dirname(dir)).find((n) => /^pyinstaller-.*\.dist-info$/i.test(n));
  const wheel = distInfo ? fs.readFileSync(path.join(path.dirname(dir), distInfo, "WHEEL"), "utf8") : "";
  // The PyPI wheel carries a platform tag (e.g. "Tag: py3-none-win_amd64") because it contains prebuilt
  // bootloaders; a build from the sdist is tagged "py3-none-any" and its bootloader was compiled here.
  if (!/Tag: py3-none-any/.test(wheel)) {
    console.warn("[build:sidecar] WARNING: PyInstaller's PREBUILT bootloader is installed — antivirus false positives are likely. See python-sidecar/README.md (PYINSTALLER_COMPILE_BOOTLOADER=1).");
    if (process.env.CI) { console.error("[build:sidecar] Refusing to build a release with the prebuilt bootloader."); process.exit(1); }
  }
}
checkBootloaderCompiled();

const args = [
  "-m", "PyInstaller", "--noconfirm", "--onedir", "--name", "geostrix-sidecar",
  "--noupx", "--version-file", versionFile, // #456
  ...(fs.existsSync(path.join(sidecarDir, "..", "build", "icon.ico")) ? ["--icon", path.join(sidecarDir, "..", "build", "icon.ico")] : []), // #456
  // uvicorn/gempy both do a lot of dynamic/plugin-style importing that PyInstaller's static analysis
  // can't see on its own (confirmed by an initial build attempt without these flags silently omitting
  // uvicorn's asyncio loop implementation) — --collect-all pulls in every submodule of each package
  // rather than trying to hand-maintain a --hidden-import list that could drift as either package
  // updates its own internal module layout.
  "--collect-all", "uvicorn", "--collect-all", "gempy", "--collect-all", "gempy_engine",
  // TASKS.csv #321 — SimPEG stack. Submodules only for the pure-Python packages (a --collect-all of simpeg
  // would also bundle its tests/examples — security review); full collection for discretize (compiled
  // extensions) and libdlf (ships digital-filter coefficient DATA files it loads at runtime).
  "--collect-submodules", "simpeg", "--collect-submodules", "choclo", "--collect-submodules", "geoana",
  "--collect-submodules", "numba", "--collect-all", "discretize", "--collect-all", "libdlf",
  "--exclude-module", "tkinter",
  // /health reports SimPEG's availability and versions from package METADATA (importlib.metadata), which
  // --collect-submodules does not bundle — found when the first frozen build said "simpeg: null".
  "--copy-metadata", "simpeg", "--copy-metadata", "choclo", "--copy-metadata", "discretize",
  "--copy-metadata", "geoana", "--copy-metadata", "numba",
  "--collect-submodules", "app",
  "run_frozen.py",
];

console.log(`[build:sidecar] Running: ${venvPython} ${args.join(" ")}`);
const result = spawnSync(venvPython, args, { cwd: sidecarDir, stdio: "inherit" });
if (result.status !== 0) {
  console.error("[build:sidecar] PyInstaller build failed — see output above.");
  process.exit(result.status || 1);
}

const exeName = isWin ? "geostrix-sidecar.exe" : "geostrix-sidecar";
const builtPath = path.join(sidecarDir, "dist", "geostrix-sidecar", exeName);
if (!fs.existsSync(builtPath)) {
  console.error(`[build:sidecar] Build reported success but ${builtPath} doesn't exist — something's wrong.`);
  process.exit(1);
}
const dirSize = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? dirSize(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
const sizeMb = (dirSize(path.dirname(builtPath)) / (1024 * 1024)).toFixed(1);
console.log(`[build:sidecar] Built ${builtPath} (folder ${sizeMb} MB).`);
