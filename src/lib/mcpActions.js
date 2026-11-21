// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the change tools an AI app may call through AI App Access, when the user has ticked 'Allow AI apps to make changes'
// (the main process refuses them otherwise, electron/mcpProtocol.js, before they get here). Loaded on the first change, like mcpTools.js.
//  - Store actions only: an action calls the same store functions the buttons call, and never window.desktop (no file, dialog, database or sidecar is reachable).
//  - Nothing deletes or overwrites: an action only adds (a section, an intercept set, a Layout page, a raster) or changes what is shown; one that would replace
//    something refuses and says why.
//  - One action, one step: undoCheckpoint() before (the user's own last edit is its own step) and after (labelled with what the AI app did, for the Undo
//    button's tooltip). What is in the undo history (sections, intercept sets, Layout pages) is taken back by Ctrl+Z; what never was (the view: hole colours,
//    layers shown, the camera; rasters and the terrain) by the toast's Undo, which reverts exactly that change and nothing else.
//  - Every change shows: a toast says what was done, with Undo; the AI App Access window lists the call; the answer to the app is short ({ ok, changed, name, id }).
import { t as tr } from "./i18n.js";

// name -> async (args, store, ctx) => { ok, data: { changed, name?, id? }, say (translated, for the toast), tracked (in the undo history), revert(store) } | { ok: false, error }
export const ACTIONS = {};
export const CHANGE_TOOL_NAMES = () => Object.keys(ACTIONS);
const SETTLE_MS = 60; // the store's undo bookkeeping runs after React has rendered the change
export const settleRender = () => new Promise((r) => setTimeout(r, SETTLE_MS));

export async function runChange(name, args, { getStore, client = "An AI app", toast = () => {}, settle = settleRender, actions = ACTIONS } = {}) {
  const act = typeof name === "string" && Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
  if (!act) return { ok: false, error: `Unknown change tool: ${String(name).slice(0, 40)}` };
  const s = getStore?.();
  if (!s) return { ok: false, error: "GeoStrix has no project open to change." };
  try { s.undoCheckpoint?.(); } catch { /* no history */ }
  let r;
  try { r = await act(args && typeof args === "object" ? args : {}, s, { getStore, client }); } catch { return { ok: false, error: "The change could not be made." }; } // a stack or a path never goes out
  if (!r?.ok) return { ok: false, error: String(r?.error || "The change could not be made.").slice(0, 400) };
  await settle();
  const said = r.say ? tr("{client}: {what}", { client, what: r.say }) : "";
  try { getStore?.()?.undoCheckpoint?.(r.tracked && said ? said : undefined); } catch { /* no history */ }
  if (said) {
    const revert = typeof r.revert === "function" ? r.revert : null;
    try { toast({ ok: true, message: said, ...(revert ? { undo: () => { const st = getStore?.(); try { st?.undoCheckpoint?.(); revert(st); } catch { /* already gone */ } } } : {}) }); } catch { /* no window */ }
  }
  return { ok: true, data: { ok: true, ...(r.data || {}) } };
}
