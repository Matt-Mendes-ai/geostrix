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
  return (
    <div style={overlay} {...backdropProps(() => onAnswer("cancel"))}>
      <div role="dialog" aria-modal="true" aria-label={tr("Save recovered work")} onClick={(e) => e.stopPropagation()} style={{ width: 420, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-text)", fontWeight: 600, marginBottom: 10 }}>{tr("Save recovered work")}</div>
        <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{tr("Save this recovered work over \"{file}\" (which holds your last save), or keep both and save it as a new file?", { file })}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="gs-btn" type="button" data-testid="save-recovered-cancel" onClick={() => onAnswer("cancel")}>{tr("Cancel")}</button>
          <button className="gs-btn" type="button" data-testid="save-recovered-new" onClick={() => onAnswer("new")}>{tr("Save as a new file…")}</button>
          <button className="gs-btn gs-btn--primary" type="button" data-testid="save-recovered-over" onClick={() => onAnswer("over")}>{tr("Save over it")}</button>
        </div>
      </div>
    </div>
  );
}
