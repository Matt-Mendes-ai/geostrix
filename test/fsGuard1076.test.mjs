// TASKS.csv #1076 (review #1016, security) — the Browser panel's file handlers refuse GeoStrix's own data folder and the
// roaming AppData folder (even after a listing), and namespaced \\?\ / \\.\ paths. The handlers live in electron/main.js,
// which needs Electron; this pins their order of checks (the review's IPC harness exercised them for real).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
const handler = (name) => { const i = main.indexOf(`ipcMain.handle("${name}"`); return main.slice(i, main.indexOf("\n});", i)); };

test("#1076 fs-list-dir refuses namespaced paths and protected folders before reading the folder", () => {
  const h = handler("fs-list-dir");
  const ns = h.indexOf("isNamespacedPath(dirPath)"), prot = h.indexOf("inProtectedFolder(dirPath)"), read = h.indexOf("readdir(");
  assert.ok(ns > 0 && prot > ns && read > prot, "checks come before readdir");
  assert.ok(h.indexOf("listedDirs.add") > read, "a folder is recorded as listed only after it was read");
});

test("#1076 fs-read-file refuses them too, even inside a listed folder", () => {
  const h = handler("fs-read-file");
  const guard = h.indexOf("isNamespacedPath(filePath) || (await inProtectedFolder(filePath))"), read = h.indexOf("readFile(");
  assert.ok(guard > 0 && read > guard);
});

test("#1076 the protected roots are userData and appData, compared on the real path too", () => {
  assert.match(main, /for \(const k of \["userData", "appData"\]\)/);
  assert.match(main, /fs\.promises\.realpath\(p\)/);
  const isNamespacedPath = (p) => /^[\\/]{2}[?.][\\/]/.test(String(p || ""));
  const BS = "\\";
  for (const p of [`${BS}${BS}?${BS}UNC${BS}host${BS}s`, `${BS}${BS}.${BS}UNC${BS}host${BS}s`, "//?/C:/x"]) assert.ok(isNamespacedPath(p), p);
  for (const p of [`${BS}${BS}host${BS}share`, "C:\\data", "/home/x"]) assert.ok(!isNamespacedPath(p), p);
  assert.ok(main.includes("const isNamespacedPath = (p) => /^[\\\\/]{2}[?.][\\\\/]/.test(String(p || \"\"));"), "the same pattern as tested here");
});
