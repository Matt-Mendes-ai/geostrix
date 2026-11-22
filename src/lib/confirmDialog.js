// TASKS.csv #3957 — the one confirm / alert of the app. window.confirm / window.alert are native OS message boxes in Electron: blocking (a dropped terrain's
// "use this CRS?" froze the page), unstyled, with buttons in the system's language, outside the text-size setting and the app's dialogs. These two are
// promise-based and drawn by components/ConfirmHost.jsx (mounted once in App.jsx, and in the section window's root):
//   const ok = await askConfirm(message, { okLabel, cancelLabel, destructive })   -> true (OK) | false (Cancel, Escape, a click outside)
//   askAlert(message)                                                              -> a notice with one button; not awaited unless the code must wait
//   askChoice(message, [{ label, value, primary? }])                              -> the clicked button's value | null (Escape, a click outside): three answers, TASKS.csv #3994
// message is shown as written (callers pass tr()'d text; a newline is a line break). With no host mounted (Node tests, a window that has no App) a confirm
// answers false and an alert is dropped: nothing destructive runs by default. Several asks at once queue and are answered in turn.
// the registry lives on globalThis: one host answers every copy of this module (a test bundle, a lazy chunk that carried its own)
const S = (globalThis.__geostrixConfirm ||= { host: null, waiting: [], started: false, expired: false });
export function registerConfirmHost(fn) {
  S.host = fn; S.expired = false;
  while (S.host && S.waiting.length) S.host(S.waiting.shift());
  return () => { if (S.host === fn) S.host = null; };
}
const nothing = (req) => (req.kind === "confirm" ? false : req.kind === "choice" ? null : undefined); // no host: nothing happens by default
const post = (req) => { if (S.host) S.host(req); else if (S.expired) req.resolve(nothing(req)); else S.waiting.push(req); };

export function askConfirm(message, { okLabel = "OK", cancelLabel = "Cancel", destructive = false } = {}) {
  if (typeof window === "undefined") return Promise.resolve(false);
  hostMayAppear();
  return new Promise((resolve) => post({ kind: "confirm", message: String(message ?? ""), okLabel, cancelLabel, destructive, resolve }));
}
// TASKS.csv #3994 — a question with more than two answers (the stack's order: Use the holes' order / Run as it is / Cancel). choices: [{ label, value, primary? }] in the order drawn,
// left to right; the primary one has the focus. -> the value of the button clicked, or null for Escape / a click outside (the caller treats null as Cancel)
export function askChoice(message, choices) {
  if (typeof window === "undefined") return Promise.resolve(null);
  hostMayAppear();
  return new Promise((resolve) => post({ kind: "choice", message: String(message ?? ""), choices: (choices || []).map((c) => ({ label: String(c.label), value: c.value, primary: !!c.primary })), resolve }));
}
export function askAlert(message) {
  if (typeof window === "undefined") return Promise.resolve();
  hostMayAppear();
  return new Promise((resolve) => post({ kind: "alert", message: String(message ?? ""), resolve }));
}
// the host mounts with the first render of App; an ask made before it (a startup effect) waits for it, up to a moment, then is answered "no"
function hostMayAppear() {
  if (S.started) return;
  S.started = true;
  const t = setTimeout(() => { if (!S.host) S.expired = true; while (!S.host && S.waiting.length) { const r = S.waiting.shift(); r.resolve(nothing(r)); } }, 3000);
  t.unref?.();
}
