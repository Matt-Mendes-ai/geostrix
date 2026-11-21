// TASKS.csv #3940 — where the styled info card of a tool sits: under its button, its start edge on the button's start edge
// (the end edge when align is "right"; both flip in rtl), flipped above the button when there is no room below, and always
// clamped to the window (margin m), so it is never off-screen. Pure, so test/toolInfoCard3940.test.mjs can check the edges.
export function placeToolInfo(anchor, card, view, { align = "left", rtl = false, gap = 6, m = 8 } = {}) {
  const atEnd = (align === "right") !== rtl;
  let left = atEnd ? anchor.right - card.width : anchor.left;
  left = Math.max(m, Math.min(left, view.width - card.width - m));
  let top = anchor.bottom + gap;
  if (top + card.height > view.height - m && anchor.top - gap - card.height >= m) top = anchor.top - gap - card.height;
  top = Math.max(m, Math.min(top, view.height - card.height - m));
  return { left, top };
}
