// TASKS.csv #3731 (Scottie Gold review) — the medium of a surface sample from the file's type column. A rock appendix whose types were Grab / Chip / Channel (read as rock chip)
// and Composite / blank (not read) stored the unread 16 of 266 as 'soil', the dialog's fixed fallback, and said nothing. Now the fallback opens on the commonest medium the
// column's own words give (rock chip here), and the notice names the rows that took it ("Composite 6, blank 10").
// The words exports use for a medium (TASKS.csv #600: an MX rock file says "rock"; #845: the stream media apart: moss mat, heavy-mineral concentrate, BLEG and water)
export function mediumAlias(m) {
  return /rock|grab|chip|outcrop|float|channel/.test(m) ? "rock chip" : /moss/.test(m) ? "moss mat" : /\bhmc\b|heavy.?min|concentrate|\bpan\b/.test(m) ? "heavy mineral concentrate" : /bleg|bulk.?leach/.test(m) ? "BLEG" : /water/.test(m) ? "stream water" : /stream|silt|sediment|\bsed\b/.test(m) ? "stream sediment" : /talus/.test(m) ? "talus fines" : /soil|b.?horizon/.test(m) ? "soil" : null;
}
// the medium a raw cell reads as (a listed medium itself, or one of the words above), else null
export function mediumRead(raw, media) {
  const w = String(raw ?? "").trim().toLowerCase();
  return media.includes(w) ? w : mediumAlias(w);
}
// the commonest medium the column's words give, or null when none reads (ties go to the first met)
export function commonestMedium(values, media) {
  const n = new Map();
  for (const v of values) { const m = mediumRead(v, media); if (m) n.set(m, (n.get(m) || 0) + 1); }
  let best = null, bn = 0;
  for (const [m, c] of n) if (c > bn) { best = m; bn = c; }
  return best;
}
// the cells that read as no medium, as [[word, count] ...] most first; a blank cell is { blank: true } counted under ''
export function unreadMediumWords(values, media) {
  const n = new Map();
  for (const v of values) { if (mediumRead(v, media)) continue; const w = String(v ?? "").trim(); n.set(w, (n.get(w) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]);
}
