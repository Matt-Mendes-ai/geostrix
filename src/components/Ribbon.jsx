// TASKS.csv #458 — Office-style ribbon. User request (2026-09-25): "I don't like how tools are displayed on
// the side bar. I wanna have a tool bar with user-friendly symbols, similar to what we have in the office
// suite." The module tabs (3D View, 3D Modelling, Geochem...) act as the ribbon's tabs; under them, one band
// of big labelled buttons in named groups. Clicking a button opens its dialog, toggles its tool, or shows
// that tool's panel in the sidebar (a task pane, see TaskPaneHeader) — the sidebar keeps the data.
//
// App.jsx renders ONE empty band (.ge-ribbon) under the module tabs and provides it through
// RibbonSlotContext; each module portals its own <Ribbon> into it. The band's height is therefore the
// same on every tab (no layout jump when switching, the #309 lesson), while each module owns its buttons
// and their state. A module that is mounted but hidden (ViewerModule stays mounted, #225) must not render
// its ribbon — pass show={false}.
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUiMode } from "../lib/uiMode.js"; // TASKS.csv #748 — Simple / Advanced
import { createPortal } from "react-dom";
import { X } from "./icons.js";
import { t } from "../lib/i18n.js"; // TASKS.csv #786 — every tab's ribbon labels, captions and tooltips translated here

export const RibbonSlotContext = createContext(null);

export function Ribbon({ children, show = true, label = "Tools" }) {
  const slot = useContext(RibbonSlotContext);
  const { mode, setMode } = useUiMode();
  const innerRef = useRef(null);
  const [hidden, setHidden] = useState(0);
  // #748 — how many tools Simple mode is hiding on this tab (counted from the rendered buttons, so it is always right)
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const n = mode === "simple" ? [...el.querySelectorAll(".ge-ribbon-btn")].filter((b) => b.closest(".ge-adv")).length : 0;
    if (n !== hidden) setHidden(n);
  });
  // TASKS.csv #787 — fit the band: when the groups are wider than the window (Advanced mode at 1,024 px, longer
  // labels in Spanish / Portuguese / French / Arabic), groups collapse to icon-only buttons from the last one back
  // until it fits. The band itself never scrolls (overflow would clip the popovers that drop below it, #449).
  // Re-measured only when the band's width or the set of buttons / labels changes, never on an ordinary re-render.
  const fitKey = useRef("");
  const fit = () => {
    const el = innerRef.current;
    if (!el) return;
    const groups = [...el.querySelectorAll(":scope > .ge-ribbon-group")];
    groups.forEach((g) => g.removeAttribute("data-compact"));
    el.removeAttribute("data-tight"); el.removeAttribute("data-wrap");
    for (let i = groups.length - 1; i >= 0 && el.scrollWidth > el.clientWidth + 1; i--) {
      if (getComputedStyle(groups[i]).display === "none") continue; // hidden in Simple mode
      groups[i].setAttribute("data-compact", "");
    }
    // TASKS.csv #1292 — Geochem has 27 tools: icon-only was still 114 px too wide at 1,024 px and ran under the mode toggle.
    // Tighter buttons, then as a last resort a second row (taller, never hidden: every tool stays clickable).
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute("data-tight", "");
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute("data-wrap", "");
  };
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const key = `${mode}|${el.clientWidth}|${[...el.querySelectorAll(".ge-ribbon-label")].map((x) => x.textContent).join("|")}`;
    if (key !== fitKey.current) { fitKey.current = key; fit(); }
  });
  useEffect(() => {
    if (!slot || !show || typeof ResizeObserver === "undefined") return undefined;
    let w = slot.clientWidth;
    const ro = new ResizeObserver(() => { if (slot.clientWidth !== w) { w = slot.clientWidth; fit(); } }); // compacting never changes the band's width: no loop
    ro.observe(slot);
    return () => ro.disconnect();
  }, [slot, show]);
  if (!slot || !show) return null;
  return createPortal(
    <div ref={innerRef} className={`ge-ribbon-inner${mode === "simple" ? " ge-ribbon-simple" : ""}`} role="toolbar" aria-label={t(label)}>
      {children}
      {hidden > 0 && (
        <div className="ge-ribbon-group ge-ribbon-more">
          <div className="ge-ribbon-items">
            <button type="button" className="ge-ribbon-btn" onClick={() => setMode("advanced")} title={t("Show every tool on this tab (Advanced mode — switch back any time from the top bar)")}>
              <span className="ge-ribbon-more-count">+{hidden}</span>
              <span className="ge-ribbon-label">{t("more tools")}</span>
            </button>
          </div>
          <div className="ge-ribbon-caption">{t("Advanced")}</div>
        </div>
      )}
    </div>, slot);
}

// advanced (#748): the whole group is hidden in Simple mode
export function RibbonGroup({ label, children, advanced = false }) {
  return (
    <div className={`ge-ribbon-group${advanced ? " ge-adv" : ""}`} role="group" aria-label={t(label)}>
      <div className="ge-ribbon-items">{children}</div>
      <div className="ge-ribbon-caption" title={t(label)}>{t(label)}</div>
    </div>
  );
}

// Icon colours by kind of action — the friendly, colour-coded look of an office ribbon, from a small fixed
// palette (all >= 3:1 against the ribbon background, WCAG 1.4.11 for graphics).
export const RIBBON_TONES = {
  data: "#2f6fe0",     // import / database / files
  view: "#6b4fbb",     // what the view shows
  section: "#b0612a",  // sections, slices, cuts
  analyse: "#1f7a63",  // measure, QC, statistics
  model: "#2e7d4f",    // modelling
  output: "#b23a5a",   // snapshot / export / print
  neutral: "#55606e",
};

// TASKS.csv #566 — disabledReason: a disabled button that says what it needs ("Import assays first"). It stays in the
// Tab order (aria-disabled, clicks ignored) with the reason first in its tooltip and accessible description; a
// plain `disabled` button is skipped by the keyboard, so a screen-reader user never learned why it was off.
// expanded (TASKS.csv #595): for a button that shows / hides a task pane or popover, aria-expanded instead of
// aria-pressed, so a screen reader announces "expanded / collapsed" rather than a toggle.
export function RibbonButton({ icon: Icon, label: label0, title: title0, onClick, active = false, expanded, disabled = false, disabledReason: reason0, tone = "neutral", ariaLabel: aria0, children, buttonRef, advanced = false }) {
  const label = t(label0), title = t(title0), disabledReason = t(reason0), ariaLabel = t(aria0); // #786
  const soft = disabled && !!disabledReason;
  return (
    <div className={`ge-ribbon-cell${advanced ? " ge-adv" : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`ge-ribbon-btn${active ? " active" : ""}${soft ? " is-disabled" : ""}`}
        aria-pressed={expanded === undefined ? active || undefined : undefined}
        aria-expanded={expanded}
        aria-label={ariaLabel || label}
        aria-disabled={soft || undefined}
        aria-description={soft ? disabledReason : undefined}
        title={soft ? `${disabledReason} — ${title || label}` : title || label /* #787: the only text left when its group is icon-only */}
        onClick={soft ? undefined : onClick}
        disabled={disabled && !soft}
      >
        {Icon && <Icon size={22} strokeWidth={1.7} color={disabled ? undefined : RIBBON_TONES[tone] || tone} aria-hidden="true" />}
        <span className="ge-ribbon-label">{label}</span>
      </button>
      {children /* popover, inline setting... rendered under / beside the button */}
    </div>
  );
}

// Header for a tool shown in the sidebar (a "task pane"): its name and a close button that returns the
// sidebar to the module's data.
// TASKS.csv #595 — focus: a pane opened from a ribbon button takes focus to its title, so a keyboard user lands in
// the pane instead of Tabbing through the rest of the ribbon; when it closes and focus would otherwise fall to
// <body> (its close button just disappeared), focus goes back to the button that opened it.
export function TaskPaneHeader({ title, onClose, icon: Icon, tone = "neutral" }) {
  const titleRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    if (!opener?.closest?.(".ge-ribbon")) return undefined; // opened some other way (restored, a link): leave focus alone
    titleRef.current?.focus();
    return () => setTimeout(() => {
      const a = document.activeElement;
      if ((!a || a === document.body) && opener.isConnected) opener.focus();
    }, 0);
  }, []);
  return (
    <div className="ge-pane-header">
      {Icon && <Icon size={16} strokeWidth={1.8} color={RIBBON_TONES[tone] || tone} aria-hidden="true" />}
      <span ref={titleRef} tabIndex={-1} className="ge-pane-title">{t(title)}</span>
      {onClose && <button type="button" className="ge-pane-close" onClick={onClose} aria-label={t("Close {name}", { name: t(title) })} title={t("Close — back to the data")}><X size={14} /></button>}
    </div>
  );
}
