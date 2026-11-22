// TASKS.csv #4005 — T / B / N / S / E / W on the 3D view (lib/viewer/viewDirections.js says what each means). A window listener, because the view need not have the
// focus: the pointer being over it is enough. It is left alone while the person types in a field, with Ctrl / Alt / Meta, while a dialog is open, and on a 3D view
// that is not the tab shown (ViewerModule is one instance for every 3D tab; visibleRef says whether this one is showing).
import { useEffect, useRef } from "react";
import { viewDirectionFor, isTypingTarget, applyViewDirection } from "../../lib/viewer/viewDirections.js";

export function useViewDirectionKeys({ viewRef, visibleRef, camState, cameraRef }) {
  const over = useRef(false);
  useEffect(() => {
    const el = viewRef.current;
    const enter = () => { over.current = true; }, leave = () => { over.current = false; };
    el?.addEventListener("pointerenter", enter); el?.addEventListener("pointerleave", leave);
    const onKey = (e) => {
      const a = document.activeElement;
      const k = viewDirectionFor(e, {
        visible: !!visibleRef.current, over: over.current, focusInside: !!(el && a && el.contains(a)),
        typing: isTypingTarget(e.target) || isTypingTarget(a), modalOpen: !!document.querySelector("[role=dialog], [aria-modal=true]"),
      });
      if (!k) return;
      e.preventDefault();
      if (applyViewDirection(camState.current, k)) cameraRef.current?.__update?.();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); el?.removeEventListener("pointerenter", enter); el?.removeEventListener("pointerleave", leave); };
  }, []); // the refs are stable
}
