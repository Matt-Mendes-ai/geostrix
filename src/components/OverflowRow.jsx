// TASKS.csv #4074 — the top bar's actions (New … Report) with a "⋯" menu at their end. When the bar is wider than the window even with every label gone
// (1,366 px: the KMZ button was cut off), App's fitToolbar hides the last actions (data-ovf) and this menu lists them, so none is unreachable.
// items: [{ key, node }] and { sep: true } for a divider; node is the action's button. The container takes no box of its own (display: contents).
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t as tr } from "../lib/i18n.js";
import { Ellipsis } from "./icons.js";

const OverflowRow = React.forwardRef(function OverflowRow({ items }, ref) {
  const [menu, setMenu] = useState(null);
  const tools = items.filter((i) => !i.sep);
  const close = () => setMenu(null);
  const open = (btn) => {
    if (menu) { close(); return; }
    const from = Number(ref?.current?.getAttribute("data-overflow-from"));
    if (!(from >= 0)) return;
    const r = btn.getBoundingClientRect();
    // under the button, growing toward the middle of the window: right-aligned when the button is in the right half, left-aligned in the left half (the row mirrors in Arabic)
    const end = r.left > window.innerWidth / 2;
    setMenu({ from, top: Math.round(r.bottom) + 2, end, x: end ? Math.max(4, window.innerWidth - Math.round(r.right)) : Math.max(4, Math.round(r.left)) });
  };
  return (
    <div className="ge-tool-actions" ref={ref}>
      {items.map((i, n) => (i.sep ? <div key={`sep${n}`} className="ge-tool-sep" data-sep="" /> : <React.Fragment key={i.key}>{i.node}</React.Fragment>))}
      <div className="ge-tool-more-wrap" data-more-wrap="">
        <button data-btn-own="" type="button" className="ge-tool-btn ge-tool-more-btn" aria-haspopup="menu" aria-expanded={!!menu} title={tr("More")} onClick={(e) => open(e.currentTarget)}>
          <Ellipsis size={14} aria-hidden="true" />
        </button>
      </div>
      {menu && <ActionMenu menu={menu} onClose={close}>{tools.slice(menu.from).map((i) => <div key={i.key} role="none">{i.node}</div>)}</ActionMenu>}
    </div>
  );
});
export default OverflowRow;

function ActionMenu({ menu, onClose, children }) {
  const box = useRef(null);
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target) && !e.target.closest?.(".ge-tool-more-btn")) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", down); window.addEventListener("keydown", key); window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return createPortal(
    <div ref={box} role="menu" className="ge-tool-menu" style={{ top: menu.top, ...(menu.end ? { right: menu.x } : { left: menu.x }) }} onClick={(e) => { if (e.target.closest?.("button")) setTimeout(onClose, 0); }}>
      {children}
    </div>, document.body);
}
