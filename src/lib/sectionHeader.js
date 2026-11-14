// TASKS.csv #3410 (#3373's half handed back by side 4; review #3195, Galore Creek) — a section re-drawn for Layout at a large text factor (a
// narrow placement: the labels drawn up to ~2.5x) cut its title block off the top and printed its two end coordinates over each other.
// The section's header and foot laid out from what they hold, at the drawn text size. Pure: no DOM.
import { wrapText } from "./figureFurniture.js";

// An estimate of a line's width in px (the section draws 'Exo 2' / system fonts; an average glyph is about 0.56 em, a bold one 0.6 em)
export const textWidth = (text, px, em = 0.56) => String(text ?? "").length * em * px;

// title: the section's title; subtitleLines: its wrapped subtitle; W, PAD: the drawing's width and margin; fs(n): a size at the text factor.
// -> { titleLines, titleY (the first title line's baseline), subtitleY (the first subtitle line's), topExtra (px the drawing grows upward) }
// The subtitle's last line sits where it always did (PAD - fs(8)); the lines above it, then the title's, go up from there.
export function sectionHeaderLayout(title, subtitleLines, W, PAD, fs) {
  const maxChars = Math.max(8, Math.floor((W - 2 * PAD) / (0.6 * fs(12))));
  const titleLines = wrapText(title, maxChars);
  if (!titleLines.length) titleLines.push("");
  const n = Math.max(1, subtitleLines.length);
  const subtitleY = PAD - fs(8) - (n - 1) * fs(12);
  const titleY = subtitleY - fs(14) - (titleLines.length - 1) * fs(14);
  const topExtra = Math.max(0, Math.ceil(fs(12) + 4 - titleY)); // the first title line's cap height clear of the drawing's top
  return { titleLines, titleY, subtitleY, topExtra };
}

// The two end-coordinate labels under the distance axis (left- and right-aligned): side by side while they fit with a gap, else the right one
// a line lower. -> true when they must be stacked
export function stackEndLabels(left, right, W, PAD, px, gap = 12) {
  return textWidth(left, px) + textWidth(right, px) + gap > W - 2 * PAD;
}
