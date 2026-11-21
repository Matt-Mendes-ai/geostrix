// TASKS.csv #3888 (platform redesign P5, design.md section 4, screens 1 and 2) — the rules of the two start dialogs, pure:
//  - when they show: GeoStrix opened with no project (nothing loaded, no crash-recovery copy offered, no project file opened at launch) and the
//    personal "Do not show this when GeoStrix starts" box not ticked; New project and the empty view's button always open them;
// This file is in the startup chunk (App.jsx asks it whether to show the dialogs): the dialogs' own rules are lib/startChecklist.js, loaded with them.

export const START_DIALOG_KEY = "geostrix.startDialog"; // localStorage: "off" = do not show at start (a personal setting, not the project's)
export const LAUNCH_SETTLE_MS = 1500; // a project file opened at launch (double-click) arrives through the launch-file queue a moment after mount

export function startOptedOut(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(START_DIALOG_KEY) === "off"; } catch { return false; }
}
export function setStartOptOut(on, storage) {
  try { const s = storage ?? globalThis.localStorage; if (on) s?.setItem(START_DIALOG_KEY, "off"); else s?.removeItem(START_DIALOG_KEY); } catch { /* private window: the box just does not stick */ }
}
// reason: "launch" | "new" | "button". At launch: only an empty project, no recovery copy offered, no file opened, the box not ticked.
export function shouldShowStart({ reason = "launch", empty = true, optedOut = false, recoveryOffered = false, openedFile = false } = {}) {
  if (reason === "new" || reason === "button") return true;
  return !!empty && !optedOut && !recoveryOffered && !openedFile;
}
// TASKS.csv #3930 — once the dialog is up it gives way when the project stops being empty or a sample is asked for, whatever loaded it (an example from the
// empty view's cards or File > Open Sample Project, a project opened, a recovery copy restored): its backdrop otherwise swallows every click on the page.
// Not while the user is inside the dialog's own steps for bringing data in (engaged: they dropped a terrain or files here, so the project filling up is their doing).
export function shouldCloseStart({ empty = true, engaged = false, sampleRequested = false } = {}) {
  if (engaged) return false;
  return !empty || !!sampleRequested;
}
