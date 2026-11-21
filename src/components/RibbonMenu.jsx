// TASKS.csv #3928 — a ribbon button's drop-down menu (StrixViewer's Model, Layout's Add), keyboard-usable: when it opens, focus moves to its first item;
// the arrow keys (and Home / End) move between the items; Escape closes it and gives focus back to the button that opened it. The caller keeps the
// open / closed state (onClose) and its own outside-click handling.
import React, { useEffect, useRef } from "react";

export default function RibbonMenu({ label, onClose, style, children, ...rest }) {
  const ref = useRef(null), opener = useRef(null);
  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, []);
  const onKeyDown = (e) => {
    const items = [...(ref.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    const i = items.indexOf(document.activeElement);
    const go = (k) => { e.preventDefault(); items[(k + items.length) % items.length]?.focus(); };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose?.(); opener.current?.focus?.(); }
    else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  };
  return <div ref={ref} role="menu" aria-label={label} style={style} onKeyDown={onKeyDown} {...rest}>{children}</div>;
}
