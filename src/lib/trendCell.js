// TASKS.csv #3010 (WA iron review) — under a structural trend the grade shell's grid is cubic in the trend's volume-keeping warp (trendScales),
// so 'Cell (m)' is not the cell: Cell 10 under a 10:10:1 trend gave cells of about 21.5 x 21.5 x 2.2 m while the record said '10 m cells'.
// The real size along the trend's long, intermediate and short axes is the cell divided by each axis's warp scale. Pure.
import { trendScales } from "./trend.js";

// (trend, cell m) -> [along the long, intermediate, short axis] in metres, or null without a trend
export function trendCellM(trend, cellM) {
  if (!trend || !(cellM > 0)) return null;
  const s = trendScales(trend);
  return [cellM / s.major, cellM / s.semiMajor, cellM / s.minor];
}
// the three sizes as text: "21.5 × 21.5 × 2.2"
export const trendCellText = (c) => c.map((v) => String(Math.round(v * 10) / 10)).join(" × ");
