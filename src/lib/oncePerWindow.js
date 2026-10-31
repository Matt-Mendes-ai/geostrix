// TASKS.csv #1163 — a check that must run once per window, not once per mount: <App> re-mounts on a language change
// (main.jsx LanguageKeyed), and the crash-recovery check ran again each time, holding the autosave and stashing the held
// snapshot into another "Recovered: …" tab (five language switches turned 2 tabs into 8). The first call runs `fn`; later
// calls get the same promise; `settle(value)` makes the answer final (the user chose) so a re-mount shows nothing again.
export function oncePerWindow(fn) {
  let p = null;
  const run = () => (p ||= Promise.resolve().then(fn));
  run.settle = (value) => { p = Promise.resolve(value); };
  run.reset = () => { p = null; };
  return run;
}
