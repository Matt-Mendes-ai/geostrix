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
    // TASKS.csv #442 — an INNER boundary (a module, a modal) sits inside the store providers, so the
    // project is still alive when it catches: it offers a real Save and a way back, instead of the outer
    // boundary's situation where every piece of project state has already been unmounted.
    if (this.props.scope === "modal" || this.props.scope === "module") {
      const what = this.props.scope === "modal" ? "This window" : `The ${this.props.label || "current"} tab`;
      return (
        <div role="alert" style={{ margin: this.props.scope === "modal" ? "10vh auto" : 24, maxWidth: 560, background: "var(--color-bg)", border: "1px solid var(--color-danger-border-strong)", borderRadius: 8, padding: "18px 22px", position: this.props.scope === "modal" ? "fixed" : "static", inset: this.props.scope === "modal" ? "0 0 auto 0" : undefined, zIndex: 1000, boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }}>
          <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-danger-solid)", marginBottom: 8 }}>{what} hit an error and was closed.</div>
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 12, wordBreak: "break-word" }}>{String(this.state.error?.message || this.state.error)}</div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 14 }}>Your project is still open and nothing has been lost. Saving now is a good idea.</div>
          {this.props.onSave && (
            <button onClick={() => this.props.onSave()} style={{ marginRight: 10, padding: "8px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" }}>Save project…</button>
          )}
          <button onClick={() => { this.setState({ error: null }); this.props.onClose?.(); }} style={{ padding: "8px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" }}>
            {this.props.scope === "modal" ? "Close" : "Try again"}
          </button>
        </div>
      );
    }
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "'Exo 2', system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 640, background: "var(--color-bg)", border: "1px solid var(--color-danger-border-strong)", borderRadius: 8, padding: "22px 26px" }}>
          <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-danger-fg)", marginBottom: 10 }}>Something crashed the view.</div>
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-caption)", lineHeight: 1.6, marginBottom: 16, wordBreak: "break-word" }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 16 }}>
            The full stack trace is in the DevTools console (already open in dev builds). The project state
            could not be kept at this level; if the app was autosaving, restart it to recover from the
            last autosave (at most a minute old).
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginRight: 10, padding: "8px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" }}
          >
            Try to continue
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "8px 14px", background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 6, color: "var(--color-success-fg)", fontSize: "var(--font-size-base)", cursor: "pointer" }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
