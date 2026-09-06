import React, { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

// TASKS.csv #192 — user request: "Let's make an 'i' info button beside the tools that require
// explaining. When the user hover or click on the button it will display those texts you have in
// some tools, explaining how to use them." Several icon-only toolbar buttons across this app already
// carry a short explanatory string in their native `title` attribute (e.g. ge-subtoolbar's Grid/
// Themes/Database/QC/Boundary intercepts/Snapshot/Cross-section buttons) — a native browser tooltip
// works, but it's slow to appear, disappears the instant the mouse drifts off by a pixel, can't show
// more than a single line comfortably, and gives no visible signal that an explanation even exists
// until a user happens to hover the bare icon. This small "i" badge sits right next to a tool as an
// explicit, always-visible affordance — "there's more here" — and shows a full explanation (not just
// the short title text) in a proper popover on hover OR click, so it also works for someone who
// prefers to click through controls without lingering with the mouse.
//
// Deliberately its own tiny component rather than folding into the existing per-module popover system
// (ViewerModule's popoverStyle/openPopover state machine, GeophysicsModule's own local popovers, etc.)
// — those are all "click a tool to open its settings" popovers with real interactive content and only
// one can be open at a time; this is a separate, purely-informational overlay that needs to work
// ALONGSIDE whichever settings popover (if any) happens to be open next to it, so it manages its own
// tiny bit of open/pinned state independently rather than plugging into any one module's popover
// plumbing. Visual language (white card, #d9dce1 border, soft shadow) matches ViewerModule's own
// popoverStyle/popoverHeader so it reads as part of the same design system, not a foreign tooltip
// style, even though it's used from multiple different modules.
export default function InfoButton({ text, title, width = 240, align = "left" }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef(null);

  // Click-to-pin behavior: a click toggles a PINNED state independent of hover, so the popover stays
  // open after the mouse leaves (useful on a trackpad/touch device, or just to read a longer
  // explanation without holding the mouse still) — closed by clicking anywhere outside it, or Escape.
  useEffect(() => {
    if (!pinned) return;
    const onDocClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setPinned(false); };
    const onKey = (e) => { if (e.key === "Escape") setPinned(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [pinned]);

  const visible = hovering || pinned;

  // Reset text-transform/letter-spacing/font-weight on the root span: some section headers this button
  // sits inside (ge-section-label) are styled uppercase/letter-spaced/bold via CSS, which would
  // otherwise cascade down into the popover's body text and title and make ordinary sentences read as
  // shouted, letter-spaced, ALL CAPS text — found via a real screenshot check, not just in theory.
  return (
    <span
      ref={rootRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0, textTransform: "none", letterSpacing: "normal", fontWeight: 400 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPinned((p) => !p); }}
        aria-label={title ? `Info: ${title}` : "Info"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 15, height: 15, borderRadius: "50%", padding: 0, flexShrink: 0,
          background: visible ? "var(--color-selected-bg)" : "transparent",
          border: `1px solid ${visible ? "var(--color-selected-border)" : "var(--color-border-light)"}`,
          color: visible ? "#3a76b0" : "#8a94a3",
          cursor: "pointer",
        }}
      >
        <Info size={12} />
      </button>
      {visible && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute", zIndex: 90, top: "calc(100% + 6px)",
            [align === "right" ? "right" : "left"]: 0,
            width, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.16)", padding: "9px 11px",
          }}
        >
          {title && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {title}
            </div>
          )}
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.55 }}>{text}</div>
        </div>
      )}
    </span>
  );
}
