// TASKS.csv #458 — Office-style ribbon. User request (2026-09-25): "I don't like how tools are displayed on
// the side bar. I wanna have a tool bar with user-friendly symbols, similar to what we have in the office
// suite." The module tabs (3D View, 3D Modeling, Geochem...) act as the ribbon's tabs; under them, one band
// of big labelled buttons in named groups. Clicking a button opens its dialog, toggles its tool, or shows
// that tool's panel in the sidebar (a task pane, see TaskPaneHeader) — the sidebar keeps the data.
//
// App.jsx renders ONE empty band (.ge-ribbon) under the module tabs and provides it through
// RibbonSlotContext; each module portals its own <Ribbon> into it. The band's height is therefore the
// same on every tab (no layout jump when switching, the #309 lesson), while each module owns its buttons
// and their state. A module that is mounted but hidden (ViewerModule stays mounted, #225) must not render
// its ribbon — pass show={false}.
import React, { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { X } from "./icons.js";

export const RibbonSlotContext = createContext(null);

export function Ribbon({ children, show = true, label = "Tools" }) {
  const slot = useContext(RibbonSlotContext);
  if (!slot || !show) return null;
  return createPortal(<div className="ge-ribbon-inner" role="toolbar" aria-label={label}>{children}</div>, slot);
}

export function RibbonGroup({ label, children }) {
  return (
    <div className="ge-ribbon-group" role="group" aria-label={label}>
      <div className="ge-ribbon-items">{children}</div>
      <div className="ge-ribbon-caption">{label}</div>
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
export function RibbonButton({ icon: Icon, label, title, onClick, active = false, disabled = false, disabledReason, tone = "neutral", ariaLabel, children, buttonRef }) {
  const soft = disabled && !!disabledReason;
  return (
    <div className="ge-ribbon-cell">
      <button
        ref={buttonRef}
        type="button"
        className={`ge-ribbon-btn${active ? " active" : ""}${soft ? " is-disabled" : ""}`}
        aria-pressed={active || undefined}
        aria-label={ariaLabel || label}
        aria-disabled={soft || undefined}
        aria-description={soft ? disabledReason : undefined}
        title={soft ? `${disabledReason} — ${title || label}` : title}
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
export function TaskPaneHeader({ title, onClose, icon: Icon, tone = "neutral" }) {
  return (
    <div className="ge-pane-header">
      {Icon && <Icon size={16} strokeWidth={1.8} color={RIBBON_TONES[tone] || tone} aria-hidden="true" />}
      <span className="ge-pane-title">{title}</span>
      {onClose && <button type="button" className="ge-pane-close" onClick={onClose} aria-label={`Close ${title}`} title="Close — back to the data"><X size={14} /></button>}
    </div>
  );
}
