// TASKS.csv #3109 / #3081 (from #2951 and #3012, review #2876 WA iron) — Grade-tonnage's density per code of a logged layer (#2550) from a
// numeric downhole log: each code's mean of the log over the readings inside that code's intervals, as Downhole logs' code table gives it
// (#2951: a binned log's bins weighed by their count of readings), so the density by strand the review read off that table is not typed
// again by hand. A code whose mean lies outside DENSITY_RANGE (t/m³) is not taken (a susceptibility or gamma log is not a density), and
// one with fewer than MIN_READINGS bins is not either; both are named. The log's own valid range (#2953) applies, as everywhere it is read.
// Pure.
import { sourceAssays } from "./numericSources.js";
import { groupLogByCode, codeTable, NOT_LOGGED } from "./downholeLogs.js";
import { DENSITY_RANGE } from "./densityFromModel.js";

export const MIN_READINGS = 3;

// choice: a numericSourceChoices entry; ctx { layers, customLayers }; domainRows: the logged layer's intervals ({ hole_id, from, to, value })
// -> { fill: { code: t/m³ (2 decimals) }, taken: [{ code, mean, n, readings }], outside: [{ code, mean, n }], few: [{ code, n }],
//      readings, notLogged (readings in no interval of the layer), validRange (the log's, or null), outOfRange, range }
export function densityMeansByCode(choice, ctx, domainRows, { range = DENSITY_RANGE, minN = MIN_READINGS } = {}) {
  const data = sourceAssays(choice, ctx);
  const table = codeTable(groupLogByCode(data.assays, data.symbol, domainRows));
  const fill = {}, taken = [], outside = [], few = [];
  let readings = 0, notLogged = 0;
  for (const r of table) {
    readings += r.readings;
    if (r.key === NOT_LOGGED) { notLogged += r.readings; continue; }
    if (r.n < minN) { few.push({ code: r.key, n: r.n }); continue; }
    if (!(r.mean >= range[0] && r.mean <= range[1])) { outside.push({ code: r.key, mean: r.mean, n: r.n }); continue; }
    fill[r.key] = Math.round(r.mean * 100) / 100;
    taken.push({ code: r.key, mean: r.mean, n: r.n, readings: r.readings });
  }
  taken.sort((a, b) => b.readings - a.readings);
  return { fill, taken, outside, few, readings, notLogged, validRange: data.validRange || null, outOfRange: data.outOfRange || 0, range };
}
