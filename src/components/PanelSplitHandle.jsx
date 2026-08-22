import React, { useCallback, useRef, useState } from "react";

// TASKS.csv #206 — vertical sibling of SidebarResizeHandle.jsx: that one drags the whole left column's
// WIDTH (the .ge-panel/.ge-main boundary); this one sits between two stacked panels within that same
// column (the existing Layers-equivalent panel on top, the new Browser panel below it) and drags the
// HEIGHT split between them. Same "narrow visual line, wider invisible hit area" hit-target trick.
export default function PanelSplitHandle({ height, onResize, invert = false, title = "Drag to resize" }) {
  const dragRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      onResize(dragRef.current.startHeight + (invert ? -delta : delta));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [height, onResize, invert]);

  const active = hover || dragging;
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{ height: 6, flexShrink: 0, cursor: "row-resize", position: "relative", zIndex: 5, background: "#f4f6f8", borderTop: "1px solid #e4e7eb", borderBottom: "1px solid #e4e7eb" }}
    >
      <div
        style={{
          position: "absolute", top: 2, left: 0, right: 0, height: 2, borderRadius: 1,
          background: active ? "#3a76b0" : "transparent",
          transition: dragging ? "none" : "background 0.15s",
        }}
      />
    </div>
  );
}
