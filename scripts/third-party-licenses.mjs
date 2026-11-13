// TASKS.csv #639 — the third-party licences GeoStrix ships, for Help → Third-party licences… and the release.
// JavaScript: every package that ends up in the app — the runtime dependencies, the libraries Vite bundles from the
// build-time list (React, PDF.js) and Electron itself — with each one's own dependencies, read from package-lock.json,
// and the licence text from the package folder. Python: every distribution in the Python engine's build environment
// (python-sidecar/venv), read with importlib.metadata — the frozen engine is built from it. Written to
// public/licenses/third-party.json (gitignored), so both the dev server and the build serve it.
//   node scripts/third-party-licenses.mjs            (also run by vite.config.js at startup / build)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { BUNDLED_FROM_DEV, isNotShipped } from "./shipped-roots.mjs"; // TASKS.csv #668 — one list for this and the audit
const NOT_SHIPPED = { has: isNotShipped };

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;
function licenseText(dir) {
  try {
    const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
    return files.map((f) => readFileSync(path.join(dir, f), "utf8").trim()).join("\n\n").slice(0, 60000) || null;
  } catch { return null; }
}

// TASKS.csv #1994 — a package published without its licence file (laz-perf): the upstream text kept in scripts/licence-texts
function vendoredText(name) {
  try { return readFileSync(path.join(ROOT, "scripts", "licence-texts", `${name.replace(/\//g, "__")}.txt`), "utf8").trim(); } catch { return null; }
}

function javascriptPackages() {
  const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  const pkgs = lock.packages || {};
  const rootPkg = pkgs[""] || {};
  const roots = [...Object.keys(rootPkg.dependencies || {}), ...BUNDLED_FROM_DEV];
  const keyFor = (name, from = "") => { // node resolution over the lockfile's flat keys
    let base = from;
    for (;;) {
      const k = `${base ? `${base}/` : ""}node_modules/${name}`;
      if (pkgs[k]) return k;
      if (!base) return null;
      const i = base.lastIndexOf("/node_modules/");
      base = i >= 0 ? base.slice(0, i) : "";
    }
  };
  const seen = new Set(), queue = roots.map((n) => keyFor(n)).filter(Boolean);
  while (queue.length) {
    const k = queue.shift();
    if (seen.has(k)) continue;
    const name = k.slice(k.lastIndexOf("node_modules/") + 13);
    if (NOT_SHIPPED.has(name)) continue;
    seen.add(k);
    const p = pkgs[k];
    if (name === "electron") continue; // the npm package's own deps only download the binary; they don't ship
    for (const dep of Object.keys({ ...(p.dependencies || {}), ...(p.optionalDependencies || {}) })) {
      if (NOT_SHIPPED.has(dep)) continue;
      const dk = keyFor(dep, k);
      if (dk && !seen.has(dk)) queue.push(dk);
    }
  }
  return [...seen].map((k) => {
    const p = pkgs[k], name = k.slice(k.lastIndexOf("node_modules/") + 13);
    let meta = {};
    try { meta = JSON.parse(readFileSync(path.join(ROOT, k, "package.json"), "utf8")); } catch { /* not installed here */ }
    const repo = typeof meta.repository === "string" ? meta.repository : meta.repository?.url;
    return { name, version: p.version, license: p.license || meta.license || "see text", url: meta.homepage || (repo ? repo.replace(/^git\+/, "").replace(/\.git$/, "") : null), text: licenseText(path.join(ROOT, k)) ?? vendoredText(name) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function pythonPackages() {
  const py = path.join(ROOT, "python-sidecar", "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (!existsSync(py)) return { list: [], note: "The Python engine's build environment was not present when this list was made." };
  // packages that build the frozen engine but are not inside it (PyInstaller's launcher is — listed separately below)
  const buildOnly = ["pip", "setuptools", "wheel", "pyinstaller", "pyinstaller-hooks-contrib", "altgraph", "pefile", "pywin32-ctypes"];
  const code = `
import json, importlib.metadata as m
BUILD_ONLY = set(${JSON.stringify(buildOnly)})
out = []
for d in m.distributions():
    md = d.metadata
    name = md.get("Name")
    if not name or name.lower() in BUILD_ONLY: continue
    lic = md.get("License-Expression") or md.get("License") or ""
    if not lic or len(lic) > 80:
        cls = [c.split("::")[-1].strip() for c in (md.get_all("Classifier") or []) if c.startswith("License ::")]
        lic = "; ".join(cls) or (lic[:80] if lic else "see text")
    text = []
    for f in (d.files or []):
        s = str(f).replace("\\\\", "/").lower()
        base = s.rsplit("/", 1)[-1]
        if (".dist-info/" in s or ".dist-info/licenses/" in s) and (base.startswith("licen") or base.startswith("copying") or base.startswith("notice")):
            try: text.append(d.locate_file(f).read_text(encoding="utf-8", errors="replace").strip())
            except Exception: pass
    out.append({"name": name, "version": d.version, "license": lic.strip(), "url": md.get("Home-page") or (md.get_all("Project-URL") or [""])[0].split(",")[-1].strip() or None, "text": "\\n\\n".join(text)[:60000] or None})
print(json.dumps(sorted(out, key=lambda x: x["name"].lower())))
`;
  try {
    const list = JSON.parse(execFileSync(py, ["-I", "-c", code], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
    list.push({ name: "PyInstaller bootloader", version: "", license: "GPL-2.0 with the PyInstaller bootloader exception", url: "https://pyinstaller.org/en/stable/license.html",
      text: "The Python engine (geostrix-sidecar.exe) starts through PyInstaller's bootloader. PyInstaller is licensed under the GNU GPL v2 with a special exception: the bootloader may be distributed with programs under any licence, and does not affect the licence of the program it runs. See https://pyinstaller.org/en/stable/license.html." });
    return { list, note: null };
  } catch (e) {
    return { list: [], note: `The Python engine's packages could not be listed (${e.message.split("\n")[0]}).` };
  }
}

// TASKS.csv #2008 (release smoke test) — data that ships with the app and is not a package: each folder under public/ that carries its own
// README.txt + LICENSE.txt (the FGDC lithology patterns, #1995: public domain, repackaged CC0) is listed with that text, so Help ->
// Third-party licences names it.
export function bundledData() {
  const out = [];
  const fgdc = path.join(ROOT, "public", "patterns", "fgdc");
  if (existsSync(path.join(fgdc, "LICENSE.txt"))) {
    const readme = existsSync(path.join(fgdc, "README.txt")) ? readFileSync(path.join(fgdc, "README.txt"), "utf8").trim() : "";
    out.push({ name: "FGDC lithology patterns (FGDC-STD-013-2006), repackaged by Daven Quinn", version: "", license: "CC0-1.0 (public domain)",
      url: "https://github.com/davenquinn/geologic-patterns", text: [readme, readFileSync(path.join(fgdc, "LICENSE.txt"), "utf8").trim()].filter(Boolean).join("\n\n") });
  }
  // TASKS.csv #2690 — the international time scale's interval colours (Macrostrat, CC BY 4.0), bundled for 'Time-scale colours'
  const ts = path.join(ROOT, "src", "lib", "timeScaleIntervals.txt");
  if (existsSync(ts)) out.push({ name: "International time scale interval colours (Macrostrat)", version: "2026-11-12", license: "CC-BY-4.0",
    url: "https://macrostrat.org", text: readFileSync(ts, "utf8").trim() });
  // TASKS.csv #2829 — the Blake River gravity sample (Geological Survey of Canada, Open Government Licence - Canada): its README carries
  // the attribution statement and says what is real; listed here like the time scale (#2690) so Help -> Third-party licences names it
  const br = path.join(ROOT, "sample_data", "blake_river", "README.md");
  if (existsSync(br)) out.push({ name: "Blake River gravity sample (Geological Survey of Canada, Natural Resources Canada)", version: "2026-11", license: "OGL-Canada-2.0",
    url: "https://open.canada.ca/en/open-government-licence-canada", text: readFileSync(br, "utf8").trim() });
  // TASKS.csv #3106 — the WA palaeochannel uranium sample (WA DEMIRS, CC BY 4.0) carried its attribution only in its README: CC BY 4.0
  // asks for it where users see the work, so it is listed here like the Blake River sample (#2829)
  const wa = path.join(ROOT, "sample_data", "wa_uranium", "README.md");
  if (existsSync(wa)) out.push({ name: "WA palaeochannel uranium sample (WAMEX company mineral drillhole database, Department of Energy, Mines, Industry Regulation and Safety, Western Australia)", version: "2024", license: "CC-BY-4.0",
    url: "https://catalogue.data.wa.gov.au/dataset/mineral-exploration-drillholes-open-file", text: readFileSync(wa, "utf8").trim() });
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "mount_raymond", "README.md");
    if (existsSync(p)) out.push({ name: "Mount Raymond mapping sample (Geological Survey of Canada, Canadian Geoscience Map 71, and the Canadian Digital Elevation Model, Natural Resources Canada)", version: "2022", license: "OGL-Canada-2.0",
      url: "https://open.canada.ca/en/open-government-licence-canada", text: readFileSync(p, "utf8").trim() }); }
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "wa_iron", "README.md");
    if (existsSync(p)) out.push({ name: "WA bedded iron sample (WAMEX company mineral drillhole database, Department of Energy, Mines, Industry Regulation and Safety, Western Australia; Total Magnetic Intensity Grid of Australia 2019, Geoscience Australia)", version: "2024", license: "CC-BY-4.0",
      url: "https://catalogue.data.wa.gov.au/dataset/mineral-exploration-drillholes-open-file", text: readFileSync(p, "utf8").trim() }); }
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "wa_lead_zinc", "README.md");
    if (existsSync(p)) out.push({ name: "WA lead-silver-zinc sample (WAMEX company mineral drillhole database, Department of Energy, Mines, Industry Regulation and Safety, Western Australia)", version: "2024", license: "CC-BY-4.0",
      url: "https://catalogue.data.wa.gov.au/dataset/mineral-exploration-drillholes-open-file", text: readFileSync(p, "utf8").trim() }); }
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "wa_zinc_copper", "README.md");
    if (existsSync(p)) out.push({ name: "WA zinc-copper sample (WAMEX company mineral drillhole and surface geochemistry database, Department of Energy, Mines, Industry Regulation and Safety, Western Australia)", version: "2024", license: "CC-BY-4.0",
      url: "https://catalogue.data.wa.gov.au/dataset/mineral-exploration-drillholes-open-file", text: readFileSync(p, "utf8").trim() }); }
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "wa_gold", "README.md");
    if (existsSync(p)) out.push({ name: "WA lode gold sample (WAMEX company mineral drillhole database, Department of Energy, Mines, Industry Regulation and Safety, Western Australia)", version: "2024", license: "CC-BY-4.0",
      url: "https://catalogue.data.wa.gov.au/dataset/mineral-exploration-drillholes-open-file", text: readFileSync(p, "utf8").trim() }); }
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "fi_lapland", "README.md");
    if (existsSync(p)) out.push({ name: "Central Lapland sample (Rock geochemical data of Finland and Bedrock of Finland 1:1 000 000, Geological Survey of Finland)", version: "2026-11", license: "CC-BY-4.0",
      url: "https://www.gtk.fi/en/open-licence/", text: readFileSync(p, "utf8").trim() }); }
  // TASKS.csv #3107 — listed like the Blake River and WA uranium samples: its README carries the attribution and says what was done
  { const p = path.join(ROOT, "sample_data", "qc_rouyn_noranda", "README.md");
    if (existsSync(p)) out.push({ name: "Rouyn-Noranda sample (SIGEOM, Ministère des Ressources naturelles et des Forêts, Gouvernement du Québec; Canadian Digital Elevation Model, Natural Resources Canada)", version: "2026-11", license: "CC-BY-4.0",
      url: "https://www.donneesquebec.ca/licence/#cc-by", text: readFileSync(p, "utf8").trim() }); }
  return out;
}

export function writeThirdPartyLicenses() {
  const js = javascriptPackages(), py = pythonPackages(), data = bundledData();
  const own = { name: "GeoStrix", license: "MIT", text: readFileSync(path.join(ROOT, "LICENSE"), "utf8").trim() };
  const out = { generated: new Date().toISOString().slice(0, 10), geostrix: own, javascript: js, python: py.list, pythonNote: py.note, data }; // data: #2008
  mkdirSync(path.join(ROOT, "public", "licenses"), { recursive: true });
  writeFileSync(path.join(ROOT, "public", "licenses", "third-party.json"), JSON.stringify(out));
  return { js: js.length, py: py.list.length, note: py.note };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = writeThirdPartyLicenses();
  console.log(`third-party licences: ${r.js} JavaScript packages, ${r.py} Python packages${r.note ? ` (${r.note})` : ""}`);
}
