// TASKS.csv #3966 — Matt: "For the viewport user should have the option, perhaps in Edit < Background, to change colour." Edit > Background
// colour... (the menu bar) opens this card over the visible 3D view: the colour, saved with the project as before (the view's right-click
// entry stays), and "White (default)" to go back. Loaded with the view, after its first frame.
import React, { useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { useModuleAction } from "../../lib/menuRequests.js";
import { useEscapeKey } from "../../lib/useEscapeKey.js";
import { colors } from "../../lib/theme.js";

const stop = (e) => e.stopPropagation(); // a click on the card is not a click on the 3D view (a section point, a pick)
function Card({ bgColor, setBgColor, onClose }) {
  useEscapeKey(onClose);
  return (
    <div role="dialog" aria-label={tr("Background colour")} data-bg-colour-box="" onClick={stop} onMouseDown={stop} onMouseUp={stop} onPointerDown={stop} onPointerUp={stop} onDoubleClick={stop} onContextMenu={stop} onWheel={stop} style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)" /* clear of the corner buttons */, zIndex: 40, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8,
      boxShadow: "0 6px 24px rgba(0,0,0,0.18)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>{tr("Background colour")}
        <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
          style={{ width: 32, height: 22, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, cursor: "pointer", background: "none" }} />
      </label>
      <button type="button" disabled={bgColor?.toLowerCase() === colors.viewBg} onClick={() => setBgColor(colors.viewBg)}
        style={{ padding: "4px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg)", color: "var(--color-text)", cursor: "pointer", font: "inherit" }}>{tr("White (default)")}</button>
      <button type="button" onClick={onClose} aria-label={tr("Close")} title={tr("Close")}
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "var(--font-size-lg)", lineHeight: 1 }}>×</button>
    </div>
  );
}

// visible: only the 3D view on screen answers the menu (the other modes' views may be mounted too)
export default function BackgroundColourBox({ visible, bgColor, setBgColor }) {
  const [open, setOpen] = useState(false);
  useModuleAction(["background-colour"], () => { if (visible) setOpen(true); });
  return open && visible ? <Card bgColor={bgColor} setBgColor={setBgColor} onClose={() => setOpen(false)} /> : null;
}
