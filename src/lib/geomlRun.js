// TASKS.csv #1142 — the geoML run in progress, kept outside PredictivePanel. The panel held it in its own state, so
// switching to another pane closed the panel and took the progress bar and the Cancel button with it while the job went on
// (the add-on runs one at a time and only says so when you start another). Matt killed the app after more than an hour.
// One run at a time, like the add-on. Pure: no React, no DOM; the panel reads it with useSyncExternalStore.
let current = null;
let history = [];
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const subscribeRun = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getRun = () => current;
export const getRunHistory = () => history;

export function beginRun(label, controller, message = "", now = Date.now()) {
  current = { label, progress: 0, message, elapsed: 0, changedAt: now, controller };
  notify();
  return current;
}
// status from the add-on's poll; `changedAt` moves only when the progress or the message really changed
export function updateRun(patch, now = Date.now()) {
  if (!current) return;
  const moved = (patch.progress !== undefined && patch.progress !== current.progress) || (patch.message !== undefined && patch.message !== current.message);
  current = { ...current, ...patch, changedAt: moved ? now : current.changedAt };
  notify();
}
export function endRun(record = null) {
  current = null;
  if (record) history = [record, ...history];
  notify();
}
// Cancel, from wherever it is asked (the panel or the status bar). runJob sees the abort on its next poll.
export function cancelRun(message = "") {
  if (!current?.controller) return false;
  current.controller.abort();
  current = { ...current, message: message || current.message, cancelling: true };
  notify();
  return true;
}

// Seconds since this step last reported anything (the add-on's block prediction step reports nothing until it ends)
export const quietFor = (run, now = Date.now()) => (run ? Math.max(0, (now - run.changedAt) / 1000) : 0);

// 45 s / 12 min 05 s / 1 h 03 min — an hour-long run in seconds ("3724 s") tells nobody much
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

// Above this many holes the panel warns before a run. A judgement, not a measurement: 19 holes took ~2 min (Fast), 37 holes
// ~4 min (Standard), 398 holes more than an hour (quality not recorded).
export const LARGE_PROJECT_HOLES = 100;
