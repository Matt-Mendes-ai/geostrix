// TASKS.csv #1602 — a tool's outcome shows in its pane, not only in the message list below the Holes list
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("every tool pane header carries the newest message since the pane opened", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /const paneHeader = \(title, icon, tone\) => <><TaskPaneHeader [^\n]*<PaneNotice key=\{toolPane\} notices=\{notices\} \/><\/>/);
  const r = read("../src/components/Ribbon.jsx");
  assert.match(r, /export function PaneNotice\(\{ notices \}\)/);
  assert.match(r, /useState\(\(\) => notices\.length\)/, "starts from the messages already there when the pane opened");
  assert.match(r, /if \(notices\.length <= from\) return null;/);
  assert.match(r, /onClick=\{\(\) => setFrom\(notices\.length\)\}/, "dismiss");
});

test("the Model from map pane uses the shared header, so its run messages land in it", () => {
  const m = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(m, /paneHeader\("Model from map"/);
});
