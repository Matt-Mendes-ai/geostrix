// TASKS.csv #2714 (split from #2401) — group labels at the left of a box plot were clipped at the plot's edge ('DH24-119 · no code
// logged' lost its start). The margin now grows with the longest label, up to a share of the width, and a label still longer is cut
// with an ellipsis (the plot gives the full name as a hover title). Text width is estimated, not measured: 0.58 em a character is a
// fair average for the app's sans fonts, and erring wide only leaves a little more margin.
const CHAR_EM = 0.58;

export const textWidthPx = (text, fontPx) => String(text ?? "").length * fontPx * CHAR_EM;

// the left margin for labels: at least `min`, at most `maxShare` of `width`, room for the longest label plus `gap`
export function labelMargin(labels, fontPx, { min = 90, width = 640, maxShare = 0.4, gap = 14 } = {}) {
  const longest = Math.max(0, ...(labels || []).map((l) => textWidthPx(l, fontPx)));
  return Math.round(Math.min(width * maxShare, Math.max(min, longest + gap)));
}

// the label cut to fit `maxPx`, with an ellipsis
export function fitLabel(text, maxPx, fontPx) {
  const s = String(text ?? "");
  const max = Math.max(3, Math.floor(maxPx / (fontPx * CHAR_EM)));
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
