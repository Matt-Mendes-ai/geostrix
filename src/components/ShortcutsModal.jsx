import React, { useState } from "react";
import { X, Keyboard, Info } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { version as APP_VERSION } from "../../package.json";

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
            <TabBtn active={tab === "shortcuts"} onClick={() => setTab("shortcuts")} icon={<Keyboard size={14} />} label="Shortcuts" />
            <TabBtn active={tab === "about"} onClick={() => setTab("about")} icon={<Info size={14} />} label="About" />
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        {tab === "shortcuts" ? (
          <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
              Most of GeoStrix is a point-and-click tool by design — this is the small, real set of
              keyboard shortcuts that exist today, not an aspirational list. Undo/Redo step back
              through content changes (imports, deletes, moves, edits) — while a text field has focus,
              Ctrl/Cmd+Z instead does that field's own native text-undo, as expected.
            </div>
            {SHORTCUT_GROUPS.map((g) => (
              <div key={g.title}>
                <div style={{ fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>{g.title}</div>
                {g.items.map(([keys, desc]) => (
                  <div key={keys} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                    <span style={kbd}>{keys}</span>
                    <span style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, fontSize: "var(--font-size-base)", color: "var(--color-text-caption)", lineHeight: 1.7 }}>
            {/* TASKS.csv #310 — About used to be five lines of plain text with no mark on it at all,
                despite the owl already being the app icon, the splash graphic and the favicon. This is
                the one screen whose entire job is to say what the product IS, so the identity belongs
                here more than anywhere else. Uses the SAME "./favicon.png" the index.html splash does
                rather than importing assets/geostrix-mark-64.png through Vite: that file already ships
                in public/, resolves identically under the dev server, the browser-fallback build and
                the packaged file:// load, and reusing it means the mark can never drift between the
                splash and About. 256px source drawn at 52px, so it stays crisp on a HiDPI display. */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <img src="./favicon.png" alt="" width={52} height={52} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-accent-dark)", fontWeight: 600 }}>GeoStrix</div>
                {/* TASKS.csv #246 — found by a pre-release review: no version was shown anywhere at rest,
                    only briefly in a self-clearing status-bar message after a manual update check. Read
                    straight from package.json (a plain Vite JSON import, works identically in the desktop
                    build and the browser-fallback dev path — no IPC needed for a value this static). */}
                <div style={{ color: "var(--color-text-muted)" }}>Version {APP_VERSION}</div>
                <div style={{ color: "var(--color-text-muted)" }}>3D drillhole & geochemistry explorer</div>
              </div>
            </div>
            <div>MIT-licensed, built for smaller mineral exploration teams — drillhole visualization, geochemistry, geophysics, layout, and implicit geological modelling in one desktop app.</div>
            {/* TASKS.csv #310 — the licence and the repository were mentioned in prose but not reachable.
                electron/main.js's setWindowOpenHandler (added in the same row) sends these to the user's
                real browser instead of a chromeless Electron window; in the browser-fallback dev path
                target="_blank" behaves normally. */}
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <a href={REPO_URL} target="_blank" rel="noreferrer" style={link}>Repository</a>
              <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" style={link}>MIT licence</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: active ? "var(--color-selected-bg)" : "transparent", border: active ? "1px solid var(--color-selected-border)" : "1px solid transparent", borderRadius: 6, color: active ? "var(--color-text)" : "var(--color-text-secondary)", fontSize: "var(--font-size-base)", cursor: "pointer" }}>
      {icon} {label}
    </button>
  );
}

// TASKS.csv #310 — kept next to the one place it is used rather than in a constants file; this is the
// same URL electron/main.js already bakes into the SRTM fetch User-Agent and README links to.
const REPO_URL = "https://github.com/Matt-Mendes-ai/geostrix";
const link = { color: "var(--color-primary)", textDecoration: "none", borderBottom: "1px solid var(--color-selected-border)", paddingBottom: 1 };
const panel = { width: "min(420px, 92vw)", maxHeight: "80vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--color-border)" };
const kbd = { display: "inline-block", minWidth: 108, padding: "2px 7px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-accent)", fontSize: "var(--font-size-sm)", fontFamily: "'Exo 2', system-ui, sans-serif", textAlign: "center" };
