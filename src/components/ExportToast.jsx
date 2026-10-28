// TASKS.csv #1042 (review #1016) — every export says whether it worked: saveFile (lib/desktop.js) announces each result
// that its caller does not report itself; this shows it at the bottom of the window. Success fades after a few seconds,
// a failure stays until dismissed (it says why: a file open in another program, a full disk ...).
import React, { useEffect, useState } from "react";
import { EXPORT_RESULT_EVENT } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js";

const folderOf = (p) => { const s = String(p || ""); const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")); return i > 0 ? s.slice(0, i) : ""; };
const baseOf = (p) => { const s = String(p || ""); return s.slice(Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")) + 1); };

export default function ExportToast() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let n = 0;
    const on = (e) => {
      const d = e.detail || {}, id = ++n;
      setItems((L) => [...L.slice(-2), { id, ...d }]);
      if (d.ok) setTimeout(() => setItems((L) => L.filter((x) => x.id !== id)), d.message ? 3500 : 6000);
    };
    window.addEventListener(EXPORT_RESULT_EVENT, on);
    return () => window.removeEventListener(EXPORT_RESULT_EVENT, on);
  }, []);
  if (!items.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 34, right: 16, zIndex: 80, display: "flex", flexDirection: "column", gap: 6, maxWidth: 460 }}>
      {items.map((x) => (
        <div key={x.id} role={x.ok ? "status" : "alert"} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderRadius: 6, fontSize: "var(--font-size-base)", lineHeight: 1.4, boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          background: x.ok ? "var(--color-bg)" : "var(--color-danger-bg)", border: `1px solid ${x.ok ? "var(--color-border)" : "var(--color-danger-border)"}`, color: x.ok ? "var(--color-text)" : "var(--color-danger-text)" }}>
          <span style={{ flex: 1 }}>{x.message ? x.message /* #1087 — a plain message (undo / redo) */ : x.ok
            ? tr("Saved {file} to {folder}.", { file: baseOf(x.filePath) || x.name, folder: folderOf(x.filePath) || tr("the chosen folder") })
            : tr("{file} was not saved: {error}", { file: baseOf(x.filePath) || x.name || tr("The file"), error: x.error })}</span>
          <button type="button" onClick={() => setItems((L) => L.filter((y) => y.id !== x.id))} aria-label={tr("Dismiss")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "var(--font-size-lg)", lineHeight: 1, padding: 0 }}>×</button>
        </div>
      ))}
    </div>
  );
}
