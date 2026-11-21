import React, { useState, useId, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { placeToolInfo } from "../lib/toolInfoPlace.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// a string prop is translated here (callers may pass English); an element is shown as given (TASKS.csv #786)
const trText = (x) => (typeof x === "string" ? tr(x) : x);

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

// TASKS.csv #3940 (Matt, 2026-11-21: "I want this nice pop up info box for every tool") — the card is now one shared piece:
// useToolInfo() holds when it shows and ToolInfoCard draws it, so HoverToolInfo (the 3D View's own buttons) and every
// RibbonButton (src/components/Ribbon.jsx) show the same heading + one-sentence body.
//  - a short delay on hover (so it does not flash while the pointer crosses the ribbon), almost none on keyboard focus;
//  - keyboard focus only (:focus-visible): a click that focuses the button does not also open a card over what it opened;
//  - Escape, a click, a scroll or a resize hides it (until the pointer or focus leaves and returns);
//  - `suppress` (#3928): never over the button's own menu;
//  - drawn in a portal with fixed coordinates, flipped above the button near the bottom and clamped to the window, so a
//    ribbon that scrolls or clips (overflow) never cuts it and it is never off-screen; the start edge follows rtl (Arabic).
const HOVER_MS = 350, FOCUS_MS = 80;

export function useToolInfo({ anchorRef, title, text, suppress = false, align = "left", width = 240 }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState(false);
  const descId = useId();
  const want = (hover || focus) && !suppress && !dismissed && !!(title || text);
  useEffect(() => {
    if (!want) { setShown(false); return undefined; }
    const id = setTimeout(() => setShown(true), hover ? HOVER_MS : FOCUS_MS);
    return () => clearTimeout(id);
  }, [want, hover]);
  useEffect(() => {
    if (!shown) return undefined;
    const hide = () => setDismissed(true);
    const onKey = (e) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { document.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [shown]);
  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => { setHover(false); if (!focus) setDismissed(false); },
    onMouseDown: () => setDismissed(true),
    onFocus: (e) => { if (e.target?.matches?.(":focus-visible")) setFocus(true); },
    onBlur: () => { setFocus(false); if (!hover) setDismissed(false); },
  };
  const card = shown && want ? <ToolInfoCard anchorRef={anchorRef} title={title} text={text} width={width} align={align} /> : null;
  return { handlers, descId, card };
}

function ToolInfoCard({ anchorRef, title, text, width, align }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const a = anchorRef.current, c = ref.current;
    if (!a || !c) return;
    const rtl = getComputedStyle(a).direction === "rtl";
    setPos(placeToolInfo(a.getBoundingClientRect(), { width: c.offsetWidth, height: c.offsetHeight }, { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }, { align, rtl }));
  }, [anchorRef, title, text, width, align]);
  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      className="ge-tool-info"
      style={{
        position: "fixed", zIndex: 1200, left: pos ? pos.left : 0, top: pos ? pos.top : 0, visibility: pos ? "visible" : "hidden",
        width, maxWidth: "calc(100vw - 16px)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0,0,0,0.16)", padding: "9px 11px", boxSizing: "border-box",
        textTransform: "none", letterSpacing: "normal", fontWeight: 400, pointerEvents: "none", textAlign: "start",
      }}
    >
      {title && (
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: text ? 5 : 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {trText(title)}
        </div>
      )}
      {text && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.55 }}>{trText(text)}</div>}
    </div>,
    document.body,
  );
}

export default function HoverToolInfo({ title, text, width = 240, align = "left", suppress, children }) {
  const anchorRef = useRef(null);
  const { handlers, descId, card } = useToolInfo({ anchorRef, title, text, suppress, align, width });

  const child = React.isValidElement(children)
    ? React.cloneElement(children, {
        "aria-label": children.props["aria-label"] || title || undefined,
        "aria-describedby": text ? descId : undefined,
      })
    : children;

  return (
    <span ref={anchorRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }} {...handlers}>
      {child}
      {text && <span id={descId} style={srOnly}>{trText(text)}</span>}
      {card}
    </span>
  );
}
