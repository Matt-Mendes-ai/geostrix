// TASKS.csv #3058 — a floating panel that opens in the middle of the window and can be dragged by its header (Matt: the Style panel
// opened at the far right, where it went unseen; "put it on the centre of the screen and make the window draggable").
// usage: const { panelRef, pos, dragProps } = useDragPanel(width); <div ref={panelRef} style={{ position: "fixed", left: pos.left, top: pos.top }}>
// <div {...dragProps}>header</div>. A press on a button, input, select or anything marked data-nodrag inside the header does not drag.
import { useLayoutEffect, useRef, useState, useCallback } from "react";

// where a panel of size w x h goes, clamped so at least its header stays inside the window (pure, for the test)
export function clampPanel(left, top, w, h, viewW, viewH, margin = 8) {
  const L = Math.max(margin, Math.min(left, viewW - Math.min(w, viewW - 2 * margin) - margin));
  const T = Math.max(margin, Math.min(top, viewH - Math.min(h, 48) - margin));
  return { left: Math.round(L), top: Math.round(T) };
}
// the middle of the window for a panel of size w x h
export function centredPanel(w, h, viewW, viewH) {
  return clampPanel((viewW - w) / 2, (viewH - h) / 2, w, h, viewW, viewH);
}

export function useDragPanel(width = 300) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(() => (typeof window === "undefined" ? { left: 0, top: 0 } : centredPanel(width, 360, window.innerWidth, window.innerHeight)));
  // once drawn, centre on the panel's real height
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight;
    if (h) setPos(centredPanel(width, h, window.innerWidth, window.innerHeight));
  }, [width]);
  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 || e.target.closest?.("button, input, select, textarea, a, [role=button], [data-nodrag]")) return;
    const el = panelRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => setPos(clampPanel(ev.clientX - dx, ev.clientY - dy, r.width, r.height, window.innerWidth, window.innerHeight));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);
  return { panelRef, pos, dragProps: { onPointerDown, style: { cursor: "move", userSelect: "none", touchAction: "none" } } };
}
