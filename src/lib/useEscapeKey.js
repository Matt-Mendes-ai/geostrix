import { useEffect, useRef } from "react";

// TASKS.csv #238 (software-design-specialist audit finding: only 2 of 33 components handled Escape,
// ~20 modals couldn't be dismissed via keyboard at all) — a document-level listener rather than an
// onKeyDown on some particular element, since a modal can be focused anywhere inside itself (a text
// input, a button, nothing at all) and Escape should close it regardless of what currently has focus.
// `enabled` lets a caller wire this unconditionally even when the modal it guards is conditionally
// rendered from a parent (e.g. `{open && <Modal .../>}` already unmounts it on close, but a modal that
// stays mounted and toggles its own visibility can pass `enabled={visible}` instead of conditionally
// calling the hook itself, which would break the rules of hooks).
//
// TASKS.csv #387 — one Escape used to close EVERY open dialog (e.g. AddWebLayerModal and the BasemapView
// area picker opened from it both listened on document). Handlers now sit on a stack in mount order and
// only the most recently opened one runs. The latest onClose is read through a ref, so a parent dialog
// re-rendering with a new inline onClose keeps its place in the stack instead of jumping to the top.
const stack = [];
let listening = false;
// TASKS.csv #2385 (review #2325, WA uranium) — one Escape on a dialog over a task pane closed both: this listener is on document, the
// dialog's close re-rendered before the 3D view's window listener ran (React flushes in the microtask after each listener), so that one no
// longer saw a dialog and closed the pane, during a GemPy run taking the run's messages with it. The dialog that takes the Escape keeps it.
function onKeyDown(e) {
  if (e.key !== "Escape" || !stack.length) return;
  e.stopPropagation();
  stack[stack.length - 1].current?.();
}

export function useEscapeKey(onClose, enabled = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!enabled) return undefined;
    stack.push(ref);
    if (!listening) { document.addEventListener("keydown", onKeyDown); listening = true; }
    return () => {
      const i = stack.lastIndexOf(ref);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [enabled]);
}
