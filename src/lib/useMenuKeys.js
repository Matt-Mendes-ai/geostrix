// TASKS.csv #730 — keyboard behaviour for a popup menu (the layer and sidebar-row right-click menus), after #575's
// 3D-view menu: on open the first item takes focus; Up/Down/Home/End move between items, Escape or Tab closes, and on
// close focus goes back to whatever had it when the menu opened (the row that was right-clicked or Shift+F10'd), not
// lost to <body>. Items are the menu's [role=menuitem] elements that are not aria-disabled.
import { useEffect, useRef } from "react";

export const menuItemsIn = (el) => [...(el?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') || [])];

// Index of the item a key moves to, or -1 for a key the menu does not handle.
export function nextMenuIndex(key, current, count) {
  if (!count) return -1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

export function useMenuKeys(open, close) {
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    menuItemsIn(menuRef.current)[0]?.focus();
    return () => {
      // only if focus went nowhere (the focused item was removed with the menu): a click elsewhere keeps its focus
      const a = document.activeElement;
      if (a && a !== document.body) return;
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, [Boolean(open)]); // open/closed, not the menu object's identity
  const onKeyDown = (e) => {
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); close(); return; }
    const items = menuItemsIn(menuRef.current);
    const i = nextMenuIndex(e.key, items.indexOf(document.activeElement), items.length);
    if (i < 0) return;
    e.preventDefault();
    items[i].focus();
  };
  return { menuRef, onKeyDown };
}
