// TASKS.csv #3932 (Matt's decision, 2026-11-21) — AI apps that make changes, commit 2: the action bridge (src/lib/mcpActions.js). One change, one step: a checkpoint before
// and a labelled one after; a toast with an Undo that reverts exactly that change; short answers; a failure inside the app said plainly. The store is stubbed; the actions
// are made up (the real tools come in the next commits).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runChange, ACTIONS } from "../src/lib/mcpActions.js";
import { undoTooltip } from "../src/lib/undoLabels.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function fakeStore() {
  const log = [];
  const s = { sections: [{ id: "s1", name: "Old" }], log };
  s.undoCheckpoint = (label) => log.push(["checkpoint", label ?? null]);
  s.setSections = (fn) => { s.sections = typeof fn === "function" ? fn(s.sections) : fn; log.push(["setSections", s.sections.map((x) => x.name)]); };
  return s;
}
const ADD = {
  add_thing: async (args, s) => {
    s.setSections((L) => [...L, { id: "s2", name: args.name }]);
    return { ok: true, tracked: true, data: { changed: "section", name: args.name, id: "s2" }, say: `added section '${args.name}'`, revert: (st) => st.setSections((L) => L.filter((x) => x.id !== "s2")) };
  },
  refuse_thing: async () => ({ ok: false, error: "A terrain is already loaded: remove it in GeoStrix first." }),
  throw_thing: async () => { throw new Error("at C:\\inside\\stack.js line 3"); },
  view_thing: async () => ({ ok: true, tracked: false, data: { changed: "view" }, say: "coloured the holes", revert: () => {} }),
};

test("#3932 one change, one step: a checkpoint before, the change, a labelled checkpoint after; a short answer; a toast with Undo that reverts only that change", async () => {
  const s = fakeStore(); const toasts = []; let settled = 0;
  const r = await runChange("add_thing", { name: "A-A" }, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => { settled++; }, actions: ADD });
  assert.deepEqual(r, { ok: true, data: { ok: true, changed: "section", name: "A-A", id: "s2" } });
  assert.deepEqual(s.log, [["checkpoint", null], ["setSections", ["Old", "A-A"]], ["checkpoint", "Claude Desktop: added section 'A-A'"]]);
  assert.equal(settled, 1, "waited for the render before closing the step");
  assert.equal(toasts.length, 1); assert.equal(toasts[0].message, "Claude Desktop: added section 'A-A'"); assert.equal(toasts[0].ok, true);
  s.setSections((L) => [...L, { id: "u1", name: "The user's own" }]); // the user works on
  toasts[0].undo();
  assert.deepEqual(s.sections.map((x) => x.name), ["Old", "The user's own"], "only what the AI app added is taken back");
  assert.deepEqual(s.log.slice(-2)[0], ["checkpoint", null], "the toast's Undo is its own step too (the user's edit before it stays one)");
});

test("#3932 a change outside the undo history (the view) gets no label; a refusal, a failure, an unknown tool or no project change nothing and say why", async () => {
  const s = fakeStore(); const toasts = [];
  const ctx = { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {}, actions: ADD };
  assert.equal((await runChange("view_thing", {}, ctx)).ok, true);
  assert.deepEqual(s.log.at(-1), ["checkpoint", null]); assert.equal(toasts.at(-1).message, "Claude Desktop: coloured the holes"); assert.equal(typeof toasts.at(-1).undo, "function");
  const n = toasts.length;
  assert.deepEqual(await runChange("refuse_thing", {}, ctx), { ok: false, error: "A terrain is already loaded: remove it in GeoStrix first." });
  assert.deepEqual(await runChange("throw_thing", {}, ctx), { ok: false, error: "The change could not be made." }, "the inside story (a path, a stack) never goes out");
  assert.match((await runChange("toString", {}, ctx)).error, /^Unknown change tool/, "only the bridge's own actions, not inherited names");
  assert.match((await runChange("nope", {}, ctx)).error, /^Unknown change tool/);
  assert.deepEqual(await runChange("add_thing", { name: "x" }, { ...ctx, getStore: () => null }), { ok: false, error: "GeoStrix has no project open to change." });
  assert.equal(toasts.length, n, "nothing to show for what was not done");
  assert.deepEqual(Object.keys(ACTIONS).filter((k) => !/^[a-z_]+$/.test(k)), [], "the real actions are plain tool names");
});

test("#3932 the Undo button's tooltip names a step an AI app made by what it did", () => {
  assert.match(undoTooltip("undo", { keys: ["sections"], label: "Claude Desktop: added section 'A-A'" }), /takes back: Claude Desktop: added section 'A-A'\./);
  assert.match(undoTooltip("undo", { keys: ["sections"] }), /takes back: sections\./, "the user's own steps as before");
  assert.match(undoTooltip("redo", { keys: ["sections"], label: "x" }), /puts back: sections\./);
});

test("#3932 wiring: change requests go to mcpActions.js (lazy) with the live store and the toast; the store keeps the step's label; the toast's Undo button; the client's name sent with the call", () => {
  const desk = read("../src/lib/desktop.js"), app = read("../src/App.jsx"), store = read("../src/lib/store.jsx"), toast = read("../src/components/ExportToast.jsx"), host = read("../electron/mcpHost.js"), proto = read("../electron/mcpProtocol.js"), acts = read("../src/lib/mcpActions.js").replace(/\/\/[^\n]*/g, ""); // the code, without its comments
  assert.match(desk, /if \(req\?\.change\) \{\n\s+try \{ const \{ runChange \} = await import\("\.\/mcpActions\.js"\); d\.mcpRespond\(req\.id, await runChange\(req\.name, req\.args, \{ getStore, client: req\.client, toast: announce \}\)\); \}/);
  assert.ok(!/^import[^\n]*mcpActions/m.test(desk) && !/^import[^\n]*mcpActions/m.test(app), "loaded on the first change only");
  assert.match(app, /onMcpRequest\(\(\) => \{[^\n]*\}, \(\) => storeNow\.current/);
  assert.match(store, /if \(typeof label === "string" && label\) undoStepLabels\.current\.set\(undoBeforeBurst\.current, label\.slice\(0, 160\)\);/);
  assert.match(store, /label: undoStepLabels\.current\.get\(top\) \|\| null/);
  assert.match(toast, /typeof x\.undo === "function" && <button type="button" onClick=\{\(\) => \{ setItems\(\(L\) => L\.filter\(\(y\) => y\.id !== x\.id\)\); x\.undo\(\); \}\}/);
  assert.match(host, /\.\.\.\(meta\.change \? \{ change: true \} : \{\}\)/);
  assert.match(proto, /callTool\(name, params\?\.arguments \|\| \{\}, change \? \{ client, change, \.\.\.\(isNetworkTool\(def\) \? \{ network: true \} : \{\}\) \} : \{ client \}\)/);
  assert.ok(!/window\.desktop|from "\.\/desktop\.js"/.test(acts), "the bridge never reaches the IPC wrappers");
});
