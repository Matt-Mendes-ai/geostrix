// TASKS.csv #2516 (review #2486, WA lithium) — a closed project's section pop-out stayed live and its Snapshot to Layout wrote into the
// next project: loading another project now closes every section window
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("main closes every section window on the main window's request only, and forgets their tabs", () => {
  const m = src("../electron/main.js");
  const i = m.indexOf('ipcMain.handle("close-section-windows"'), body = m.slice(i, i + 600);
  assert.ok(i > 0);
  assert.match(body, /BrowserWindow\.fromWebContents\(ev\.sender\) !== mainWindow\) return \{ ok: false \}/);
  assert.match(body, /sectionTabs\.clear\(\); sectionPayloads\.clear\(\); sectionUnsaved\.clear\(\);/);
  assert.match(body, /hosts\.forEach\(\(w\) => w\.destroy\(\)\)/);
  assert.match(src("../electron/preload.js"), /closeSectionWindows: \(\) => ipcRenderer\.invoke\("close-section-windows"\)/);
});

test("every project load (viewerUiStateSeq) closes them, not the first render", () => {
  const a = src("../src/App.jsx");
  assert.match(a, /const loadSeqRef = useRef\(store\.viewerUiStateSeq\);/);
  assert.match(a, /if \(loadSeqRef\.current === store\.viewerUiStateSeq\) return;\s+loadSeqRef\.current = store\.viewerUiStateSeq;\s+closeSectionWindows\(\);/);
  const s = src("../src/lib/store.jsx");
  assert.ok((s.match(/setViewerUiStateSeq\(\(s\) => s \+ 1\)/g) || []).length >= 2); // newProject and loadProjectPayload
});
