import React, { useState, useId } from "react";

// TASKS.csv #192 follow-up — user feedback on seeing the toolbar with a separate "i" badge beside
// every tool icon: "we don't want that. We want to hover the mouse on the tool icon and get that info
// text displayed, then when we click on the tool button it will run the tool." The original InfoButton
// pattern (still used for the module sidebars' plain section headers, which have no click action of
// their own — see GeophysicsModule/RasterModule) doesn't fit here: these ARE clickable tool buttons,
// so a second adjacent icon just to read about them was one extra thing to visually parse next to
// every single tool, and clicking the "i" had to carefully stopPropagation so it didn't also trigger
// the tool underneath. This wraps the tool button itself — hovering ANYWHERE on the button shows the
// same explanation popover (same visual language as InfoButton/ViewToolbar's own settings popovers:
// white card, #d9dce1 border, soft shadow), and a click passes straight through to the button's own
// onClick untouched, so the hover/click behaviors don't compete for the same element the way a native
// `title` tooltip would if left in place alongside this (callers should drop `title` on any button
// wrapped here, to avoid a redundant native tooltip stacking under this popover).
// TASKS.csv #297 — the accessibility half of the same tooltip. The copy above is genuinely good, but
// until now it existed ONLY as a mouse-hover <div>: the 3D View's most prominent, always-visible icon
// row (grid / themes / measure / section-draw / snapshot / QC …) showed up in the accessibility tree
// as a row of completely anonymous buttons, and the explanation never appeared on keyboard focus.
// Fixed here rather than at each call site so the accessible name can't drift from the tooltip copy —
// they're now literally the same two props:
//   * `title` becomes the button's aria-label (short: "Grid", "Measure"),
//   * `text` is always in the DOM in a visually-hidden node wired up as aria-describedby, so the full
//     explanation reaches a screen reader whether or not the popover is currently shown,
//   * and the popover itself now also opens on keyboard focus, not just mouse hover, so a sighted
//     keyboard user tabbing along the row gets the same explanation a mouse user gets.
// An aria-label already set by the caller wins — this only fills in a missing one.
const srOnly = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

export default function HoverToolInfo({ title, text, width = 240, align = "left", suppress, children }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const descId = useId();
  const visible = (hover || focused) && !suppress;

  const child = React.isValidElement(children)
    ? React.cloneElement(children, {
        "aria-label": children.props["aria-label"] || title || undefined,
        "aria-describedby": text ? descId : undefined,
      })
    : children;

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {child}
      {text && <span id={descId} style={srOnly}>{text}</span>}
      {visible && (
        <div
          style={{
            position: "absolute", zIndex: 90, top: "calc(100% + 6px)",
            [align === "right" ? "right" : "left"]: 0,
            width, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.16)", padding: "9px 11px",
            textTransform: "none", letterSpacing: "normal", fontWeight: 400, pointerEvents: "none",
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
