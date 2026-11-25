// TASKS.csv #4070 part 5 — a closed group of items inside a context menu: the layer's right-click menu listed thirteen entries, six of them exports; the exports
// are one "Export" item that opens them in place (closed until asked for). Every export is still in the menu, one click further.
import React, { useState } from "react";
import { ContextItem } from "./ViewerParts.jsx";

export default function ContextGroup({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ContextItem label={`${label} ${open ? "▾" : "▸"}`} onClick={() => setOpen((o) => !o)} />
      {open && <div role="group" aria-label={label} style={{ paddingInlineStart: 12 }}>{children}</div>}
    </>
  );
}
