import React, { useCallback, useRef, useState } from "react";

// Drag handle that sits right at the sidebar/main-view boundary, immediately after .ge-panel in the
// .ge-body flex row — a 6px hit target (visually a thin 2px bar, widened for an easier grab, same
// "narrow visual line, wider invisible hit area" trick used by most real window splitters) that drags
// the shared sidebar width from useSidebarWidth. See that hook's comment for why the width is shared
// across modules rather than per-tab.
export default function SidebarResizeHandle({ width, onResize }) {
  const dragRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    // Prevent text selection elsewhere in the app while dragging fast — a real risk here since the
    // sidebar is full of labels/buttons right next to the handle.
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev) => {
      if (!dragRef.current) return;
      onResize(dragRef.current.startWidth + (ev.clientX - dragRef.current.startX));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // TASKS.csv #207 — safety net for the reported "text field intermittently unclickable" bug: this
    // drag only ever released via the window "pointerup" listener above, with nothing to fall back on
    // if that event never arrives — e.g. the OS grabs input mid-drag (a screenshot tool, Alt-Tab, a
    // notification stealing focus), which is exactly what the user's own report described fixing it
    // ("funny right after I took a screenshot it came back to normal" — a screenshot forcing a window
    // focus change is a plausible trigger for the OS to finally deliver/simulate the missed mouseup).
    // Without this, document.body.style.userSelect/cursor stay stuck indefinitely since nothing else
    // resets them. Listening for "blur" too means losing window focus during a drag force-releases it
    // the same way an actual pointerup would.
    window.addEventListener("blur", onUp);
  }, [width, onResize]);

  const active = hover || dragging;
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag to resize the sidebar"
      style={{ width: 6, flexShrink: 0, cursor: "col-resize", position: "relative", zIndex: 5 }}
    >
      <div
        style={{
          position: "absolute", left: 2, top: 0, bottom: 0, width: 2, borderRadius: 1,
          background: active ? "#3a76b0" : "transparent",
          transition: dragging ? "none" : "background 0.15s",
        }}
      />
    </div>
  );
}
