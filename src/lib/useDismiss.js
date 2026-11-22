// TASKS.csv #3969 (Matt's first-time test) — the Model card ('Grade model … Build it for me') stayed drawn over the Best intercepts dialog
// opened after it, covering its controls; the ribbon's other popovers (the Model menu, Grid …) stayed open the same way. A card or popover
// that is open closes when:
//  - a modal dialog opens (an element with aria-modal="true" appears that is not inside it),
//  - a press lands outside it (another ribbon button, the view, a panel),
//  - Escape is pressed (not while typing in a field, and not when a modal dialog is open: the dialog takes its own Escape).
// isInside(node) -> true for the card's own nodes (and its opener button, when pressing it again should toggle rather than close-and-reopen).
import { useEffect, useRef } from "react";

const MODAL = '[aria-modal="true"]';
const typing = (t) => !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

// a node added to the page is (or holds) a modal dialog that is not one of ours -> true
export function addsModal(node, isInside) {
  if (!node || node.nodeType !== 1) return false;
  const found = node.matches?.(MODAL) ? node : node.querySelector?.(MODAL);
  return !!found && !isInside(found);
}

export function useDismiss(open, isInside, close) {
  const latest = useRef({ isInside, close });
  latest.current = { isInside, close };
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const inside = (n) => { try { return !!latest.current.isInside(n); } catch { return false; } };
    const onDown = (e) => { if (!inside(e.target)) latest.current.close(); };
    const onKey = (e) => { if (e.key === "Escape" && !typing(e.target) && !document.querySelector(MODAL)) latest.current.close(); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    let mo = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) if (addsModal(n, inside)) { latest.current.close(); return; } });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); mo?.disconnect(); };
  }, [open]);
}
