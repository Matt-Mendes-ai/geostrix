// TASKS.csv #565 — every menu action main.js sends has a handler in App.jsx, the navigation accelerators follow the
// tab strip, and the shortcut help lists what the menu really does (the drift #32 was meant to prevent).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const help = readFileSync(new URL("../src/components/ShortcutsModal.jsx", import.meta.url), "utf8");

test("#565 every menu action is handled in App.jsx", () => {
  const actions = new Set([...main.matchAll(/send\("menu", "([^"]+)"\)/g), ...main.matchAll(/sendMenuWithGesture\("([^"]+)"\)/g)].map((m) => m[1]));
  assert.ok(actions.size >= 10);
  for (const a of actions) {
    if (a.startsWith("module-")) continue; // handled generically
    assert.ok(app.includes(`action === "${a}"`), `no handler for menu action "${a}"`);
  }
  assert.ok(main.includes("module-${id}") && app.includes('action.startsWith("module-")'));
});

test("#565 Ctrl+1..8 follow the tab strip, and the help says so", () => {
  const tabs = [...app.matchAll(/\{ id: "([a-z]+)", label: "([^"]+)", icon:/g)].map((m) => m[1]);
  const menuOrder = [...main.matchAll(/\["[^"]+", "([a-z]+)"\]/g)].map((m) => m[1]).filter((id) => tabs.includes(id));
  assert.deepEqual(menuOrder, tabs);
  tabs.forEach((_, i) => assert.ok(help.includes(`"Ctrl/Cmd+${i + 1}"`), `help lacks Ctrl/Cmd+${i + 1}`));
  assert.ok(!help.includes("cross-section pop-out"));
});
