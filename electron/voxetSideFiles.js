// TASKS.csv #2725 — a GOCAD Voxet (.vo) is a small text header; its values are in side files its PROP_FILE lines name, often with no
// extension or an odd one ("model_Density@@"), which fs-read-file's extension allow-list refuses. When fs-read-file has itself read a
// .vo (every check passed), the side files THAT header names become readable too, under these rules:
//   - only names parsed here from that .vo's own text, never a name the renderer sends;
//   - only a bare file name: one with a folder part ("sub\y.bin", "../secret.txt"), an absolute path ("C:\x.txt", "/x") or "." / ".."
//     is refused, not cut down to its base name;
//   - joined to the .vo's own folder, and the real path (links resolved) must still be in that folder's real path;
//   - only the last MAX_VO .vo files' side files are kept, so the set cannot grow without bound.
// fs-read-file still applies every other check (a listed folder, protected folders, the size cap) to a side file.
const fs = require("node:fs");
const path = require("node:path");

const MAX_VO = 4;
const key = (p) => path.resolve(String(p || "")).toLowerCase(); // as main.js dirKey: Windows paths are case-insensitive

// the PROP_FILE values in a Voxet header, as written ("PROP_FILE 1 model_Density@@"; a quoted name loses its quotes)
function propFileNames(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = /^\s*PROP_FILE\s+\d+\s+(.+?)\s*$/i.exec(raw);
    if (m) out.push(m[1].replace(/^"(.*)"$/, "$1"));
  }
  return out;
}

// Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), any case, with any extension: the part before the first dot, its trailing
// spaces dropped as Windows drops them ("nul .txt" is NUL)
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;
const isDeviceName = (s) => RESERVED.test(s.split(".")[0].replace(/ +$/, ""));

// the name itself when it is a bare file name, else null. Refused: a folder part, a ':' anywhere (a drive, or an NTFS alternate data
// stream "rock@@:hidden" of a same-folder file — Main's review), a Windows device name, ".", "..", NUL.
function bareName(name) {
  const s = String(name ?? "");
  if (!s || s === "." || s === ".." || s.includes("\0") || s.includes(":")) return null;
  if (/[\\/]/.test(s) || path.isAbsolute(s) || path.win32.isAbsolute(s) || path.posix.isAbsolute(s)) return null;
  if (isDeviceName(s)) return null;
  return s;
}

// the side-file paths the .vo at voPath (with header text) names, each checked as above; realpath is injectable for tests
async function voxetSidePaths(voPath, text, realpath = fs.promises.realpath) {
  const dir = path.dirname(path.resolve(String(voPath || "")));
  let realDir;
  try { realDir = key(await realpath(dir)); } catch { return []; }
  const out = [];
  for (const n of new Set(propFileNames(text).map(bareName).filter(Boolean))) {
    const full = path.join(dir, n);
    if (key(path.dirname(full)) !== key(dir)) continue;
    let real;
    try { real = await realpath(full); } catch { continue; } // not there: nothing to allow
    if (key(path.dirname(real)) !== realDir) continue; // a link out of the folder
    out.push(full);
  }
  return out;
}

// the allowed side files: note(voPath, text) after fs-read-file read a .vo; has(filePath) in fs-read-file's extension check
function createVoxetSideRegistry(maxVo = MAX_VO, realpath = fs.promises.realpath) {
  const byVo = new Map(); // .vo key -> Set of side-file keys, oldest first
  return {
    async note(voPath, text) {
      const k = key(voPath);
      byVo.delete(k);
      byVo.set(k, new Set((await voxetSidePaths(voPath, text, realpath)).map(key)));
      while (byVo.size > maxVo) byVo.delete(byVo.keys().next().value);
    },
    has(filePath) {
      const k = key(filePath);
      for (const s of byVo.values()) if (s.has(k)) return true;
      return false;
    },
    size: () => byVo.size,
  };
}

module.exports = { propFileNames, bareName, voxetSidePaths, createVoxetSideRegistry, MAX_VO };
