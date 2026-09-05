import React, { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// Bug fix (user report: "Group feature is not working, can't create group layers"). Root cause:
// every "name this thing" flow in the app (new layer group, rename group, rename section, new domain,
// rename layout page, save-as-template) used the bare browser `window.prompt()` — and Electron's
// renderer does NOT reliably implement window.prompt() the way it implements window.alert()/confirm()
// (those map to a native OS message box; prompt() has no native text-input equivalent Electron wires
// up the same way, and on Windows in particular it silently returns null instead of showing anything).
// So every one of those "+Group"/rename/etc. clicks was calling addLayerGroup(name) with a name that
// was ALWAYS null — the store logic itself was never broken, nothing ever silently failed downstream,
// the dialog just never appeared for the user to type into in the first place. This is a real in-app
// modal replacement, used the same way across every call site (see ViewerModule's askPrompt/promptState
// and LayoutModule's own copy of the same pattern).
export default function PromptModal({ title, defaultValue = "", confirmLabel = "OK", onConfirm, onCancel }) {
  useFocusTrap(); // TASKS.csv #238 — the one modal-shaped component that hadn't gotten this yet
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 13, color: "var(--color-text)", marginBottom: 10, fontWeight: 600 }}>{title}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(value);
            if (e.key === "Escape") onCancel();
          }}
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={cancelBtn}>Cancel</button>
          <button onClick={() => onConfirm(value)} style={okBtn}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: 320, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" };
const inputStyle = { width: "100%", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "#1a2028", fontSize: 13, boxSizing: "border-box" };
const cancelBtn = { padding: "7px 14px", borderRadius: 6, border: "1px solid var(--color-border-light)", background: "transparent", color: "#55606e", fontSize: 12, cursor: "pointer" };
const okBtn = { padding: "7px 14px", borderRadius: 6, border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "#8fd9ab", fontSize: 12, cursor: "pointer" };
