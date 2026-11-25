// TASKS.csv #4075 — code the first screen does not need but a click soon will (a step pane's shell, the hole filter bar): left out of the startup bundle (scripts/check-bundle-size.mjs
// counts only what index.html loads) and fetched from local disk once the window has painted and the main thread is idle, so its first use does not wait for it.
// Never throws, never blocks: a failed fetch is ignored (the lazy import then tries again when the part is first drawn).
export function preloadWhenIdle(loaders, delayMs = 2500) {
  if (typeof window === "undefined") return;
  const run = () => { for (const load of loaders) { try { Promise.resolve(load()).catch(() => {}); } catch { /* ignored */ } } };
  setTimeout(() => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 10000 }); else run(); }, delayMs);
}
