// TASKS.csv #2620 (re-test of #2516) — a project load closes the section windows, so their unsaved lines are asked about BEFORE the load
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("main answers 'may close' with the Unsaved lines question asked in the window (#4000, was a synchronous OS box); preload and desktop expose it", () => {
  const m = src("../electron/main.js");
  assert.match(m, /ipcMain\.handle\("may-close-section-windows", \(ev\) => \{/);
  assert.match(m, /sectionsMayCloseAsk = mayCloseSectionsAsk\(mainWindow, \[\.\.\.sectionTabs\.keys\(\)\]\)\.finally\(\(\) => \{ sectionsMayCloseAsk = null; \}\);/);
  assert.match(m, /if \(!sectionsMayCloseAsk\) /, "one question at a time: a second call while one is up gets its answer");
  assert.doesNotMatch(m, /ipcMain\.on\("may-close-section-windows"|function mayCloseSections\(/);
  assert.match(src("../electron/preload.js"), /sectionWindowsMayClose: \(\) => ipcRenderer\.invoke\("may-close-section-windows"\)/);
  assert.match(src("../src/lib/desktop.js"), /export async function sectionWindowsMayClose\(\)/);
});

test("every action that replaces the project asks first, and stops on Cancel", () => {
  const s = src("../src/lib/store.jsx");
  assert.match(s, /if \(!\(await sectionWindowsMayClose\(\)\)\) return \{ cancelled: true \}; \/\/ #2620/); // reproject
  // switch tab (#3931 also ends the load it began; #4000: the question is awaited, a newer click decides, and the rest of the switch runs on the state as it is then)
  assert.match(s, /const ok = await sectionWindowsMayClose\(\);[^\n]*\n\s+if \(seq !== switchSeqRef\.current\) return;[^\n]*\n\s+if \(!ok\) \{ endProjectLoad\(\); return; \}\n\s+switchChecked\(tabId, seq\);/);
  assert.match(s, /const switchToTab = useLatestCallback\(async \(tabId\) => \{/);
  assert.match(s, /const newWorkspaceTab = use(?:Callback|LatestCallback)\(async \(\) => \{[^\n]*\n\s+if \(!\(await sectionWindowsMayClose\(\)\)\) return false;[^\n]*\n\s+return newTabNow\(\);/);
  assert.match(s, /if \(!\(await sectionWindowsMayClose\(\)\)\) return \{ ok: false, canceled: true \}; \/\/ #2620/); // open
  assert.match(s, /if \(tabId === activeTabId && !\(await sectionWindowsMayClose\(\)\)\) return;/); // close the shown tab
  assert.match(s, /if \(hasWorkRef\.current && \(await newWorkspaceTab\(\)\) === false\) return;/); // a sample never loads over the project
  assert.equal([...s.matchAll(/sectionWindowsMayClose\(\)/g)].length, [...s.matchAll(/await sectionWindowsMayClose\(\)/g)].length, "every caller waits for the answer");
  assert.match(src("../src/App.jsx"), /if \(\(await newWorkspaceTab\(\)\) === false\) return;[^\n]*\n\s+setStartDialog/); // New project: the start dialog only when the new tab was made
  assert.match(src("../src/modules/CartographyModule.jsx"), /if \(report\?\.cancelled\) \{ setMsg\(null\); return; \}/);
});
