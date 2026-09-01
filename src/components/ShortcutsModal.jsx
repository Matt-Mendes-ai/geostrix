import React, { useState } from "react";
import { X, Keyboard, Info } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #32 — keyboard shortcuts reference. Lists exactly what electron/main.js's Menu template
// actually wires up (kept next to that file's accelerators deliberately, so this can't silently drift
// out of sync the way a hand-maintained doc page tucked away in README would) rather than aspirational
// shortcuts that don't exist yet. Shares a "Help" modal with a small About tab, since "About GeoStrix"
// used to send a menu action nothing on this side handled — a dead menu item, fixed here as a small
// drive-by since this is the same Help menu/same file already being touched for #32.
const SHORTCUT_GROUPS = [
  {
    title: "File",
    items: [
      ["Ctrl/Cmd+N", "New project"],
      ["Ctrl/Cmd+O", "Open project…"],
      ["Ctrl/Cmd+S", "Save project…"],
      ["Ctrl/Cmd+I", "Import CSV…"],
      ["Ctrl/Cmd+P", "Export PDF (of the Layout page)"],
    ],
  },
  {
    title: "Edit",
    items: [
      ["Ctrl/Cmd+Z", "Undo"],
      ["Ctrl/Cmd+Shift+Z", "Redo"],
      ["Ctrl+Y", "Redo (Windows habit)"],
    ],
  },
  {
    title: "Navigation",
    items: [
      ["Ctrl/Cmd+1", "3D View"],
      ["Ctrl/Cmd+2", "Geochem"],
      ["Ctrl/Cmd+3", "Geophysics"],
      ["Ctrl/Cmd+4", "Layout"],
    ],
  },
  {
    title: "Tools",
    items: [
      ["Ctrl/Cmd+Shift+C", "Open a cross-section pop-out"],
      ["Ctrl/Cmd+/", "This shortcuts reference"],
    ],
  },
  {
    title: "View",
    items: [
      ["Ctrl/Cmd+0", "Reset zoom"],
      ["Ctrl/Cmd+= / -", "Zoom in / out"],
    ],
  },
  {
    // TASKS.csv #212 — user report: middle-mouse drag panning the 3D view sometimes comes through as
    // a rotate instead, on some mouse hardware/driver setups. Shift+Left-drag was added as a reliable
    // pan gesture that doesn't depend on the middle button being reported correctly at all — listed
    // here so it's discoverable without needing to hit that bug first.
    title: "3D View mouse controls",
    items: [
      ["Left-drag", "Rotate/orbit"],
      ["Middle-drag or Shift+Left-drag", "Pan"],
      ["Scroll", "Zoom in / out"],
      ["Right-click", "Context menu"],
    ],
  },
  {
    title: "Layout page",
    items: [
      ["Delete / Backspace", "Delete the selected element(s)"],
      ["Ctrl/Cmd+Click", "Add/remove an element from the selection — drag any of them to move the whole group together"],
    ],
  },
];

export default function ShortcutsModal({ initialTab = "shortcuts", onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [tab, setTab] = useState(initialTab);
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", gap: 4 }}>
            <TabBtn active={tab === "shortcuts"} onClick={() => setTab("shortcuts")} icon={<Keyboard size={13} />} label="Shortcuts" />
            <TabBtn active={tab === "about"} onClick={() => setTab("about")} icon={<Info size={13} />} label="About" />
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        {tab === "shortcuts" ? (
          <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 11, color: "#94a1b0", lineHeight: 1.5 }}>
              Most of GeoStrix is a point-and-click tool by design — this is the small, real set of
              keyboard shortcuts that exist today, not an aspirational list. Undo/Redo step back
              through content changes (imports, deletes, moves, edits) — while a text field has focus,
              Ctrl/Cmd+Z instead does that field's own native text-undo, as expected.
            </div>
            {SHORTCUT_GROUPS.map((g) => (
              <div key={g.title}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 6 }}>{g.title}</div>
                {g.items.map(([keys, desc]) => (
                  <div key={keys} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                    <span style={kbd}>{keys}</span>
                    <span style={{ fontSize: 12, color: "#1a2028" }}>{desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, fontSize: 12.5, color: "#7b8794", lineHeight: 1.7 }}>
            <div style={{ fontSize: 17, color: "#8a6a1f", fontWeight: 600, marginBottom: 4 }}>GeoStrix</div>
            <div style={{ marginBottom: 10, color: "#94a1b0" }}>3D drillhole & geochemistry explorer</div>
            <div>MIT-licensed, built for smaller mineral exploration teams — drillhole visualization, geochemistry, geophysics, layout, and implicit geological modelling in one desktop app.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: active ? "#eaf1fa" : "transparent", border: active ? "1px solid #a9c6e0" : "1px solid transparent", borderRadius: 6, color: active ? "#1a2028" : "#55606e", fontSize: 12, cursor: "pointer" }}>
      {icon} {label}
    </button>
  );
}

const panel = { width: "min(420px, 92vw)", maxHeight: "80vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #d9dce1" };
const kbd = { display: "inline-block", minWidth: 108, padding: "2px 7px", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, color: "#e2a63c", fontSize: 10.5, fontFamily: "'Exo 2', system-ui, sans-serif", textAlign: "center" };
