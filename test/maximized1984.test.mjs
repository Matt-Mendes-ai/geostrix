// TASKS.csv #1984 — Matt: "can we have the app start at maximized window by default?"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
// v0.1.103 release CI: the Windows runner checks the sources out with CRLF, so the text pins compare LF text
const readFileSync = (p, enc) => readRaw(p, enc).replace(/\r\n/g, "\n");

test("the main window is maximized as soon as it is made", () => {
  const s = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const i = s.indexOf("function createMainWindow()");
  const body = s.slice(i, s.indexOf("mainWindow.webContents.setWindowOpenHandler", i));
  assert.match(body, /mainWindow = new BrowserWindow\(\{\n\s+width: 1440,\n\s+height: 900,/);
  assert.match(body, /\n  mainWindow\.maximize\(\);\n/);
});
