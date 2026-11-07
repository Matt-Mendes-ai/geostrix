// TASKS.csv #1590 (review #1497, Lawyers) — the inversion's core-cell hint. Half the median nearest-neighbour spacing suits stations on a
// grid; on line data (walk mag, ground IP lines, airborne) the nearest neighbour is the next reading on the same line, often under a metre,
// while the lines are 50-200 m apart. When the rows carry a line id and the lines are more than 4x farther apart than the readings, the
// hint is a quarter of the line spacing (the IDW blanking helper's own line-spacing estimate, idw.js), rounded to 5 m, at least 5 m.
// rows: [{ x, y, line? }]; spacing: the median nearest-neighbour distance. -> { cell, lineSpacing | null } or null
import { suggestBlankingDistance } from "./idw.js";

export function coreCellHint(rows, spacing) {
  if (!(spacing > 0)) return null;
  const s = (rows?.length || 0) >= 3 ? suggestBlankingDistance(rows) : null;
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  if (s && s.basis === "line spacing" && s.spacing > 4 * spacing) return { cell: round5(s.spacing / 4), lineSpacing: s.spacing };
  return { cell: round5(spacing / 2), lineSpacing: null };
}
