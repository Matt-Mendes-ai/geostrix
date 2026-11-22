// TASKS.csv #3957 — draws lib/confirmDialog.js's confirms and alerts: an in-app dialog in front of every other (the import's column matching is 62, the CRS
// question 64), with the app's text size, translated buttons, a focus trap, Escape = cancel, Enter = the focused button. A destructive confirm
// (confirmDestructive) puts the focus on Cancel and colours OK as a warning. One at a time; the rest wait their turn.
import React, { useEffect, useRef, useState } from "react";
import { registerConfirmHost, askChoice } from "../lib/confirmDialog.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, rowBtn } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";

function Ask({ req, done }) {
  useFocusTrap();
  const okRef = useRef(null), cancelRef = useRef(null);
  const confirmKind = req.kind === "confirm", choiceKind = req.kind === "choice"; // choice: #3994
  const answer = (v) => done(v);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); answer(choiceKind ? null : false); } };
    document.addEventListener("keydown", onKey, true);
    const f = requestAnimationFrame(() => ((confirmKind && req.destructive ? cancelRef : okRef).current || okRef.current)?.focus());
    return () => { document.removeEventListener("keydown", onKey, true); cancelAnimationFrame(f); };
  }, []);
  return (
    <div style={{ ...overlay, zIndex: 70 }}>
      <div style={panel({ width: "min(460px, calc(100vw - 32px))" })} role="alertdialog" aria-modal="true" aria-label={tr(confirmKind || choiceKind ? "Please confirm" : "Notice")} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 18px", fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.5, whiteSpace: "pre-line", overflowWrap: "anywhere", maxHeight: "60vh", overflowY: "auto" }}>{req.message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          {choiceKind && req.choices.map((c, i) => <button key={i} ref={c.primary ? okRef : undefined} type="button" style={rowBtn(c.primary)} onClick={() => answer(c.value)}>{tr(c.label)}</button>)}
          {confirmKind && <button ref={cancelRef} type="button" style={rowBtn(false)} onClick={() => answer(false)}>{tr(req.cancelLabel)}</button>}
          {!choiceKind && <button ref={okRef} type="button" style={req.destructive ? { ...rowBtn(false), borderColor: "var(--color-danger-border, var(--color-danger-icon))", color: "var(--color-danger-text)" } : rowBtn(true)} onClick={() => answer(true)}>{tr(req.okLabel)}</button>}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => registerConfirmHost((req) => { req.onGone = () => setQueue((q) => q.filter((r) => r !== req)); setQueue((q) => [...q, req]); }), []);
  // TASKS.csv #3995 — a question the main process asks (quit with unsaved work, install an update, close sections with unsaved lines) is drawn here, as the app's own dialog, and answered back; main
  // acknowledges nothing for us: it falls back to the native box when we do not ack in a moment, so this acks as soon as the question is up. Taken down if main gave up (main-ask-cancel).
  useEffect(() => {
    const d = typeof window !== "undefined" ? window.desktop : null;
    if (!d?.onMainAsk) return undefined;
    const live = new Map();
    return d.onMainAsk(async (req) => {
      const ctl = new AbortController(); live.set(req.id, ctl);
      d.mainAskAck(req.id);
      const text = [req.message, req.detail].filter(Boolean).map((s) => tr(s)).join("\n\n"); // English keys, or text the window already translated (tr leaves that as it is)
      const v = await askChoice(text, req.buttons, { signal: ctl.signal });
      if (!ctl.signal.aborted) d.mainAskAnswer(req.id, v ?? req.cancelValue);
      live.delete(req.id);
    }, (id) => live.get(id)?.abort());
  }, []);
  const req = queue[0];
  if (!req) return null;
  return <Ask key={queue.length + req.message} req={req} done={(v) => { setQueue((q) => q.slice(1)); req.resolve(req.kind === "confirm" ? !!v : req.kind === "choice" ? (v ?? null) : undefined); }} />;
}
