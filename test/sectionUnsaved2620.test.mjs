// TASKS.csv #2620 (re-test of #2516) — a project load closes the section windows, so their unsaved lines are asked about BEFORE the load
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("main answers 'may close' synchronously with the Unsaved lines question; preload and desktop expose it", () => {
  const m = src("../electron/main.js");
  assert.match(m, /ipcMain\.on\("may-close-section-windows", \(ev\) => \{/);
  assert.match(m, /ev\.returnValue = mayCloseSections\(mainWindow, \[\.\.\.sectionTabs\.keys\(\)\]\);/);
  assert.match(src("../electron/preload.js"), /sectionWindowsMayClose: \(\) => ipcRenderer\.sendSync\("may-close-section-windows"\)/);
  assert.match(src("../src/lib/desktop.js"), /export function sectionWindowsMayClose\(\)/);
});

test("every action that replaces the project asks first, and stops on Cancel", () => {
  const s = src("../src/lib/store.jsx");
  assert.match(s, /if \(!sectionWindowsMayClose\(\)\) return \{ cancelled: true \}; \/\/ #2620/); // reproject
  assert.match(s, /if \(!target\) return;\s+if \(!sectionWindowsMayClose\(\)\) return; \/\/ #2620/); // switch tab
  assert.match(s, /const newWorkspaceTab = use(?:Callback|LatestCallback)\(\(\) => \{\s+if \(!sectionWindowsMayClose\(\)\) return false;/);
  assert.match(s, /if \(!sectionWindowsMayClose\(\)\) return \{ ok: false, canceled: true \}; \/\/ #2620/); // open
  assert.match(s, /if \(tabId === activeTabId && !sectionWindowsMayClose\(\)\) return;/); // close the shown tab
  assert.match(s, /if \(hasWorkRef\.current && newWorkspaceTab\(\) === false\) return;/); // a sample never loads over the project
  assert.match(src("../src/modules/CartographyModule.jsx"), /if \(report\?\.cancelled\) \{ setMsg\(null\); return; \}/);
});
