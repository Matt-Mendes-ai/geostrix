import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
const main = read("electron/main.js"), win = read("src/components/SectionWindow.jsx"), tabs = read("src/components/SectionTabs.jsx");
test("#1303 a window takes its own section's data only, and ids stay unique across tabs", () => {
  assert.match(win, /if \(!tabId \|\| d0\.id !== tabId\) return; const d = unpackSectionPayload\(d0\);/ /* #2343: the packed bulk unpacked after the id check */);
  assert.ok(!win.includes('id="sectionPlotArea"'), "a hidden tab's clip path would hide the shown tab's drawing");
  assert.ok(!win.includes('id="ge-outline-names"'));
  assert.match(win, /plotClipId = `sectionPlotArea\$\{useId\(\)/);
});
test("#1303 the main process routes by section id; one window for all, a pop-out on request", () => {
  assert.match(main, /const sectionTabs = new Map\(\);/);
  assert.equal(main.split("new BrowserWindow(").length - 1 >= 2, true);
  const open = main.slice(main.indexOf('ipcMain.handle("open-section-window"'), main.indexOf("// push updated section data"));
  assert.ok(!open.includes("new BrowserWindow("), "opening a section creates a window only through createSectionHost");
  assert.match(open, /\[\.\.\.sectionHosts\]\.find\(/);
  assert.match(main, /section-tab-popout/);
  assert.match(main, /if \(!\[\.\.\.sectionTabs\.values\(\)\]\.includes\(win\)\) win\.close\(\);/);
});
test("#1303 only the shown tab prints, and a hidden tab stays mounted", () => {
  const css = read("src/styles/app.css");
  assert.match(css, /\.ge-section-toolbar, \.ge-section-chips, \.ge-section-tabbar \{ display: none !important; \}/);
  assert.match(tabs, /display: t\.id === shown \? "block" : "none"/);
});
