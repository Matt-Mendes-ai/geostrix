import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// TASKS.csv #476 — the pop-out section window is its own chunk: the main window never renders it.
const SectionWindow = React.lazy(() => import("./components/SectionWindow.jsx"));
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { StoreProvider, CursorProvider, TaskProgressProvider } from "./lib/store.jsx";
// TASKS.csv #185 — "Let's use Exo 2 for all fonts." Bundled via @fontsource/exo-2 (not a Google
// Fonts <link>) so the app-wide font still loads with no network access — this is an Electron
// desktop app used in the field, and a CDN <link> would silently fall back to system fonts offline.
// Only the weights actually used across the app's inline styles (400 body text, 500/600 emphasis,
// 700 titles/headings) are imported to keep the bundle lean.
import "@fontsource/exo-2/400.css";
import "@fontsource/exo-2/500.css";
import "@fontsource/exo-2/600.css";
import "@fontsource/exo-2/700.css";
import "./styles/app.css";

const route = window.location.hash.replace(/^#/, "").split("?")[0];

// TASKS.csv #345 — a file dropped anywhere that isn't a drop zone must never navigate the window to it
// (Chromium's default for an unhandled drop is to OPEN the file — in Electron that meant the app window
// became file://<the dropped file>). Runs in the bubbling phase, after every module's own onDrop.
window.addEventListener("dragover", (e) => e.preventDefault());

// TASKS.csv #598 — the last 50 uncaught errors of this session, for Help > Report a problem (kept in memory only)
window.__geostrixErrors = [];
const keepError = (kind, message, stack) => {
  const list = window.__geostrixErrors;
  list.push({ at: new Date().toISOString(), kind, message: String(message || "").slice(0, 2000), stack: stack ? String(stack).slice(0, 4000) : null });
  if (list.length > 50) list.splice(0, list.length - 50);
};
window.addEventListener("error", (e) => keepError("error", e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => keepError("unhandled promise", e.reason?.message || e.reason, e.reason?.stack));

// TASKS.csv #622 — after a native alert / confirm / prompt, Electron on Windows leaves the page without focus
// (clicks stop reaching text boxes); every such dialog in the app goes through these, so the window is
// re-activated right after each one closes. No-op in a plain browser.
if (window.desktop?.refocusAfterDialog) {
  for (const name of ["alert", "confirm", "prompt"]) {
    const native = window[name].bind(window);
    window[name] = (...args) => {
      try { return native(...args); } finally { window.desktop.refocusAfterDialog(); }
    };
  }
}
window.addEventListener("drop", (e) => e.preventDefault());

const root = createRoot(document.getElementById("root"));
if (route === "/section") {
  // pop-out cross-section window: standalone, receives data via IPC
  root.render(
    <ErrorBoundary>
      <Suspense fallback={null}><SectionWindow /></Suspense>
    </ErrorBoundary>
  );
} else {
  root.render(
    <ErrorBoundary>
      <StoreProvider>
        <CursorProvider>
          <TaskProgressProvider>
            <App />
          </TaskProgressProvider>
        </CursorProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
// index.html's own splash screen (see its header comment) — hidden once React has actually
// committed a first render, not on a timer. __hideSplash itself waits two animation frames before
// fading out, so this fires as soon as possible after render() without racing the first real paint.
// If the splash script never ran (e.g. blocked by the CSP — the v0.1.19 splash bug), remove the splash
// directly so a working app is never hidden behind it.
if (window.__hideSplash) window.__hideSplash();
else document.getElementById("splash")?.remove();
