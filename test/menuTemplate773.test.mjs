// TASKS.csv #773 / #774 — the application menu (electron/menuTemplate.js): the macOS shape, and Windows/Linux exactly as
// it was before the Mac work (labels, accelerators, roles and order, item for item).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require("../electron/menuTemplate.js");

function make(over = {}) {
  const sent = [];
  const calls = { gesture: [], toggles: [], checks: 0 };
  const template = buildMenuTemplate({
    isMac: false, isPackaged: true, appName: "GeoStrix", updatesEnabled: true, checkUpdatesAtStartup: true,
    send: (a) => sent.push(a), sendWithGesture: (a) => calls.gesture.push(a),
    onToggleStartupCheck: (c) => calls.toggles.push(c), onCheckForUpdates: () => { calls.checks++; },
    ...over,
  });
  return { template, sent, calls };
}
// a menu as plain text: "label|accelerator" for items, "role:x" for roles, "-" for separators
const flat = (items) => items.map((i) => (i.type === "separator" ? "-" : i.role && !i.submenu ? `role:${i.role}` : `${i.label}${i.accelerator ? `|${i.accelerator}` : ""}`));
const menu = (template, label) => template.find((m) => m.label === label);

test("Windows/Linux: the same menu as before the macOS work", () => {
  const { template } = make();
  assert.deepEqual(template.map((m) => m.label), ["File", "Edit", "View", "Tools", "Help"]);
  assert.deepEqual(flat(menu(template, "File").submenu), [
    "New Project|CmdOrCtrl+N", "Open Project…|CmdOrCtrl+O", "Save Project|CmdOrCtrl+S", "Save Project As…|CmdOrCtrl+Shift+S", "-",
    "Import CSV…|CmdOrCtrl+I", "Import Assays…", "Import pXRF…", "-", "Export PDF…|CmdOrCtrl+P", "-", "role:quit",
  ]);
  // TASKS.csv #31 — no accelerators on Undo/Redo here, and no edit roles
  assert.deepEqual(flat(menu(template, "Edit").submenu), ["Undo", "Redo"]);
  assert.deepEqual(flat(menu(template, "View").submenu), [
    "3D View|CmdOrCtrl+1", "3D Modelling|CmdOrCtrl+2", "Geochem|CmdOrCtrl+3", "Geophysics|CmdOrCtrl+4", "Targeting|CmdOrCtrl+5",
    "Maps|CmdOrCtrl+6", "Layout|CmdOrCtrl+7", "-", "role:resetzoom", "role:zoomin", "role:zoomout",
  ]);
  assert.deepEqual(flat(menu(template, "Tools").submenu), ["Draw a cross-section|CmdOrCtrl+Shift+C", "Project CRS (Cartography)…"]);
  assert.deepEqual(flat(menu(template, "Help").submenu), [
    "Keyboard Shortcuts|CmdOrCtrl+/", "Check for Updates at Startup", "Check for Updates…", "-",
    "Report a Problem…", "Third-party Licences…", "About GeoStrix",
  ]);
  assert.equal(menu(template, "Help").role, undefined);
});

test("development builds keep Reload / DevTools in View (#464)", () => {
  const { template } = make({ isPackaged: false });
  assert.deepEqual(flat(menu(template, "View").submenu).slice(7, 11), ["-", "role:reload", "role:toggledevtools", "-"]);
});

test("macOS: app menu first, with About / Services / Hide / Quit", () => {
  const { template, sent } = make({ isMac: true, updatesEnabled: false });
  assert.deepEqual(template.map((m) => m.label ?? `role:${m.role}`), ["GeoStrix", "File", "Edit", "View", "Tools", "role:windowMenu", "Help"]);
  assert.deepEqual(flat(template[0].submenu), ["About GeoStrix", "-", "role:services", "-", "role:hide", "role:hideOthers", "role:unhide", "-", "role:quit"]);
  template[0].submenu[0].click();
  assert.deepEqual(sent, ["about"]);
});

test("macOS: File ends with Close Window instead of Quit", () => {
  const file = flat(menu(make({ isMac: true }).template, "File").submenu);
  assert.equal(file.at(-1), "role:close");
  assert.ok(!file.includes("role:quit"));
});

test("macOS: Edit carries the keys a Mac text field needs", () => {
  const { template, sent } = make({ isMac: true });
  const edit = menu(template, "Edit").submenu;
  assert.deepEqual(flat(edit), ["Undo|Cmd+Z", "Redo|Shift+Cmd+Z", "-", "role:cut", "role:copy", "role:paste", "role:pasteAndMatchStyle", "role:delete", "role:selectAll"]);
  // Undo/Redo still go to the page (focus-aware there, App.jsx), not to a native role
  edit[0].click(); edit[1].click();
  assert.deepEqual(sent, ["undo", "redo"]);
});

test("macOS: full screen in View, Help is the system Help menu without About", () => {
  const { template } = make({ isMac: true });
  assert.equal(flat(menu(template, "View").submenu).at(-1), "role:togglefullscreen");
  const help = menu(template, "Help");
  assert.equal(help.role, "help");
  assert.ok(!flat(help.submenu).includes("About GeoStrix"));
});

test("#774: no update items when updates are off, and they work when on", () => {
  const off = flat(menu(make({ isMac: true, updatesEnabled: false }).template, "Help").submenu);
  assert.ok(!off.some((l) => /Update/.test(l)), off.join(", "));
  const { template, calls } = make({ checkUpdatesAtStartup: false });
  const help = menu(template, "Help").submenu;
  const startup = help.find((i) => i.label === "Check for Updates at Startup");
  assert.equal(startup.checked, false);
  startup.click({ checked: true });
  help.find((i) => i.label === "Check for Updates…").click();
  assert.deepEqual(calls.toggles, [true]);
  assert.equal(calls.checks, 1);
});

test("menu items send their actions; imports go through the gesture path (#565)", () => {
  const { template, sent, calls } = make();
  for (const m of template) for (const i of m.submenu || []) if (i.click && !/Update/.test(i.label)) i.click({});
  assert.deepEqual(calls.gesture, ["import-csv", "import-assays", "import-pxrf"]);
  assert.deepEqual(sent, ["new-project", "open-project", "save-project", "save-project-as", "export-pdf", "undo", "redo",
    "module-viewer", "module-modelling", "module-geochem", "module-geophysics", "module-targeting", "module-maps", "module-layout",
    "cross-section", "set-epsg", "shortcuts", "report-problem", "licenses", "about"]);
});
