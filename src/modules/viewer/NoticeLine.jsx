// TASKS.csv #4070 part 5 — one line of the sidebar's "Recent messages": a long notice (a loaded sample's first notice runs to forty words) is shown as two lines, its
// full text in the tooltip and on a click, so the Basic path's sidebar is not a wall of text. A short one is shown as it was.
import React, { useState } from "react";
import { AlertTriangle } from "../../components/icons.js";
import { activateOnKey } from "../../lib/a11y.js";

const clamp = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
export const LONG_NOTICE = 140; // characters

export default function NoticeLine({ text, error = false }) {
  const [open, setOpen] = useState(false);
  const long = String(text).length > LONG_NOTICE;
  const toggle = long ? { role: "button", tabIndex: 0, onKeyDown: activateOnKey, onClick: () => setOpen((o) => !o), "aria-expanded": open, style: { cursor: "pointer", ...(open ? null : clamp) }, title: open ? undefined : String(text) } : null;
  return (
    <div style={{ marginBottom: 4, ...(error ? { color: "var(--color-danger-fg)", display: "flex", gap: 5, alignItems: "flex-start" } : null) }}>
      {error && <AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />}
      <span {...(toggle || {})}>{text}</span>
    </div>
  );
}
