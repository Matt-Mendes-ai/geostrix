// TASKS.csv #3638 — the first Save of work restored from the crash-recovery copy: the tab is tied to the file it was working on, and the app asks before writing over it. Three answers, in the
// app's own dialog (translated, focus-trapped, reachable over CDP): Save over it, Save as a new file…, Cancel. Drawn by App.jsx from the store's saveChoice; the answer goes back through answerSaveChoice.
import React from "react";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";

export default function SaveRecoveredModal({ file, onAnswer }) {
  useFocusTrap();
  useEscapeKey(() => onAnswer("cancel"));
  const btn = { padding: "7px 14px", borderRadius: 6, border: "1px solid var(--color-border-light)", background: "transparent", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", cursor: "pointer" };
  return (
    <div style={overlay} {...backdropProps(() => onAnswer("cancel"))}>
      <div role="dialog" aria-modal="true" aria-label={tr("Save recovered work")} onClick={(e) => e.stopPropagation()} style={{ width: 420, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-text)", fontWeight: 600, marginBottom: 10 }}>{tr("Save recovered work")}</div>
        <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{tr("This is work recovered from a previous session. It was open from \"{file}\", which holds the version you last saved. Save over that file, or keep both and save this as a new file?", { file })}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" data-testid="save-recovered-cancel" onClick={() => onAnswer("cancel")} style={btn}>{tr("Cancel")}</button>
          <button type="button" data-testid="save-recovered-new" onClick={() => onAnswer("new")} style={btn}>{tr("Save as a new file…")}</button>
          <button type="button" data-testid="save-recovered-over" onClick={() => onAnswer("over")} style={{ ...btn, border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "var(--color-success-text)" }}>{tr("Save over it")}</button>
        </div>
      </div>
    </div>
  );
}
