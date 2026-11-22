"use strict";
// TASKS.csv #3995 (Matt, v0.2.6: "a bunch of boxes are windows dialog"; #3957 moved the renderer's own confirms to the in-app dialog) — three questions the MAIN process asks (install an update with
// unsaved work, quit without saving, close section windows with unsaved lines) now put the question in the window's in-app dialog (components/ConfirmHost.jsx, lib/confirmDialog.js askChoice)
// through an IPC round trip, and fall back to the native OS box when the window cannot answer: it is gone or crashed, it does not acknowledge the question within ackMs (a hung or busy
// renderer, a window with no ConfirmHost), or it dies while the question is up. So quitting a hung app still works.
//   main -> window  "main-ask"        { id, title, message, detail, buttons: [{ label, value, primary? }], cancelValue }   (English keys: the window translates them)
//   window -> main  "main-ask-ack"    id                      (the in-app dialog is up)
//   window -> main  "main-ask-answer" id, value               (the button clicked, or null for Escape / a click outside: the cancelValue)
//   main -> window  "main-ask-cancel" id                      (main gave up and asked natively: the in-app dialog, if it came up late, is taken down)
// Not used for what must stay native by design (see electron/main.js): a crashed renderer (nothing in-app can show), a network folder, an AI app's read / change / download requests: an OS
// dialog cannot be drawn or clicked by page content or a script running in the renderer, which is the point of asking there. Electron is injected, so a test drives it with fakes.
const ACK_MS = 2000;

// ipc: { on, removeListener } (ipcMain); nativeAsk(win, spec) -> Promise<value> (the OS box); spec: { title, message, detail, buttons: [{ label, value, primary? }], cancelValue }
function createAsker({ ipc, nativeAsk, ackMs = ACK_MS }) {
  let seq = 0;
  const alive = (win) => { try { return !!win && !win.isDestroyed() && !win.webContents.isDestroyed() && !win.webContents.isCrashed?.(); } catch { return false; } };
  return function ask(win, spec) {
    if (!alive(win)) return Promise.resolve(nativeAsk(win, spec));
    const id = ++seq, wc = win.webContents, values = new Set(spec.buttons.map((b) => b.value));
    return new Promise((resolve) => {
      let acked = false, done = false, timer = null;
      const cleanup = () => { done = true; clearTimeout(timer); ipc.removeListener("main-ask-ack", onAck); ipc.removeListener("main-ask-answer", onAnswer); try { wc.removeListener("render-process-gone", giveUp); win.removeListener("closed", giveUp); } catch { /* gone */ } };
      const onAck = (e, aid) => { if (aid === id && e.sender === wc) acked = true; };
      const onAnswer = (e, aid, value) => { if (aid !== id || e.sender !== wc || done) return; cleanup(); resolve(values.has(value) ? value : spec.cancelValue); };
      const giveUp = () => {
        if (done) return;
        cleanup();
        if (alive(win)) { try { wc.send("main-ask-cancel", id); } catch { /* gone */ } } // a late in-app dialog must not outlive the native one
        resolve(nativeAsk(alive(win) ? win : undefined, spec));
      };
      ipc.on("main-ask-ack", onAck); ipc.on("main-ask-answer", onAnswer);
      try { wc.on("render-process-gone", giveUp); win.on("closed", giveUp); } catch { /* gone */ }
      timer = setTimeout(() => { if (!acked) giveUp(); }, ackMs);
      try { wc.send("main-ask", { id, title: spec.title, message: spec.message, detail: spec.detail || "", buttons: spec.buttons, cancelValue: spec.cancelValue }); } catch { giveUp(); }
    });
  };
}

module.exports = { createAsker, ACK_MS };
