// TASKS.csv #3957 — draws lib/confirmDialog.js's confirms and alerts: an in-app dialog in front of every other (the import's column matching is 62, the CRS
// question 64), with the app's text size, translated buttons, a focus trap, Escape = cancel, Enter = the focused button. A destructive confirm
// (confirmDestructive) puts the focus on Cancel and colours OK as a warning. One at a time; the rest wait their turn.
import React, { useEffect, useRef, useState } from "react";
import { registerConfirmHost } from "../lib/confirmDialog.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, rowBtn } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";

function Ask({ req, done }) {
  useFocusTrap();
  const okRef = useRef(null), cancelRef = useRef(null);
  const confirmKind = req.kind === "confirm";
  const answer = (v) => done(v);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); answer(false); } };
    document.addEventListener("keydown", onKey, true);
    const f = requestAnimationFrame(() => ((confirmKind && req.destructive ? cancelRef : okRef).current || okRef.current)?.focus());
    return () => { document.removeEventListener("keydown", onKey, true); cancelAnimationFrame(f); };
  }, []);
  return (
    <div style={{ ...overlay, zIndex: 70 }}>
      <div style={panel({ width: "min(460px, calc(100vw - 32px))" })} role="alertdialog" aria-modal="true" aria-label={tr(confirmKind ? "Please confirm" : "Notice")} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 18px", fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.5, whiteSpace: "pre-line", overflowWrap: "anywhere", maxHeight: "60vh", overflowY: "auto" }}>{req.message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          {confirmKind && <button ref={cancelRef} type="button" style={rowBtn(false)} onClick={() => answer(false)}>{tr(req.cancelLabel)}</button>}
          <button ref={okRef} type="button" style={req.destructive ? { ...rowBtn(false), borderColor: "var(--color-danger-border, var(--color-danger-icon))", color: "var(--color-danger-text)" } : rowBtn(true)} onClick={() => answer(true)}>{tr(req.okLabel)}</button>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => registerConfirmHost((req) => setQueue((q) => [...q, req])), []);
  const req = queue[0];
  if (!req) return null;
  return <Ask key={queue.length + req.message} req={req} done={(v) => { setQueue((q) => q.slice(1)); req.resolve(req.kind === "confirm" ? !!v : undefined); }} />;
}
