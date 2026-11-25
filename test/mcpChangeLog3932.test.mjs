// TASKS.csv #3932 (Main, 2026-11-21) — every AI change stays undoable, exactly: its toast stays until dismissed, and the AI App Access window lists each change with its own
// Undo (lib/mcpChangeLog.js), the same Undo as the toast's, which runs once from either place. Stand-in store; made-up names.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recordChange, changeLog, onChangeLog, _resetChangeLog } from "../src/lib/mcpChangeLog.js";
import { runChange } from "../src/lib/mcpActions.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3932 the change log: an entry's Undo runs once, from the toast or the list; listeners told; the newest 50 kept; one without a revert has no Undo", () => {
  _resetChangeLog();
  let reverts = 0, told = 0;
  const off = onChangeLog(() => told++);
  const e = recordChange({ client: "Claude Desktop", tool: "set_view", message: "Claude Desktop: turned the view to the top", revert: () => reverts++, now: 5 });
  assert.deepEqual([e.canUndo, e.undone, changeLog().length, told], [true, false, 1, 1]);
  assert.equal(e.undo(), true); assert.equal(e.undo(), false, "a second press does nothing");
  assert.deepEqual([reverts, changeLog()[0].undone, told], [1, true, 2]);
  const none = recordChange({ client: "x", tool: "y", message: "m" });
  assert.deepEqual([none.canUndo, none.undo()], [false, false]);
  for (let i = 0; i < 60; i++) recordChange({ client: "x", tool: "t", message: `m${i}`, revert: () => {} });
  assert.equal(changeLog().length, 50); assert.equal(changeLog().at(-1).message, "m59");
  off(); recordChange({ client: "x", tool: "t", message: "after" }); assert.equal(told, 63, "no longer told once unsubscribed"); // 1 + the undo + 1 + 60
  _resetChangeLog();
});

test("#3932 runChange: the toast stays (sticky), the change is listed, and its toast's Undo and its list's Undo are one", async () => {
  _resetChangeLog();
  const s = { sections: [], undoCheckpoint() {}, goToModule() {}, upsertSection(x) { s.sections = [...s.sections, x]; }, deleteSection(id) { s.sections = s.sections.filter((x) => x.id !== id); } };
  const toasts = [];
  const run = (args) => runChange("make_section", args, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {} });
  await run({ from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, name: "A-A" });
  await run({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, name: "B-B" });
  assert.equal(toasts[0].sticky, true, "stays until dismissed");
  assert.deepEqual(changeLog().map((c) => [c.tool, c.message, c.canUndo]), [["make_section", "Claude Desktop: added section 'A-A'", true], ["make_section", "Claude Desktop: added section 'B-B'", true]]);
  changeLog()[0].undo(); // from the list, after its toast was dismissed
  assert.deepEqual(s.sections.map((x) => x.name), ["B-B"]);
  toasts[0].undo(); // the same change's toast: nothing more
  assert.deepEqual(s.sections.map((x) => x.name), ["B-B"]);
  toasts[1].undo(); assert.equal(s.sections.length, 0);
  assert.deepEqual(changeLog().map((c) => c.undone), [true, true]);
  // a refused change is not listed
  await runChange("make_section", { along_hole: "DH-99" }, { getStore: () => ({ ...s, collars: [] }), client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {} });
  assert.equal(changeLog().length, 2);
  _resetChangeLog();
});

test("#3932 wiring: the toast is not timed out when sticky; the AI App Access window lists the changes with Undo / Undone and says plainly what reading alone does", () => {
  const toast = read("../src/components/ExportToast.jsx"), modal = read("../src/components/AiAccessModal.jsx");
  assert.match(toast, /if \(d\.ok && !d\.sticky\) setTimeout\(/);
  assert.match(modal, /import \{ changeLog, onChangeLog \} from "\.\.\/lib\/mcpChangeLog\.js";/);
  assert.match(modal, /useEffect\(\(\) => onChangeLog\(\(L\) => setChanges\(L\)\), \[\]\);/);
  // #4073 — the Activity step lists them (its own step, not behind the access switch)
  const activity = modal.slice(modal.indexOf('{ key: "activity"'), modal.indexOf("];", modal.indexOf('{ key: "activity"')));
  assert.ok(activity.includes("changes.slice().reverse().map(") && !/\{on && /.test(activity), "listed whether or not access is still on");
  assert.match(modal, /c\.undone \? <span>\{tr\("Undone"\)\}<\/span> : c\.canUndo \? <button className="gs-btn gs-btn--sm" type="button" onClick=\{\(\) => c\.undo\(\)\}/);
  assert.ok(!/It cannot change the project, open files or use any password\. It works/.test(modal), "the old read-only line, which the changes switch made untrue, is gone");
  assert.match(modal, /It changes nothing unless you also tick 'Allow AI apps to make changes' below/);
});
