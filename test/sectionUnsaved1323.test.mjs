import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactsKey, sectionHasUnsaved } from "../src/lib/sectionDigitise.js";

test("#1323 unsaved: a line being drawn, or lines that differ from the last saved; nothing else", () => {
  const line = { id: "a", unit: "VCL", points: [{ l: 1, z: 2 }, { l: 3, z: 4 }] };
  const saved = contactsKey([line]);
  assert.equal(sectionHasUnsaved([line], saved, []), false);
  assert.equal(sectionHasUnsaved([], contactsKey([]), []), false, "an empty new section asks nothing");
  assert.equal(sectionHasUnsaved(undefined, contactsKey([]), undefined), false);
  assert.equal(sectionHasUnsaved([line], saved, [{ l: 0, z: 0 }]), true, "half drawn");
  assert.equal(sectionHasUnsaved([line, { ...line, id: "b" }], saved, []), true, "a new line");
  assert.equal(sectionHasUnsaved([], saved, []), true, "a removed line");
  assert.equal(sectionHasUnsaved([{ ...line, points: [{ l: 1, z: 9 }, { l: 3, z: 4 }] }], saved, []), true, "a moved vertex");
});
test("#1323 every way of closing asks; a tab that already asked does not ask twice", () => {
  const main = readFileSync("electron/main.js", "utf8");
  assert.match(main, /win\.on\("close", \(e\) => \{ if \(!mayCloseSections\(win,/);
  assert.match(main, /mayCloseSections\(mainWindow, \[\.\.\.sectionTabs\.keys\(\)\]\)/);
  const closed = main.slice(main.indexOf('ipcMain.handle("section-tab-closed"'), main.indexOf('ipcMain.handle("section-tab-popout"'));
  assert.ok(closed.indexOf("sectionUnsaved.delete(id)") < closed.indexOf("win.close()"));
  const tabs = readFileSync("src/components/SectionTabs.jsx", "utf8");
  assert.match(tabs, /unsaved\.current\.has\(id\) && !window\.confirm\(/);
});
