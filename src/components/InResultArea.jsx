// TASKS.csv #1199 — a geophysics result belongs in the main area, at a size a section can be read: the sidebar kept it 320 px wide beside 1,100 empty ones.
// slot: the main area's element (null when the panel is embedded elsewhere, which keeps the result in place). The panel stays the owner: closing it clears the area.
import React from "react";
import { createPortal } from "react-dom";

export default function InResultArea({ slot, children }) {
  return slot ? createPortal(<div style={{ width: "100%", maxWidth: 1000, boxSizing: "border-box", padding: "0 20px 16px" }}>{children}</div>, slot) : children;
}
