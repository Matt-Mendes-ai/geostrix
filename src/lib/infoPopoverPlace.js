// TASKS.csv #3048 — where an info (i) popover goes, in window coordinates: under the button (or above it when there is no room
// below), aligned to the button's left (or right) edge, and always inside the window with a margin. `b` is the button's
// getBoundingClientRect(); `height` is the popover's measured height (0 before it is drawn).
export function infoPopoverPlace(b, { width = 240, height = 0, align = "left", viewW, viewH, gap = 6, margin = 8 }) {
  const w = Math.max(120, Math.min(width, viewW - 2 * margin));
  let left = align === "right" ? b.right - w : b.left;
  left = Math.max(margin, Math.min(left, viewW - margin - w));
  const below = viewH - b.bottom - gap - margin, above = b.top - gap - margin;
  const flip = height > 0 && height > below && above > below;
  const room = Math.max(80, flip ? above : below);
  const top = flip ? Math.max(margin, b.top - gap - Math.min(height, room)) : b.bottom + gap;
  return { left: Math.round(left), top: Math.round(top), width: w, maxHeight: Math.round(room) };
}
