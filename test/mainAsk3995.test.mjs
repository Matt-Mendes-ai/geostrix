// TASKS.csv #3995 (follow-up to #3957; Matt, v0.2.6: "a bunch of boxes are windows dialog") — the main process's own questions (install an update with unsaved work, quit without saving, close
// section windows with unsaved lines) are asked in the window's in-app dialog through an IPC round trip (electron/mainAsk.js), natively only when the window cannot answer. The four that stay
// native stay native on purpose, said in a comment. Fakes for ipcMain and the window; no Electron here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAsker } = require("../electron/mainAsk.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPEC = { title: "Unsaved changes", message: "This project has unsaved changes.", detail: "Quit anyway?", buttons: [{ label: "Quit Without Saving", value: "quit" }, { label: "Cancel", value: "cancel", primary: true }], cancelValue: "cancel" };

function world({ ackMs = 60, crashed = false, destroyed = false } = {}) {
  const ipc = new EventEmitter(), wc = new EventEmitter(), win = new EventEmitter(), sent = [], native = [];
  wc.send = (ch, msg) => sent.push([ch, msg]); wc.isDestroyed = () => false; wc.isCrashed = () => crashed;
  win.webContents = wc; win.isDestroyed = () => destroyed;
  const nativeAsk = async (w, spec) => { native.push([w === win, spec.title]); return "native-answer"; };
  const ask = createAsker({ ipc, nativeAsk, ackMs });
  const reply = (id, value, sender = wc) => ipc.emit("main-ask-answer", { sender }, id, value);
  const ack = (id, sender = wc) => ipc.emit("main-ask-ack", { sender }, id);
  return { ask, ipc, wc, win, sent, native, reply, ack };
}

test("#3995 the question goes to the window and its answer comes back: the button's value; Escape (null) and an unknown value are the cancel answer", async () => {
  const w = world();
  const p = w.ask(w.win, SPEC);
  assert.equal(w.sent.length, 1); const [ch, msg] = w.sent[0];
  assert.equal(ch, "main-ask"); assert.deepEqual([msg.title, msg.message, msg.detail, msg.cancelValue], ["Unsaved changes", "This project has unsaved changes.", "Quit anyway?", "cancel"]);
  assert.deepEqual(msg.buttons.map((b) => b.value), ["quit", "cancel"]); assert.equal(msg.buttons[1].primary, true);
  w.ack(msg.id); w.reply(msg.id, "quit");
  assert.equal(await p, "quit");
  assert.deepEqual(w.native, [], "no OS box");
  const p2 = w.ask(w.win, SPEC); w.ack(w.sent[1][1].id); w.reply(w.sent[1][1].id, null);
  assert.equal(await p2, "cancel", "Escape");
  const p3 = w.ask(w.win, SPEC); w.ack(w.sent[2][1].id); w.reply(w.sent[2][1].id, "format-disk");
  assert.equal(await p3, "cancel", "a value that is not one of the buttons cannot be an answer");
  assert.equal(w.ipc.listenerCount("main-ask-answer"), 0, "listeners are taken off");
});

test("#3995 answers for another question or from another window are ignored", async () => {
  const w = world();
  const p = w.ask(w.win, SPEC); const id = w.sent[0][1].id; w.ack(id);
  w.reply(id + 99, "quit"); w.reply(id, "quit", new EventEmitter());
  let settled = false; p.then(() => { settled = true; }); await sleep(20);
  assert.equal(settled, false, "still waiting for the right answer");
  w.reply(id, "cancel"); assert.equal(await p, "cancel");
});

test("#3995 a window that does not acknowledge within the time (hung, or no dialog host) is asked natively, and the in-app question is taken down", async () => {
  const w = world({ ackMs: 30 });
  const p = w.ask(w.win, SPEC);
  assert.equal(await p, "native-answer"); assert.deepEqual(w.native, [[true, "Unsaved changes"]]);
  assert.equal(w.sent.at(-1)[0], "main-ask-cancel", "a dialog that came up late is dismissed"); assert.equal(w.sent.at(-1)[1], w.sent[0][1].id);
  w.reply(w.sent[0][1].id, "quit"); await sleep(5); assert.equal(w.native.length, 1, "a late answer does nothing");
  // acknowledged in time: the person may take as long as they like
  const w2 = world({ ackMs: 30 });
  const q = w2.ask(w2.win, SPEC); w2.ack(w2.sent[0][1].id);
  let done = false; q.then(() => { done = true; }); await sleep(100);
  assert.equal(done, false); assert.deepEqual(w2.native, []);
  w2.reply(w2.sent[0][1].id, "quit"); assert.equal(await q, "quit");
});

test("#3995 a window that is gone, crashed or dies while the question is up is asked natively", async () => {
  for (const opts of [{ destroyed: true }, { crashed: true }]) { const w = world(opts); assert.equal(await w.ask(w.win, SPEC), "native-answer"); assert.deepEqual(w.sent, [], "nothing was sent to a window that cannot show it"); }
  assert.equal(await createAsker({ ipc: new EventEmitter(), nativeAsk: async () => "n" })(null, SPEC), "n", "no window at all");
  const w = world();
  const p = w.ask(w.win, SPEC); w.ack(w.sent[0][1].id);
  w.wc.emit("render-process-gone", {}); // the renderer dies with the question up
  assert.equal(await p, "native-answer");
  const w3 = world(); const p3 = w3.ask(w3.win, SPEC); w3.ack(w3.sent[0][1].id); w3.win.emit("closed");
  assert.equal(await p3, "native-answer", "the window closed under it");
  const w4 = world(); w4.wc.send = () => { throw new Error("Object has been destroyed"); };
  assert.equal(await w4.ask(w4.win, SPEC), "native-answer", "a send that throws falls back too");
});

test("#3995 main.js: the three questions ask the window (a hung renderer still reaches the OS box), the four natives say why they stay native", () => {
  const m = read("../electron/main.js");
  assert.match(m, /const \{ createAsker \} = require\("\.\/mainAsk\.js"\);/);
  assert.match(m, /const askRenderer = createAsker\(\{ ipc: ipcMain, nativeAsk \}\);/);
  // (1) install an update
  assert.match(m, /const answer = await askRenderer\(mainWindow, \{ \/\/ #3995 — in the window's own dialog; the OS box when it cannot answer\n\s+title: "Unsaved changes",\n\s+message: "Save your project before installing the update\."/);
  assert.match(m, /if \(answer !== "install"\) return \{ ok: false, cancelled: true \};/);
  // (2) quit without saving, one set of questions at a time, the confirmed close let through
  assert.match(m, /let closeAsking = false, closeConfirmed = false;/);
  assert.match(m, /if \(!rendererDirty && !\[\.\.\.sectionTabs\.keys\(\)\]\.some\(\(id\) => sectionUnsaved\.has\(id\)\)\) return; \/\/ nothing to ask: it closes as it is/, "no question: the close is not held");
  assert.match(m, /buttons: \[\{ label: "Quit Without Saving", value: "quit" \}, \{ label: "Cancel", value: "cancel", primary: true \}\], cancelValue: "cancel"/, "Cancel is the default");
  assert.match(m, /if \(closeAsking\) return; \/\/ a second click on the X while the question is up/);
  assert.match(m, /closeConfirmed = true;\n\s+mainWindow\.close\(\);\n\s+\} finally \{ closeAsking = false; closeConfirmed = false; \}/);
  // (3) sections with unsaved lines: on the main window's close and on a section window's own
  assert.match(m, /async function mayCloseSectionsAsk\(win, ids\) \{/);
  assert.match(m, /if \(!\(await mayCloseSectionsAsk\(mainWindow, \[\.\.\.sectionTabs\.keys\(\)\]\)\)\) return;/);
  assert.match(m, /mayCloseSectionsAsk\(win, ids\)\.then\(\(ok\) => \{ if \(ok && !win\.isDestroyed\(\)\) \{ sectionCloseConfirmed = true; win\.close\(\); \} \}\)/);
  assert.doesNotMatch(m, /dialog\.showMessageBoxSync\(mainWindow, \{\s+type: "warning",\s+buttons: \["Quit Without Saving"/, "the blocking quit box is gone");
  // the natives, each with its reason
  const nativeCalls = [...m.matchAll(/dialog\.showMessageBox(Sync)?\(/g)].length;
  assert.equal(nativeCalls, 6, "the OS box helper, the crashed renderer, the synchronous sections check, the network folder, the two AI questions");
  assert.equal((m.match(/NATIVE ON PURPOSE/g) || []).length, 4, "the list at the top, and the crashed renderer, the synchronous sections check and the network folder each say why where they are");
  assert.match(m, /STAY NATIVE ON PURPOSE \(each says why where it is\): the crashed renderer/);
  assert.match(m, /the two questions below \(allow an AI app to read \/ change the project, allow its download\) are asked in an OS box ON PURPOSE/);
  assert.match(m, /an OS dialog cannot be drawn, clicked or answered by page content or by a script running in the renderer/);
  assert.match(m, /the SYNCHRONOUS check a project load makes/);
});

test("#3995 the window side: the host draws the question and answers (acknowledging first), a cancel takes it down; preload carries the three channels; the texts are in every language", () => {
  const host = read("../src/components/ConfirmHost.jsx");
  assert.match(host, /return d\.onMainAsk\(async \(req\) => \{/);
  assert.match(host, /d\.mainAskAck\(req\.id\);\n\s+const text = /);
  assert.match(host, /const v = await askChoice\(text, req\.buttons, \{ signal: ctl\.signal \}\);\n\s+if \(!ctl\.signal\.aborted\) d\.mainAskAnswer\(req\.id, v \?\? req\.cancelValue\);/);
  assert.match(host, /\(id\) => live\.get\(id\)\?\.abort\(\)\);/);
  assert.match(host, /req\.onGone = \(\) => setQueue\(\(q\) => q\.filter\(\(r\) => r !== req\)\);/);
  const lib = read("../src/lib/confirmDialog.js");
  assert.match(lib, /export function askChoice\(message, choices, \{ signal \} = \{\}\) \{/);
  assert.match(lib, /signal\.addEventListener\("abort", gone, \{ once: true \}\);/);
  const pre = read("../electron/preload.js");
  assert.match(pre, /onMainAsk: \(onAsk, onCancel\) =>/); assert.match(pre, /ipcRenderer\.send\("main-ask-ack", id\)/); assert.match(pre, /ipcRenderer\.send\("main-ask-answer", id, value\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["Save your project before installing the update.", "Cancel — I'll save first", "Install without saving", "This project has unsaved changes.", "Quit Without Saving", "Unsaved changes"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
