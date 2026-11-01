// TASKS.csv #1276 — the cap on open section windows, and #1292 the ribbon's last two fitting stages
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const { maxSectionWindows } = createRequire(import.meta.url)("../electron/sectionCap.js");
const GB = 1024 ** 3;

test("#1276 the cap follows the computer's memory", () => {
  assert.equal(maxSectionWindows(8 * GB), 6);
  assert.equal(maxSectionWindows(15.7 * GB), 12);
  assert.equal(maxSectionWindows(4 * GB), 4, "never below 4");
  assert.equal(maxSectionWindows(2 * GB), 4);
  assert.equal(maxSectionWindows(64 * GB), 16, "never above 16");
  assert.equal(maxSectionWindows(undefined), 6, "unknown memory: the 8 GB answer");
});

test("#1276 the handler refuses past the cap only for a NEW window, after the refresh and focus paths", () => {
  const main = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const i = main.indexOf('ipcMain.handle("open-section-window"'), body = main.slice(i, main.indexOf("new BrowserWindow(", i));
  assert.match(body, /refused: true/);
  assert.ok(body.indexOf("refused: true") > body.indexOf("existing.focus()"), "an open section is still focused at the cap");
  assert.ok(body.indexOf("refused: true") > body.indexOf("payload?.ifOpen"), "a refresh never counts");
});

test("#1276 every section the 3D view opens says so when it is refused", () => {
  const src = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((src.match(/\bopenSectionWindow\(\{/g) || []).length, 0, "no direct call left: they go through openSectionOrSay");
  assert.ok((src.match(/\bopenSectionOrSay\(\{/g) || []).length >= 2);
  assert.match(src, /r\?\.refused/);
});

test("#1292 the ribbon has stages after icon-only: tighter, then a second row", () => {
  const rib = fs.readFileSync(new URL("../src/components/Ribbon.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
  assert.match(rib, /el\.setAttribute\("data-tight", ""\)/);
  assert.match(rib, /el\.setAttribute\("data-wrap", ""\)/);
  assert.match(css, /\.ge-ribbon-inner\[data-tight\] \.ge-ribbon-btn/);
  assert.match(css, /\.ge-ribbon-inner\[data-wrap\]/);
});
