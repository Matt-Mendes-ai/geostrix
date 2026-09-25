import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SectionWindow from "./components/SectionWindow.jsx";
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
window.addEventListener("drop", (e) => e.preventDefault());

const root = createRoot(document.getElementById("root"));
if (route === "/section") {
  // pop-out cross-section window: standalone, receives data via IPC
  root.render(
    <ErrorBoundary>
      <SectionWindow />
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
