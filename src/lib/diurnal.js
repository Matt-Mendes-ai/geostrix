// TASKS.csv #610 — diurnal correction of ground magnetics from base-station recordings.
//
// Found testing ARIS 40958Z (Lawyers, #600): the GEM GSM-19 walk-mag rover files carry "cormag" = 0 on every
// reading (the correction was never applied in the field file) and the survey ships the base-station recordings
// beside them (RAW/<year>/TBL/<yyyymmdd>_BaseN.tbl). Without a correction only "rawmag" could be imported, which
// carries the day's magnetic drift (tens of nT over a field day) on top of the geology.
//
// A GEM base file looks like:
//   /Gem Systems GSM-19 4021347 v7.0 ...
//   /ID 1 file 01survey.b   19 VI 21          <- day, Roman month, 2-digit year
//   /datum  54000.00                           <- the instrument's display datum, NOT a base level
//   /= time:time:ID
//   /= diurnal:real
//   /= signal:real
//   07:55:05.0  57117.85 99                    <- time, total field (nT), signal quality (0-99)
//
// The correction: corrected = raw − (base(t) − datum), base(t) interpolated linearly between the two base readings
// around the rover's time. The datum defaults to each base's MEDIAN reading for the day (the usual choice when the
// contractor's datum isn't known), so the corrected values stay in the same nT range as the raw ones. With more
// than one base station (Lawyers ran Base3 and Base4 the same day at different places, ~20 nT apart), each base's
// DEVIATION from its own median is used and the deviations are averaged where both cover — the diurnal variation
// is regional, the base levels are not.
// A rover reading outside every base's coverage, or inside a gap longer than `maxGapSec`, is NOT corrected — it is
// reported, not guessed.

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

// "10:46:26.0" -> seconds of the day; null when the token isn't a clock time
export function parseClock(tok) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(String(tok ?? "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2], s = m[3] ? +m[3] : 0;
  return h < 48 && mi < 60 && s < 61 ? h * 3600 + mi * 60 + s : null;
}
export function formatClock(sec) {
  if (!Number.isFinite(sec)) return "—";
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// GEM header facts both file kinds share: the survey date ("/ID 1 file 01survey.b 19 VI 21") and a stated UTC
// offset ("/UTC-07", written by the GPS-equipped rover). Either may be missing.
export function gemHeaderInfo(text) {
  const head = String(text).split(/\r\n|\r|\n/, 40).filter((l) => l.trim().startsWith("/"));
  let date = null, utcOffsetH = null, instrument = null;
  for (const l of head) {
    const d = /\b(\d{1,2})\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\s+(\d{2,4})\s*$/.exec(l.trim());
    if (d && !date) { const y = +d[3] < 100 ? 2000 + +d[3] : +d[3]; date = `${y}-${String(ROMAN[d[2]]).padStart(2, "0")}-${String(+d[1]).padStart(2, "0")}`; }
    const u = /^\/\s*UTC\s*([+-]\d{1,2})/i.exec(l.trim());
    if (u) utcOffsetH = Number(u[1]);
    if (!instrument && /gem systems|gsm-?\d+/i.test(l)) instrument = l.replace(/^\/+/, "").trim();
  }
  return { date, utcOffsetH, instrument };
}

// Reads a base-station recording: GEM .tbl / .b ("time nT sq" rows under "/" headers), or any plain text whose rows
// are "<time> <nT> [quality]" (also "<date> <time> <nT>", the date token skipped). Readings whose GEM signal quality
// is below `minQuality` are dropped (a 49 at the end of a Lawyers base file is a 3 nT dip as the sensor was packed).
export function parseBaseStation(text, { minQuality = 50, name = "" } = {}) {
  const info = gemHeaderInfo(text);
  const samples = [];
  let lowQuality = 0, unreadable = 0;
  for (const raw of String(text).split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("/") || line.startsWith("#")) continue;
    const toks = line.split(/[\s,;]+/);
    let k = toks.findIndex((t) => parseClock(t) != null);
    if (k < 0) { unreadable++; continue; }
    const t = parseClock(toks[k]), nT = Number(toks[k + 1]);
    if (!Number.isFinite(nT) || nT < 15000 || nT > 80000) { unreadable++; continue; } // not an Earth's-field reading
    const q = toks[k + 2] != null && /^\d+$/.test(toks[k + 2]) ? Number(toks[k + 2]) : null;
    if (q != null && q <= 99 && q < minQuality) { lowQuality++; continue; }
    samples.push({ t, nT });
  }
  if (samples.length < 2) throw new Error(`${name || "This file"} has no base-station readings GeoStrix can read (expected rows of "time  nT" such as "07:55:05.0  57117.85 99").`);
  samples.sort((a, b) => a.t - b.t);
  const sorted = samples.map((s) => s.nT).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { name, ...info, samples, median, start: samples[0].t, end: samples[samples.length - 1].t, lowQuality, unreadable };
}

// Base value at time t by linear interpolation; null outside coverage or inside a gap longer than maxGapSec.
// `cursor` is an object carrying the last index, so a time-ordered walk is O(n + m).
function baseAt(base, t, maxGapSec, cursor) {
  const s = base.samples;
  if (t < s[0].t || t > s[s.length - 1].t) return null;
  let i = cursor.i;
  if (i >= s.length - 1 || s[i].t > t) i = 0;
  while (i < s.length - 2 && s[i + 1].t < t) i++;
  cursor.i = i;
  const a = s[i], b = s[i + 1];
  if (t === a.t) return a.nT;
  if (t === b.t) return b.nT;
  if (b.t - a.t > maxGapSec) return null;
  return a.nT + ((b.nT - a.nT) * (t - a.t)) / (b.t - a.t);
}

// Applies the correction to rover rows. `times[i]` is the rover reading's time (seconds of day), `raw[i]` its raw
// total field. Returns { corrected: (number|null)[], datum, used, outside, gaps, maxDev, bases }.
//   datum: the level corrected values are referred to; default = mean of the bases' medians.
//   timeShiftSec: added to every rover time before the lookup (a rover clock in UTC against a base in local time).
export function diurnalCorrect(times, raw, bases, { datum = null, maxGapSec = 60, timeShiftSec = 0 } = {}) {
  if (!bases.length) throw new Error("Load at least one base-station file.");
  const level = Number.isFinite(datum) ? datum : bases.reduce((s, b) => s + b.median, 0) / bases.length;
  const order = times.map((_, i) => i).filter((i) => Number.isFinite(times[i])).sort((a, b) => times[a] - times[b]);
  const cursors = bases.map(() => ({ i: 0 }));
  const corrected = new Array(times.length).fill(null);
  let used = 0, outside = 0, gaps = 0, maxDev = 0;
  for (const i of order) {
    if (!Number.isFinite(raw[i])) continue;
    const t = times[i] + timeShiftSec;
    let sum = 0, n = 0, covered = false;
    bases.forEach((b, k) => {
      if (t >= b.start && t <= b.end) covered = true;
      const v = baseAt(b, t, maxGapSec, cursors[k]);
      if (v != null) { sum += v - b.median; n++; }
    });
    if (!n) { if (covered) gaps++; else outside++; continue; }
    const dev = sum / n;
    if (Math.abs(dev) > Math.abs(maxDev)) maxDev = dev;
    corrected[i] = Math.round((raw[i] - dev - (bases.reduce((s, b) => s + b.median, 0) / bases.length - level)) * 100) / 100;
    used++;
  }
  const noTime = times.filter((t) => !Number.isFinite(t)).length;
  return { corrected, datum: level, used, outside, gaps, noTime, maxDev, bases: bases.map((b) => ({ name: b.name, date: b.date, start: b.start, end: b.end, n: b.samples.length, median: b.median })) };
}

// When NO rover time falls inside the base coverage, the usual cause is a clock difference (a GPS rover logging UTC,
// a base set to local time). Returns the whole-hour shift (−12..+12) that would cover the most rover readings, or
// null when none helps — offered to the user as a suggestion, never applied silently.
export function suggestClockShift(times, bases) {
  const ts = times.filter(Number.isFinite);
  if (!ts.length) return null;
  const coveredAt = (h) => ts.filter((t) => bases.some((b) => t + h * 3600 >= b.start && t + h * 3600 <= b.end)).length;
  let best = { h: 0, n: coveredAt(0) };
  for (const h of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10, 11, -11, 12, -12]) { // smallest shift wins a tie
    const n = coveredAt(h);
    if (n > best.n) best = { h, n };
  }
  return best.h !== 0 && best.n > 0 ? { hours: best.h, covered: best.n, of: ts.length } : null;
}

// One-line report for the import notice.
export function diurnalSummaryText(res, roverCount) {
  const b = res.bases.map((x) => `${x.name || "base"} ${formatClock(x.start)}–${formatClock(x.end)}`).join(", ");
  const left = [
    res.outside ? `${res.outside.toLocaleString("en-US")} outside the base coverage` : "",
    res.gaps ? `${res.gaps.toLocaleString("en-US")} in a base gap over a minute` : "",
    res.noTime ? `${res.noTime.toLocaleString("en-US")} without a time` : "",
  ].filter(Boolean).join(", ");
  return `Diurnal-corrected ${res.used.toLocaleString("en-US")} of ${roverCount.toLocaleString("en-US")} reading(s) against ${b}; datum ${res.datum.toFixed(1)} nT, largest correction ${(-res.maxDev).toFixed(1)} nT.${left ? ` Not corrected (left out of the corrected channel): ${left}.` : ""}`;
}
