// TASKS.csv #1979 — the Geophysics tab shows the 3D View's own viewport beside its sidebar (one scene, no second renderer)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("App shows the one ViewerModule, bare, while Geophysics asks for it, and keeps its store live then", () => {
  const a = read("../src/App.jsx");
  assert.match(a, /const viewerShown = !!VIEWER_MODES\[active\] \|\| \(active === "geophysics" && geo3d\);/);
  assert.match(a, /<FreezeStore frozen=\{!viewerShown\}>/);
  assert.match(a, /visible=\{viewerShown\} bare=\{!VIEWER_MODES\[active\]\}/);
  assert.match(a, /<GeophysicsModule onMain3d=\{setGeo3d\} \/>/);
  assert.equal((a.match(/<MemoViewerModule /g) || []).length, 1); // still one instance
});

test("bare: no ribbon, no sidebar, no drop import; the viewport sits after the Geophysics sidebar", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /export default function ViewerModule\(\{ mode = "view", visible = true, bare = false \}\)/);
  assert.equal((v.match(/show=\{visible\}/g) || []).length, 0);
  assert.ok((v.match(/show=\{visible && !bare\}/g) || []).length >= 5);
  assert.match(v, /order: bare \? 1 : 0/);
  assert.match(v, /display: bare \? "none" : "flex"/);
  assert.match(v, /onDrop=\{bare \? \(e\) => \{ e\.preventDefault\(\); requestModuleAction\("geophysics-drop"/); // #2848: bare forwards its drops to the Geophysics tab
});

test("Geophysics: the 3D view unless a pane put results in the area, or nothing is loaded; never when embedded in Maps", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const show3d = !embedded && !!onMain3d && !hasResults && \(collars\.length > 0 \|\| rows\.length > 0/);
  assert.match(g, /new MutationObserver\(check\)/);
  assert.match(g, /useEffect\(\(\) => \{ onMain3d\?\.\(show3d\); \}, \[onMain3d, show3d\]\);/);
  assert.match(g, /useEffect\(\(\) => \(\) => onMain3d\?\.\(false\), \[onMain3d\]\);/);
  assert.match(g, /style=\{\{ display: show3d \? "none" : "flex",/); // the results slot stays mounted, hidden, so panes can still fill it
  assert.match(g, /style=\{embedded \|\| show3d \? \{ flex: "0 0 auto", minWidth: 0 \} : \{ width: "100%" \}\}/);
});
