// TASKS.csv #3804 (Scottie Gold geophysics review; a gap in #3320) — a borehole EM file (SR21-93.tem: decay channels CH1..CH25, several components per
// station, a fixed loop, the readings down a hole 2 km from the drilling) was read by 'Import survey .xyz' as a ground magnetic survey ('736 points,
// 0 with elevation · values -9,131.7 to 42,755 nT', Method 'Magnetics (TMI)': RAWMAG chosen from its diurnal-correction block) and by EM > TEM line data
// as '736 stations on 1 line' with an airborne 1D inversion panel; the other eight imports refused it. There is no borehole EM reader: both routes now say
// what the file is. Pure.
import { temChannelGroups } from "./temLines.js";
import { t as tr } from "./i18n.js";

export const MIN_DECAY_GATES = 6; // a decay of six gates or more is a time-domain EM file, not a table of points

// the file's decay channels: { n gates, first, last, prefix } for its data group with the most gates, or null
export function emDecayChannels(columns) {
  const g = temChannelGroups(columns).find((x) => x.role === "data" && x.cols.length >= MIN_DECAY_GATES);
  return g ? { n: g.cols.length, first: g.cols[0], last: g.cols[g.cols.length - 1], prefix: g.prefix } : null;
}

const COMPONENT_COL = /^(comp|component|cmp|cmpt|comp_?(id|name|no)|rx_?comp(onent)?)$/i;
const HOLE_COL = /^(hole|bh|bhid|borehole)(_?(id|name|no|number))?$/i;
const DEPTH_COL = /^(depth|downhole(_?depth)?|dh_?depth|md|dep)$/i;
const HEADER_WORDS = /\b(borehole|bore[- ]hole|down[- ]?hole|dhem|bhem|bh[- ]?tem|drill ?hole)\b/i;

// why this file looks like borehole EM (the sentence's clue words), or [] when it does not. columns / rows as parsed (row objects keyed by column);
// headText: the first lines of the file (its comments), for a header that says 'borehole'
export function boreholeEmClues(columns, rows, headText = "") {
  const clues = [];
  const cols = (columns || []).map((c) => String(c).trim());
  const comp = cols.find((c) => COMPONENT_COL.test(c));
  if (comp) clues.push(tr("a component column ({col})", { col: comp }));
  const hole = cols.find((c) => HOLE_COL.test(c)), depth = cols.find((c) => DEPTH_COL.test(c));
  if (hole) clues.push(tr("a hole column ({col})", { col: hole }));
  else if (depth) clues.push(tr("a depth column ({col})", { col: depth }));
  if (HEADER_WORDS.test(String(headText || "").split(/\r?\n/, 80).filter((l) => /^\s*[/#]/.test(l)).join("\n"))) clues.push(tr("a header that says borehole"));
  // a station read for several components: the same X Y (Z) on consecutive rows
  const x = cols.find((c) => /^(x|east|easting|e|utmx)$/i.test(c)), y = cols.find((c) => /^(y|north|northing|n|utmy)$/i.test(c));
  if (x && y && (rows || []).length >= 6) {
    let same = 0, seen = 0;
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a[x] == null || b[x] == null) continue; seen++; if (a[x] === b[x] && a[y] === b[y]) same++; }
    if (seen >= 6 && same / seen >= 0.6) clues.push(tr("each station repeated for several components")); // three components: two repeats in three rows; a two-moment airborne file repeats half its rows, which is not this
  }
  return clues;
}

// the sentence for 'Import survey .xyz' / 'Import CSV' (a table of points): a multi-channel EM file is not one; null when it has no decay channels
export function emPointRefusal(name, columns, rows, headText = "") {
  const d = emDecayChannels(columns);
  if (!d) return null;
  const bh = boreholeEmClues(columns, rows, headText);
  return bh.length
    ? tr("\"{name}\" is a borehole EM file ({clues}; decay channels {first} … {last}, {n} gates), not a table of points: its readings are the decays at each station down a hole. GeoStrix has no reader for borehole EM yet.", { name, clues: bh.join(", "), first: d.first, last: d.last, n: d.n })
    : tr("\"{name}\" is a multi-channel EM file (decay channels {first} … {last}, {n} gates), not a table of points. Read it with EM › TEM line data.", { name, first: d.first, last: d.last, n: d.n });
}

// the error for EM > TEM line data, which reads line surveys (airborne or ground); a borehole file has no reader -> string | null
export function boreholeEmRefusal(name, columns, rows, headText = "") {
  const d = emDecayChannels(columns);
  if (!d) return null;
  const bh = boreholeEmClues(columns, rows, headText);
  return bh.length ? tr("\"{name}\" is borehole EM ({clues}; decay channels {first} … {last}, {n} gates). TEM line data reads airborne and ground line surveys, not a hole: GeoStrix has no reader for borehole EM yet.", { name, clues: bh.join(", "), first: d.first, last: d.last, n: d.n }) : null;
}
