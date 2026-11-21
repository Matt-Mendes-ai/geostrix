// TASKS.csv #3957 — the one confirm / alert of the app. window.confirm / window.alert are native OS message boxes in Electron: blocking (a dropped terrain's
// "use this CRS?" froze the page), unstyled, with buttons in the system's language, outside the text-size setting and the app's dialogs. These two are
// promise-based and drawn by components/ConfirmHost.jsx (mounted once in App.jsx, and in the section window's root):
//   const ok = await askConfirm(message, { okLabel, cancelLabel, destructive })   -> true (OK) | false (Cancel, Escape, a click outside)
//   askAlert(message)                                                              -> a notice with one button; not awaited unless the code must wait
// message is shown as written (callers pass tr()'d text; a newline is a line break). With no host mounted (Node tests, a window that has no App) a confirm
// answers false and an alert is dropped: nothing destructive runs by default. Several asks at once queue and are answered in turn.
// the registry lives on globalThis: one host answers every copy of this module (a test bundle, a lazy chunk that carried its own)
const S = (globalThis.__geostrixConfirm ||= { host: null, waiting: [], started: false, expired: false });
export function registerConfirmHost(fn) {
  S.host = fn; S.expired = false;
  while (S.host && S.waiting.length) S.host(S.waiting.shift());
  return () => { if (S.host === fn) S.host = null; };
}
const post = (req) => { if (S.host) S.host(req); else if (S.expired) req.resolve(req.kind === "confirm" ? false : undefined); else S.waiting.push(req); };

export function askConfirm(message, { okLabel = "OK", cancelLabel = "Cancel", destructive = false } = {}) {
  if (typeof window === "undefined") return Promise.resolve(false);
  hostMayAppear();
  return new Promise((resolve) => post({ kind: "confirm", message: String(message ?? ""), okLabel, cancelLabel, destructive, resolve }));
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
  const t = setTimeout(() => { if (!S.host) S.expired = true; while (!S.host && S.waiting.length) { const r = S.waiting.shift(); r.resolve(r.kind === "confirm" ? false : undefined); } }, 3000);
  t.unref?.();
}
