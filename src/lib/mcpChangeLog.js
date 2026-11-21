// TASKS.csv #3932 (Main, 2026-11-21) — every change an AI app made this session, each with its own Undo, so it is not lost when the toast is dismissed: lib/mcpActions.js
// records them, the AI App Access window lists them. An entry's undo runs once, whether pressed in the toast or the list. Session only (it holds functions, not
// project data); the newest MAX_KEPT are kept.
const MAX_KEPT = 50;
let entries = [], seq = 0;
const listeners = new Set();
const tell = () => { for (const f of listeners) { try { f(entries); } catch { /* a closed window */ } } };

// -> the entry: { id, at, client, tool, message, canUndo, undone, undo() }
export function recordChange({ client, tool, message, revert = null, now = Date.now() }) {
  const e = { id: ++seq, at: now, client: String(client || ""), tool: String(tool || ""), message: String(message || ""), canUndo: typeof revert === "function", undone: false };
  e.undo = () => {
    if (!e.canUndo || e.undone) return false;
    e.undone = true;
    entries = entries.map((x) => (x.id === e.id ? e : x)); // a new list, so a subscriber re-renders
    try { revert(); } finally { tell(); }
    return true;
  };
  entries = [...entries, e].slice(-MAX_KEPT);
  tell();
  return e;
}
export const changeLog = () => entries;
export function onChangeLog(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function _resetChangeLog() { entries = []; seq = 0; tell(); } // tests
