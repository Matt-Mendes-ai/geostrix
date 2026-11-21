// TASKS.csv #3933 — the app's document must never scroll. Every pane scrolls inside itself, and html / body / #root are exactly the
// window's size. A page scroll can still happen: overflow: hidden stops the wheel and the scroll bar, but not a focus() or a
// scrollIntoView, which scroll any ancestor to bring an element into view. In v0.2.3 a click on a visually hidden radio button in the
// trend helper focused it, and the whole app slid up out of the window. Nothing was left on screen except the status bar, which ended up
// near the top. The CSS in app.css makes the page's scroll range zero, and this puts the page back at once if anything scrolls it anyway.
export function installNoPageScroll(win = typeof window === "undefined" ? null : window) {
  const doc = win?.document;
  if (!doc) return () => {};
  const reset = (el) => { if (el && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } };
  const onScroll = (e) => {
    const t = e?.target;
    // the page itself (a scroll event on the document), or one of the three boxes that hold the app; a pane's own scroll is left alone
    if (t === doc || t === doc.documentElement || t === doc.body || t === doc.getElementById?.("root")) {
      reset(doc.scrollingElement || doc.documentElement); reset(doc.documentElement); reset(doc.body); reset(doc.getElementById?.("root"));
    }
  };
  win.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => win.removeEventListener("scroll", onScroll, { capture: true, passive: true });
}
