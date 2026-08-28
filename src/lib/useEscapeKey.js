import { useEffect } from "react";

// TASKS.csv #238 (software-design-specialist audit finding: only 2 of 33 components handled Escape,
// ~20 modals couldn't be dismissed via keyboard at all) — a document-level listener rather than an
// onKeyDown on some particular element, since a modal can be focused anywhere inside itself (a text
// input, a button, nothing at all) and Escape should close it regardless of what currently has focus.
// `enabled` lets a caller wire this unconditionally even when the modal it guards is conditionally
// rendered from a parent (e.g. `{open && <Modal .../>}` already unmounts it on close, but a modal that
// stays mounted and toggles its own visibility can pass `enabled={visible}` instead of conditionally
// calling the hook itself, which would break the rules of hooks).
export function useEscapeKey(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled || !onClose) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, enabled]);
}
