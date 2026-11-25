// TASKS.csv #4070 (Sections tab) — one group of the Section window's toolbar, folded: a small button that opens a panel of that group's less-used controls and closes when you click
// anywhere else. The window's own colours on purpose (SectionWindow is one of the files left out of the colour / type token sweeps, theme.js header). The panel is absolutely positioned,
// so opening it never changes the toolbar's height (SectionWindow holds that height while a line is being drawn, #1230).
import React, { useEffect, useRef } from "react";

export default function SectionToolbarGroup({ id, summary, title, align = "left", children }) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => { const el = ref.current; if (el?.open && !el.contains(e.target)) el.open = false; };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);
  return (
    <details ref={ref} data-section-group={id} style={{ position: "relative", fontSize: "var(--font-size-sm)", color: "#55606e" }}>
      <summary title={title} style={{ cursor: "pointer", listStyle: "none", padding: "4px 8px", border: "1px solid #d9dce1", borderRadius: 6, background: "#f4f5f7", whiteSpace: "nowrap" }}>{summary} ▾</summary>
      <div style={{ position: "absolute", zIndex: 6, top: "100%", [align === "right" ? "right" : "left"]: 0, marginTop: 4, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "8px 12px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, minWidth: 220, maxWidth: "min(460px, 92vw)", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}>
        {children}
      </div>
    </details>
  );
}
