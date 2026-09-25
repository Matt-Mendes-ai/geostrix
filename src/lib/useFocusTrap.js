import { useEffect, useRef } from "react";

// TASKS.csv #238 — the last of that row's three keyboard/a11y sub-items: "focus trapping/tab order
// (cycling Tab within an open modal, returning focus to the trigger element on close) -- a larger,
// more involved pattern than [Escape-to-close/aria-modal], not attempted" in the earlier passes on
// this row. Without this, Tab from inside any of this app's ~25 modals walks straight into whatever's
// behind it (the 3D view toolbar, sidebar controls, etc), and closing a modal silently drops focus to
// <body> — a keyboard-only user has to re-navigate from the top of the page every time.
//
// Deliberately no `ref` parameter, unlike a typical focus-trap hook: every modal in this app already
// carries `role="dialog"` on its outer panel element (added in the earlier #238 pass — verified via
// grep that all 27 useEscapeKey callers have it), so this hook finds its own target by querying for
// the LAST `[role="dialog"]` in the DOM rather than requiring every one of those 27 files to also wire
// up and pass a ref. That's correct for how this app actually opens modals (one at a time, occasionally
// nested — e.g. AddWebLayerModal opening BasemapView as an area picker — where "the last one in the
// DOM" is exactly the topmost/most-recently-mounted dialog, the one that should own Tab focus).
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// TASKS.csv #387 follow-up — "last in the DOM" is not always the most recently opened dialog (a dialog
// rendered earlier in the tree, e.g. Shortcuts from App's status bar, sits BEFORE one opened from a
// module). Each trap now claims the dialog that appeared when it mounted and keeps it on a mount-order
// stack; the top of that stack owns Tab. Falls back to the old DOM-order rule if nothing was claimed.
const claimed = new WeakSet();
const trapStack = [];
function claimNewDialog() {
  const all = Array.from(document.querySelectorAll('[role="dialog"]'));
  for (let i = all.length - 1; i >= 0; i--) if (!claimed.has(all[i])) { claimed.add(all[i]); return all[i]; }
  return null;
}
function topDialog() {
  for (let i = trapStack.length - 1; i >= 0; i--) { const el = trapStack[i].el; if (el && document.contains(el)) return el; }
  const all = document.querySelectorAll('[role="dialog"]');
  return all.length ? all[all.length - 1] : null;
}
function visibleFocusables(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
}

export function useFocusTrap(enabled = true) {
  const prevFocusRef = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    prevFocusRef.current = document.activeElement;
    // Move focus into the dialog on open — a small delay-free rAF so this runs after the dialog's own
    // first paint (its focusable children need to actually exist in the DOM to query for them).
    const entry = { el: null };
    trapStack.push(entry);
    const raf = requestAnimationFrame(() => {
      entry.el = claimNewDialog();
      const dialog = topDialog();
      if (!dialog) return;
      const focusables = visibleFocusables(dialog);
      (focusables[0] || dialog).focus?.();
    });
    const handler = (e) => {
      if (e.key !== "Tab") return;
      const dialog = topDialog();
      if (!dialog) return;
      const focusables = visibleFocusables(dialog);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handler);
      const i = trapStack.indexOf(entry);
      if (i >= 0) trapStack.splice(i, 1);
      // Return focus to whatever triggered the modal (a toolbar button, etc) instead of leaving it on
      // <body> — guarded by document.contains() since the trigger element can itself have been
      // removed while the modal was open (e.g. it closed as a side effect of deleting the thing the
      // modal was editing).
      if (prevFocusRef.current && document.contains(prevFocusRef.current)) prevFocusRef.current.focus?.();
    };
  }, [enabled]);
}
