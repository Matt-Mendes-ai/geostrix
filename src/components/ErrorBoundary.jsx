import React from "react";

// React 18's createRoot has no default error UI: an uncaught error during render unmounts the
// WHOLE tree and leaves nothing behind but the page background — which in this app is a very dark
// near-black (#ffffff), so a crash reads as a plain black screen with no clue what happened. This
// wraps the app (and the separate cross-section pop-out window) so a crash instead shows a
// recoverable message with the actual error, and a way to keep going without losing the whole
// session. It does NOT fix the underlying bug that caused the crash — it just stops one bad render
// from taking down the entire window, and surfaces enough detail (here + in DevTools console) to
// diagnose it.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Also goes to the DevTools console (already open automatically in `npm run dev`), so the
    // full stack + component stack survives even after this fallback UI replaces the crashed tree.
    console.error("GeoStrix crashed:", error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", color: "#1a2028", fontFamily: "'Exo 2', system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 640, background: "#ffffff", border: "1px solid #5a2a2a", borderRadius: 8, padding: "22px 26px" }}>
          <div style={{ fontSize: 15, color: "#e0a0a0", marginBottom: 10 }}>Something crashed the view.</div>
          <div style={{ fontSize: 12, color: "#7b8794", lineHeight: 1.6, marginBottom: 16, wordBreak: "break-word" }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{ fontSize: 11, color: "#94a1b0", marginBottom: 16 }}>
            The full stack trace is in the DevTools console (already open in dev builds). Unsaved project
            changes since your last Save may be lost if you reload — Save first if you're able to.
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginRight: 10, padding: "8px 14px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" }}
          >
            Try to continue
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "8px 14px", background: "#1e3629", border: "1px solid #3d6b52", borderRadius: 6, color: "#8fd9ab", fontSize: 12, cursor: "pointer" }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
