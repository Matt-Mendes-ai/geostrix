// TASKS.csv #4016 — the 3D view's hover pop-up showed a long logged description in full: at 220 px wide a paragraph of
// a few hundred words made a box taller than the window, which the keep-inside rule (#1821) then pinned to the top,
// over the ribbon. A pop-up is a glance: each line is cut at a word boundary to about three lines of the wider box
// and the whole tip to a dozen lines; the full text stays in Identify and the data table.
export const TIP_LINE_CHARS = 160;
export const TIP_MAX_LINES = 12;

export function clipTipLine(line, max = TIP_LINE_CHARS) {
  const s = String(line ?? "");
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : s.slice(0, max)).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

export function clipTipText(text, { lineChars = TIP_LINE_CHARS, maxLines = TIP_MAX_LINES } = {}) {
  const lines = String(text ?? "").split("\n").map((l) => clipTipLine(l, lineChars));
  return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), "…"].join("\n") : lines.join("\n");
}

// Where the tip goes: right of and below the pointer, flipped above or left when it would run off the window, and never
// above the top or below the bottom of it (a box taller than the window starts at the top instead of running off).
export function placeTip(x, y, w, h, vw, vh) {
  const left = Math.max(4, Math.min(x + 14, vw - w - 8));
  const below = y + 22 + h <= vh;
  const top = below ? y + 14 : Math.max(4, Math.min(y - h - 8, vh - h - 4));
  return { left, top };
}
