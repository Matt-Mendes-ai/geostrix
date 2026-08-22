import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SectionWindow from "./components/SectionWindow.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { StoreProvider } from "./lib/store.jsx";
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
        <App />
      </StoreProvider>
    </ErrorBoundary>
  );
}
