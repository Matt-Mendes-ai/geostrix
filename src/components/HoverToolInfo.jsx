import React, { useState } from "react";

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
export default function HoverToolInfo({ title, text, width = 240, align = "left", suppress, children }) {
  const [hover, setHover] = useState(false);
  const visible = hover && !suppress;

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {visible && (
        <div
          style={{
            position: "absolute", zIndex: 90, top: "calc(100% + 6px)",
            [align === "right" ? "right" : "left"]: 0,
            width, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.16)", padding: "9px 11px",
            textTransform: "none", letterSpacing: "normal", fontWeight: 400, pointerEvents: "none",
          }}
        >
          {title && (
            <div style={{ fontSize: 10.5, color: "#55606e", fontWeight: 600, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {title}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#1a2028", lineHeight: 1.55 }}>{text}</div>
        </div>
      )}
    </span>
  );
}
