// TASKS.csv #82 (layer 1 of the geological-modelling architecture the user laid out — see #82's
// TASKS.csv note for the full 12-layer plan this is the first piece of) — drillhole data QA/QC.
// "Before modelling anything, the software should validate..." per that advice. Pure functions, no
// React/three.js here — ViewerModule/DataQCModal call these and render the result.
//
// Deliberately conservative about what counts as an ERROR vs a WARNING vs INFO: an error is something
// that will actively corrupt geometry (a hole with no matching collar, a from > to interval, NaN
// coordinates) or silently misplace it (an out-of-hole-length interval). A warning is something that
// COULD be a real problem but might also be normal for this dataset (very short intervals, a big gap
// between logged intervals, a duplicate hole_id — could be a genuine re-drill). Info is just a
// heads-up with no implied problem (e.g. "N holes have no survey — using straight-hole fallback").

import { pointInBoundary } from "./geoprocessing.js";
import { arrMax, arrMin } from "./arrayStats.js"; // arrMin: #2335
import { isMarkedQcRow } from "./qaqc.js"; // TASKS.csv #601
import { terrainGroundAt } from "./viewer/geomath.js"; // TASKS.csv #558; #927 — never compared with the fill

import { didYouMean } from "./holeIds.js"; // TASKS.csv #541 (own module: dataQC stays out of the startup bundle)
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
import { surveyAzimuthDipAt } from "./desurvey.js"; // TASKS.csv #1109
import { surveyMethodByHole } from "./surveyMethod.js"; // TASKS.csv #2494
import { coverageInfos } from "./dataQcCoverage.js"; // TASKS.csv #2493
import { suspectElevationIds } from "./collarElevationTrust.js"; // TASKS.csv #3004 / #2896

// TASKS.csv #2939 — a hole's direction as a unit vector (E, N, up) from its azimuth and dip below the horizontal (up: an uphole), and the
// angle between two such directions in degrees
export const SAME_DIRECTION_DEG = 3; // the reviewer's 'about 3 degrees'; a pad's fan holes differ by more
export function holeDirection(azimuth, dipDown, up = false) {
  const a = (azimuth * Math.PI) / 180, d = (dipDown * Math.PI) / 180, h = Math.cos(d);
  return [h * Math.sin(a), h * Math.cos(a), up ? Math.sin(d) : -Math.sin(d)];
}
export function angleBetween(u, v) {
  const c = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
export { didYouMean };

const clampSeverityIcon = { error: "🔴", warning: "🟡", info: "🔵" };

// TASKS.csv #2335 — an inclined hole surveyed at the collar only is warned about when longer than this (its unsurveyed path can wander far)
const COLLAR_ONLY_LONG_M = 150;
function pushIssue(issues, severity, category, holeId, message) {
  issues.push({ severity, category, holeId: holeId || null, message });
}

// ---- Collars ----
function validateCollars(collars, survey = []) { // survey: #2186
  const issues = [];
  const seenIds = new Map(); // hole_id -> count
  const seenCoords = new Map(); // "x,y" (rounded) -> [hole_id]
  collars.forEach((c) => {
    const id = c.hole_id || "(blank)";
    seenIds.set(id, (seenIds.get(id) || 0) + 1);
    if (!c.hole_id) pushIssue(issues, "error", "Collars", null, tr("A collar row has no hole ID."));
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) {
      pushIssue(issues, "error", "Collars", id, tr("Missing or non-numeric X/Y/Z — this hole cannot be positioned at all."));
    }
    // Azimuth/dip are optional on a collar (only used as a straight-hole fallback when no survey
    // exists for this hole) — checked properly in validateSurveyAndTrajectory below, where the
    // fallback actually gets applied, not here.
    if (c.azimuth != null && Number.isFinite(c.azimuth) && (c.azimuth < 0 || c.azimuth >= 360)) {
      pushIssue(issues, "warning", "Collars", id, tr("Collar azimuth {azimuth}° is outside 0–360°.", { azimuth: c.azimuth }));
    }
    if (c.dip != null && Number.isFinite(c.dip) && (c.dip < -90 || c.dip > 90)) {
      pushIssue(issues, "warning", "Collars", id, tr("Collar dip {dip}° is outside -90–90°.", { dip: c.dip }));
    }
    if (c.length != null && Number.isFinite(c.length) && c.length <= 0) {
      pushIssue(issues, "warning", "Collars", id, tr("Collar hole length {c} is zero or negative.", { c: c.length }));
    }
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
      const key = `${Math.round(c.x)},${Math.round(c.y)}`;
      const arr = seenCoords.get(key) || [];
      arr.push(id);
      seenCoords.set(key, arr);
    }
  });
  seenIds.forEach((count, id) => {
    if (count > 1) pushIssue(issues, "warning", "Collars", id, tr("Hole ID \"{id}\" appears {count} times in collars — duplicate import, or a genuine re-drill sharing a name?", { id, count }));
  });
  // TASKS.csv #1532 (review #1497, Lawyers) — holes from one pad start within a metre of each other with different azimuth / dip (a fan):
  // that is a pad (info). Only holes that also share their azimuth and dip (to 1 degree) are a possible duplicate (warning). 39 fan holes
  // were worded as duplicates beside the 4 real ones.
  const byId = new Map(collars.map((c) => [c.hole_id || "(blank)", c]));
  // TASKS.csv #2186 (review #2174, WA gold) — collar files of underground mines carry no azimuth / dip (the surveys do), so every cuddy's
  // fan was a 'duplicate' warning (50 on the WA project): the first survey station's attitude is used when the collar has none
  const firstStation = new Map();
  for (const s of survey || []) { if (!Number.isFinite(s.depth) || !Number.isFinite(s.azimuth) || !Number.isFinite(s.dip)) continue; const f = firstStation.get(s.hole_id); if (!f || s.depth < f.depth) firstStation.set(s.hole_id, s); }
  // TASKS.csv #2939 (review #2876, WA iron) — the attitude as a direction (E, N, down), compared by the angle between two holes: the rounded
  // azimuth | dip key called a vertical RC hole (-90 / 0) and its diamond twin (-89 / 279.5) a fan, though both point straight down (the
  // azimuth of a near-vertical hole says almost nothing). 24 twin pairs were 'a drill pad (fan)'.
  const orient = (id) => {
    const c = byId.get(id) || {};
    if (Number.isFinite(c.azimuth) && Number.isFinite(c.dip)) return holeDirection(c.azimuth, Math.abs(c.dip), false);
    const s = firstStation.get(id);
    return s ? holeDirection(s.azimuth, Math.abs(s.dip), s.dip < 0) : null; // an uphole beside a downhole of one |dip| is not the same hole
  };
  seenCoords.forEach((ids, key) => {
    const unique = Array.from(new Set(ids));
    const canTell = unique.length > 1 && unique.every((id) => orient(id) != null); // without azimuth / dip a fan cannot be told: the old warning below
    if (canTell) {
      const groups = []; // [{ dir, ids }]: a hole joins the first group whose first hole points within SAME_DIRECTION_DEG of it
      unique.forEach((id) => { const d = orient(id), g = groups.find((x) => angleBetween(x.dir, d) <= SAME_DIRECTION_DEG); if (g) g.ids.push(id); else groups.push({ dir: d, ids: [id] }); });
      const same = groups.map((g) => g.ids).filter((g) => g.length > 1);
      same.forEach((g) => pushIssue(issues, "warning", "Collars", null, tr("{n} holes ({ids}) share the same collar (within 1m) AND point the same way (within 3°) — a twin or re-drill, a duplicate import, or a coordinate entry error.", { n: g.length, ids: g.join(", ") })));
      if (same.flat().length < unique.length) pushIssue(issues, "info", "Collars", null, tr("{n} holes ({ids}) start within 1m of each other with different azimuths or dips: a drill pad (fan), not a duplicate.", { n: unique.length, ids: unique.join(", ") }));
      return;
    }
    if (unique.length > 1) pushIssue(issues, "warning", "Collars", null, tr("{unique} holes ({unique2}) share essentially the same collar location (within 1m) — check for a duplicate import or a coordinate entry error.", { unique: unique.length, unique2: unique.join(", ") }));
  });
  return issues;
}

// ---- Survey / trajectory ----
function* validateSurveyAndTrajectorySteps(collars, survey, { doglegWarn = 3, doglegError = 10 } = {}) { // TASKS.csv #3136 — pauses (yield) for the sliced run
  const issues = [];
  let tick = 0;
  const collarIds = new Set(collars.map((c) => c.hole_id));
  const byHole = new Map();
  for (const s of survey) {
    if (++tick % ROW_STEP === 0) yield;
    if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []);
    byHole.get(s.hole_id).push(s);
  }
  const orphanStations = new Map(); // TASKS.csv #1275 — one error per hole: 40 gyro stations gave 40 identical lines that buried the rest
  for (const s of survey) {
    if (++tick % ROW_STEP === 0) yield;
    if (!collarIds.has(s.hole_id)) orphanStations.set(s.hole_id, (orphanStations.get(s.hole_id) || 0) + 1);
    if (!Number.isFinite(s.depth) || s.depth < 0) pushIssue(issues, "error", "Survey", s.hole_id, tr("Survey station has an invalid depth ({depth}).", { depth: s.depth }));
    if (Number.isFinite(s.azimuth) && (s.azimuth < 0 || s.azimuth >= 360)) pushIssue(issues, "warning", "Survey", s.hole_id, tr("Survey azimuth {azimuth}° is outside 0–360° @ {depth}m.", { azimuth: s.azimuth, depth: s.depth }));
    if (Number.isFinite(s.dip) && (s.dip < -90 || s.dip > 90)) pushIssue(issues, "warning", "Survey", s.hole_id, tr("Survey dip {dip}° is outside -90–90° @ {depth}m.", { dip: s.dip, depth: s.depth }));
  }
  // TASKS.csv #3202 — many ids with no collar (a file's 91 test pits) are one line naming them, not 91 errors; a few keep their own lines (and their 'did you mean')
  if (orphanStations.size > 3) {
    const ids = [...orphanStations.keys()], total = [...orphanStations.values()].reduce((a, b) => a + b, 0);
    pushIssue(issues, "error", "Survey", ids[0], tr("{n} survey hole ids have no matching collar ({ids}): their {stations} stations cannot be desurveyed and won't render.", { n: ids.length, ids: ids.slice(0, 8).join(", ") + (ids.length > 8 ? ", …" : ""), stations: total }));
  } else orphanStations.forEach((n, id) => pushIssue(issues, "error", "Survey", id, tr("{n} survey stations for hole \"{hole_id}\", which has no matching collar: this hole cannot be desurveyed and won't render.{v}", { n, hole_id: id, v: didYouMean(collarIds, id) })));
  const lengthOf = new Map(collars.map((c) => [c.hole_id, Number(c.length)]));
  const collarOnly = []; // TASKS.csv #2335 — holes surveyed at the collar only (see below)
  for (const [holeId, stations] of byHole) {
    if (++tick % HOLE_STEP === 0) yield;
    const sorted = [...stations].sort((a, b) => a.depth - b.depth);
    // TASKS.csv #714 — a survey that stops well above the end of the hole: desurvey carries the last attitude on to
    // EOH (#338), and the trace, sections, exports and estimation samples below it all use that guess with no flag
    // (Woodjam WJ23-105: stations at 0 and 50 m for a 111 m hole). Warned when the gap is over 30 m, or over 15 m and 20 %
    // of a short hole. The review's 'over 30 m AND 20 %' missed DH23-109: 56.5 m of guessed path is only 13 % of 438.5 m.
    const eoh = lengthOf.get(holeId), last = sorted.length ? sorted[sorted.length - 1].depth : NaN;
    const gap = eoh - last;
    if (Number.isFinite(eoh) && Number.isFinite(last) && (gap > 30 || (gap > 15 && gap > 0.2 * eoh))) {
      // TASKS.csv #2335 (review #2325, WA uranium) — a collar station only (one station at the top) on a vertical hole, or on a short
      // inclined one, is how 'drilled straight, not surveyed downhole' is recorded: 430 aircore holes made 430 of 450 warnings. Counted in
      // one note below; a survey that stops partway, or a long inclined hole with a collar shot only, keeps its warning.
      const top = sorted[0], one = sorted.length === 1 && top.depth <= 1, steep = Number.isFinite(top?.dip) && Math.abs(top.dip) >= 85;
      if (one && (steep || eoh <= COLLAR_ONLY_LONG_M)) collarOnly.push({ eoh, steep });
      else {
        pushIssue(issues, "warning", "Survey", holeId, tr("The survey ends at {v} m, {v2} m above the end of the hole ({v3} m, {v4}%): the trace below is carried on with the last attitude, a guess — the hole's real path down there is unknown.", { v: +last.toFixed(1), v2: +(eoh - last).toFixed(1), v3: +eoh.toFixed(1), v4: Math.round((100 * (eoh - last)) / eoh) }));
      }
    }
    // Duplicate-depth stations.
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].depth === sorted[i - 1].depth) pushIssue(issues, "warning", "Survey", holeId, tr("Two survey stations at the same depth ({depth}m) — only one will be used.", { depth: sorted[i].depth }));
    }
    // TASKS.csv #545 — dogleg severity (°/30 m), the check Micromine and most packages use, replacing separate
    // azimuth (>45°) and dip (>30°) jumps that ignored both inclination and interval length: a gyro-surveyed hole
    // at dip 89° whose azimuth swung 10 -> 200° over 30 m (a true bend of 2°) was flagged, while az 90 -> 120 / dip
    // 60 -> 45 over 3 m (a 23° bend, ~233°/30 m — a typo or a bad shot) was not. Same cos-dogleg formula as the
    // minimum-curvature desurvey (desurvey.js); inclination from vertical = 90 - |dip|.
    const rad = Math.PI / 180;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (!Number.isFinite(a.azimuth) || !Number.isFinite(b.azimuth) || !Number.isFinite(a.dip) || !Number.isFinite(b.dip)) continue;
      const dMD = b.depth - a.depth;
      if (!(dMD > 0)) continue;
      const I1 = (90 - Math.abs(a.dip)) * rad, I2 = (90 - Math.abs(b.dip)) * rad, dAz = (b.azimuth - a.azimuth) * rad;
      const cosDL = Math.min(1, Math.max(-1, Math.cos(I2 - I1) - Math.sin(I1) * Math.sin(I2) * (1 - Math.cos(dAz))));
      const dl = Math.acos(cosDL) / rad;
      // the rate over at least 10 m and only for a bend of >= 1°: stations a few cm or metres apart (repeat shots,
      // tie-in readings) turned instrument noise into 15-25°/30 m "errors" on the real 41597Z and Copley surveys
      const dls = (dl * 30) / Math.max(dMD, 10);
      if (dl >= 1 && dls > doglegWarn) {
        pushIssue(issues, dls > doglegError ? "error" : "warning", "Survey", holeId, tr("Dogleg {dl}° over {dMD} m between {depth} m and {depth2} m ({dls}°/30 m{v}, over {v2}°/30 m) — check for a typo or a bad shot, or a real deflection (wedge).", { dl: dl.toFixed(1), dMD: dMD.toFixed(1), depth: a.depth, depth2: b.depth, dls: dls.toFixed(1), v: dMD < 10 ? tr(", rated over 10 m") : "", v2: dls > doglegError ? doglegError : doglegWarn }));
      }
    }
  }
  if (collarOnly.length) { // #2335 — one note for every hole with a collar station only
    const d = collarOnly.map((h) => h.eoh), steep = collarOnly.filter((h) => h.steep).length;
    pushIssue(issues, "info", "Survey", null, tr("{n} hole(s), {v} of them vertical, have a survey station at the collar only ({d1}-{d2} m deep): each is drawn straight at that attitude. Their path below the collar is not measured; a downhole survey would show any deviation.", { n: collarOnly.length, v: steep, d1: Math.round(arrMin(d)), d2: Math.round(arrMax(d)) }));
  }
  { // TASKS.csv #2494 (review #2486) — holes whose survey method column says every station is assumed (planned, nominal, collar set-up)
    const sm = surveyMethodByHole(survey);
    if (sm?.assumed.length) pushIssue(issues, "info", "Survey", null, tr("{n} of {m} hole(s) have only assumed survey stations ({col}): their direction was not measured, so where they go below the collar is an assumption ({ids}).", { n: sm.assumed.length, m: sm.byHole.size, col: sm.key, ids: sm.assumed.slice(0, 6).join(", ") + (sm.assumed.length > 6 ? ", …" : "") }));
  }
  const noSurvey = collars.filter((c) => !byHole.has(c.hole_id));
  // TASKS.csv #339 — the straight-hole fallback has two silent failure modes (desurvey.js
  // stationsWithInclination): no collar azimuth/dip means the hole has NO trace at all (it and every
  // interval on it vanish from 3D, sections and modelling), and no length means it is drawn 300 m long.
  // #2014 (review #2013, Woodjam) — such a hole is now drawn as an ASSUMED vertical hole (desurvey.js holeAttitudeAssumed), so this
  // is a warning about an assumption, not an error about a hole that vanished; it was 534 errors on a 544-collar district compilation.
  // TASKS.csv #2169 — a collar imported with no elevation sits at an assumed one (collarElevation.js)
  const zHow = { terrain: () => tr("on the terrain"), median: () => tr("at the median collar elevation"), zero: () => tr("at 0 m") };
  collars.filter((c) => c.zAssumed).forEach((c) => pushIssue(issues, "warning", "Collars", c.hole_id, tr("No elevation in the collar file — placed {how} ({z} m), an ASSUMED elevation: everything on the hole sits at that height. Add the collar RL and re-import the collars.", { how: (zHow[c.zAssumed] || zHow.zero)(), z: Number.isFinite(c.z) ? Math.round(c.z) : "?" })));
  // TASKS.csv #3004 / #2896 — an elevation in the file that is probably a missing value (0 m on raised ground, or a stray far from every
  // other collar): recomputed here, so a project saved before the rule is checked too
  { const sus = suspectElevationIds(collars); if (sus.size) { const ok = collars.filter((c) => Number.isFinite(c.z) && !c.zAssumed && !sus.has(c.hole_id)).map((c) => c.z); const lo = arrMin(ok), hi = arrMax(ok);
    collars.filter((c) => sus.has(c.hole_id)).forEach((c) => pushIssue(issues, "warning", "Collars", c.hole_id, tr("Elevation {z} m in the collar file, far from the other collars ({lo}–{hi} m): probably a missing value. Everything on the hole sits at that height; check the collar RL and re-import the collars.", { z: Math.round(c.z), lo: Number.isFinite(lo) ? Math.round(lo) : "?", hi: Number.isFinite(hi) ? Math.round(hi) : "?" }))); } }
  const untraceable = noSurvey.filter((c) => !Number.isFinite(c.azimuth) || !Number.isFinite(c.dip));
  untraceable.forEach((c) => pushIssue(issues, "warning", "Survey", c.hole_id, tr("No survey rows and no collar azimuth/dip — drawn as an ASSUMED vertical hole (dashed in the 3D view), and every interval, assay and pick on it is placed on that assumption. Add the collar azimuth and dip, or a survey.")));
  const traceable = noSurvey.filter((c) => !untraceable.includes(c));
  noSurvey.filter((c) => !(Number.isFinite(c.length) && c.length > 0)).forEach((c) => pushIssue(issues, "warning", "Survey", c.hole_id, tr("No survey rows and no hole length — drawn as a straight hole of an ASSUMED 300 m. Add the end-of-hole depth to the collar file.")));
  if (traceable.length) {
    pushIssue(issues, "info", "Survey", null, tr("{traceable} hole(s) have no survey data — using the straight-hole fallback (collar azimuth/dip/length). Real deviation, if any, isn't captured for {v}.", { traceable: traceable.length, v: traceable.length === 1 ? tr("this hole") : tr("these holes") }));
  }
  // TASKS.csv #339 — dips are stored as degrees BELOW horizontal (import flips a negative-down file), so a
  // stored negative dip draws the hole upward. Right for an underground up-hole; for surface drilling it
  // almost always means the file's sign convention was picked wrongly on import.
  const collarById = new Map(collars.map((c) => [c.hole_id, c]));
  yield;
  const upward = new Set();
  byHole.forEach((stations, holeId) => { if (stations.some((s) => Number.isFinite(s.dip) && s.dip < 0)) upward.add(holeId); });
  traceable.forEach((c) => { if (c.dip < 0) upward.add(c.hole_id); });
  upward.forEach((holeId) => pushIssue(issues, "warning", "Survey", holeId, tr("Points upward (a dip above horizontal). Correct for an underground up-hole; for surface drilling, re-import the survey/collars with the other dip sign convention.")));
  // TASKS.csv #339 — a survey deeper than the collar's end-of-hole depth: one of the two is wrong.
  for (const [holeId, stations] of byHole) {
    if (++tick % HOLE_STEP === 0) yield;
    const c = collarById.get(holeId);
    const maxDepth = arrMax(stations.map((s) => s.depth).filter(Number.isFinite));
    if (c && Number.isFinite(c.length) && c.length > 0 && maxDepth > c.length + 0.5) {
      pushIssue(issues, "warning", "Survey", holeId, tr("Survey goes to {maxDepth} m but the collar's end-of-hole depth is {c} m — one of them is wrong.", { maxDepth, c: c.length }));
    }
  }
  return issues;
}

// ---- Interval layers (litho/alt/vein/geotech/litho_gc/alt_gc) ----
// TASKS.csv #600 — { gaps: false } for logs that are sparse by nature (veins, SG samples): on a real ARIS
// database the gap note fired 1,054 times for veins and 591 for SG — noise burying the real findings. Every
// other check (overlaps, from > to, past end of hole, no code) still runs on them.
// TASKS.csv #540 — what is wrong with the rows an import just committed, in one line for its notice (rows with a
// blank / non-numeric to, from > to, negative depths, past the end of the hole, or a hole with no collar). Import
// stays non-blocking; Data QC has the per-row list. O(rows); collars / survey give hole lengths.
// TASKS.csv #1531 / #1508 — the plausible value range of a numeric interval layer, for Data QC and for the import notice
export const PLAUSIBLE_RANGE = { geotech: { min: 0, max: 110 }, recovery: { min: 0, max: 110 }, sg: { min: 1, max: 6 } };
// range (#1508): { min, max } of a plausible value: an SG of -7.27 went in with only 'Loaded 1240 rows'; Data QC listed it, the notice did not
// TASKS.csv #2167 (WA review #2148, T19) — a hole's length for the past-the-end checks: the deeper of the collar's length and the deepest
// survey station (#339), ONLY for a hole that has a collar and a length above 0 m. The uranium run flagged 22,404 of 22,407 lithology rows
// 'past the end of their hole': its surveys were in before the collars, one station at 0 m each, and that 0 was taken as the hole's length.
// -> Map hole_id -> { length, source: "collar" | "survey" }
export function checkableHoleLengths(collars, survey) {
  const ids = new Set(), collarLen = new Map(), deepest = new Map();
  for (const c of collars || []) { ids.add(c.hole_id); if (Number.isFinite(c.length) && c.length > 0) collarLen.set(c.hole_id, c.length); }
  for (const s of survey || []) if (ids.has(s.hole_id) && Number.isFinite(s.depth) && s.depth > 0) deepest.set(s.hole_id, Math.max(s.depth, deepest.get(s.hole_id) ?? 0));
  const out = new Map();
  for (const id of ids) {
    const c = collarLen.get(id), d = deepest.get(id);
    if (c == null && d == null) continue;
    out.set(id, d != null && (c == null || d > c) ? { length: d, source: "survey" } : { length: c, source: "collar" });
  }
  return out;
}
export function importCheckSummary(rows, collars, survey, label = "rows", range = null) {
  const collarIds = new Set((collars || []).map((c) => c.hole_id));
  const len = checkableHoleLengths(collars, survey); // #2167
  let noTo = 0, swapped = 0, negative = 0, pastEoh = 0, pastBySurvey = 0, outside = 0, lo = Infinity, hi = -Infinity;
  const orphans = new Set(), unchecked = new Set();
  for (const r of rows || []) {
    if (collarIds.size && !collarIds.has(r.hole_id) && !isMarkedQcRow(r)) orphans.add(r.hole_id); // #1211 — a standard kept under its own name belongs to no hole
    if (range && typeof r.value === "number" && Number.isFinite(r.value) && (r.value < range.min || r.value > range.max)) { outside++; lo = Math.min(lo, r.value); hi = Math.max(hi, r.value); } // #1508
    if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) { noTo++; continue; }
    if (r.from > r.to) swapped++;
    if (r.from < 0 || r.to < 0) negative++;
    const L = len.get(r.hole_id);
    if (!L) { if (r.hole_id && !isMarkedQcRow(r)) unchecked.add(r.hole_id); continue; } // #2167 — no collar or no length: not checked, counted
    if (r.to > L.length + 0.5) { pastEoh++; if (L.source === "survey") pastBySurvey++; }
  }
  const parts = [];
  if (noTo) parts.push(tr("{noTo} with a blank or non-numeric from/to", { noTo }));
  if (swapped) parts.push(tr("{swapped} with from > to", { swapped }));
  if (negative) parts.push(tr("{negative} with a negative depth", { negative }));
  // #2167 — and where the hole's length came from
  if (pastEoh) parts.push(!pastBySurvey ? tr("{pastEoh} past the end of their hole (its length from the collar file)", { pastEoh })
    : pastBySurvey === pastEoh ? tr("{pastEoh} past the end of their hole (its length from the deepest survey station, deeper than the collar's)", { pastEoh })
    : tr("{pastEoh} past the end of their hole ({collar} by the collar's length, {survey} by the deepest survey station)", { pastEoh, collar: pastEoh - pastBySurvey, survey: pastBySurvey }));
  if (unchecked.size) parts.push(tr("{n} hole(s) not checked against a hole length (no collar yet, or neither a collar length nor a survey station below 0 m)", { n: unchecked.size }));
  if (outside) parts.push(tr("{n} with a value outside the plausible {min}–{max} ({range}: a keying or unit error?)", { n: outside, min: range.min, max: range.max, range: lo === hi ? String(lo) : `${lo} … ${hi}` })); // #1508
  if (orphans.size) {
    const ex = [...orphans].slice(0, 3).map((id) => { const m = /Did you mean "([^"]+)"/.exec(didYouMean(collarIds, id)); return m ? `${id} — collar ${m[1]} exists` : id; });
    parts.push(tr("{size} hole id(s) with no collar ({ex}{v})", { size: orphans.size, ex: ex.join("; "), v: orphans.size > 3 ? "; …" : "" }));
  }
  // TASKS.csv #1663 (review #1646, Kodiak) — with no collars at all every hole is an orphan, and nothing was said (6,239 assays and two logs
  // for 33 holes went in silently, drawn nowhere). Said once, as a count.
  let none = "";
  if (!collarIds.size) {
    const ids = new Set();
    for (const r of rows || []) if (r.hole_id && !isMarkedQcRow(r)) ids.add(r.hole_id);
    if (ids.size) none = tr("No collars are loaded, so these {label} for {n} hole(s) ({ex}{v}) cannot be drawn yet: they are kept, and appear once collars with those hole ids are imported.", { label, n: ids.size, ex: [...ids].slice(0, 3).join(", "), v: ids.size > 3 ? ", …" : "" });
  }
  const check = parts.length ? tr("Check these {label}: {parts}. They were imported as they are — Data QC lists each one.", { label, parts: parts.join(", ") }) : "";
  return [none, check].filter(Boolean).join(" ");
}

// TASKS.csv #1531 (review #1497, Lawyers) — range: { min, max } of a plausible value for the layer (RQD 0-110 %, recovery 0-110 %, SG
// 1-6): a value outside it is reported with its hole and depth. 20 RQD values up to 295 %, recoveries up to 20,000 % (138 m keyed as
// the recovery of a 1.5 m run) and an SG of -7.27 passed, then drove the numeric legends and classes.
function* validateIntervalLayerSteps(rows, layerLabel, collarIds, holeLengths, { gaps = true, range = null } = {}) { // #3136
  const issues = [];
  let tick = 0;
  const orphans = new Map(); // TASKS.csv #1663 — rows of holes with no collar, counted per hole
  let multiValued = 0; // #1532
  const byHole = new Map();
  for (const r of rows) {
    if (++tick % ROW_STEP === 0) yield;
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
    if (!collarIds.has(r.hole_id)) orphans.set(r.hole_id, (orphans.get(r.hole_id) || 0) + 1); // #1663 — once per hole, as #1275 did for survey
    if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) {
      pushIssue(issues, "error", layerLabel, r.hole_id, tr("Interval has a non-numeric from/to ({from}–{to}).", { from: r.from, to: r.to }));
    } else if (r.from > r.to) {
      pushIssue(issues, "error", layerLabel, r.hole_id, tr("Interval from ({from}) is greater than to ({to}) — swapped or mis-entered.", { from: r.from, to: r.to }));
    } else if (r.from === r.to) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, tr("Zero-length interval at {from}m.", { from: r.from }));
    }
    // TASKS.csv #285 (Micromine-specialist review) — survey rows have had a `depth < 0` ERROR check
    // since day one (see validateSurvey above), but interval and assay from/to depths never got the
    // same check, so a sign-flip (a technician typing -5 for 5, a spreadsheet formula carrying a stray
    // minus, a unit conversion gone wrong) passed "Run Data QC" completely clean and then desurveyed
    // to a physically impossible position above the collar. Deliberately a SEPARATE check rather than
    // another `else if` on the chain above: from=-5, to=-2 is perfectly self-consistent (from < to,
    // non-zero length), so it slips through every branch there and needs its own test.
    if (Number.isFinite(r.from) && Number.isFinite(r.to) && (r.from < 0 || r.to < 0)) {
      pushIssue(issues, "error", layerLabel, r.hole_id, tr("Interval has a negative depth ({from}–{to}m) — downhole depths are measured from the collar and can't be below zero. Usually a sign flip or a stray minus.", { from: r.from, to: r.to }));
    }
    const maxDepth = holeLengths.get(r.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(r.to) && r.to > maxDepth + 0.5) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, tr("Interval to={to}m extends past this hole's own recorded length/survey extent (~{maxDepth}m) — depth may be measured-depth vs true-vertical-depth confusion, or a mis-keyed hole ID.", { to: r.to, maxDepth: maxDepth.toFixed(0) }));
    }
    if (range && typeof r.value === "number" && Number.isFinite(r.value) && (r.value < range.min || r.value > range.max)) pushIssue(issues, "warning", layerLabel, r.hole_id, tr("Value {v} at {from}–{to}m is outside the plausible {min}–{max} range for {layer} — a keying or unit error?", { v: r.value, from: r.from, to: r.to, min: range.min, max: range.max, layer: layerLabel })); // #1531
    // #1395 — a 0 (0 % RQD, 0 % recovery) is a measurement, not a missing value: only blank, NaN or "Unknown" counts
    if (r.value == null || r.value === "" || (typeof r.value === "number" && !Number.isFinite(r.value)) || r.value === "Unknown") pushIssue(issues, "info", layerLabel, r.hole_id, tr("Interval at {v}–{v2}m has no code/value.", { v: Number.isFinite(r.from) ? r.from : "?", v2: Number.isFinite(r.to) ? r.to : "?" }));
  }
  for (const [holeId, intervals] of byHole) {
    if (++tick % HOLE_STEP === 0) yield;
    const sorted = [...intervals].filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to)).sort((a, b) => a.from - b.from);
    // Bug-hunt pass: only comparing each interval to its immediate predecessor (sorted by `from`)
    // missed an interval fully NESTED inside an earlier, longer one when it didn't overlap its own
    // immediate neighbor — e.g. 0-50, 10-20, 15-100 sorted by from is 0-50, 10-20, 15-100; 15-100
    // overlaps 10-20 (adjacent, caught) but 10-20 overlapping 0-50 (two back) needed its own check.
    // Track the running max `to` seen so far and which interval produced it, so any interval starting
    // before that running max — not just before its immediate neighbor — gets flagged.
    let maxEnd = -Infinity, maxEndOwner = null;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i > 0) {
        const prev = sorted[i - 1];
        // #1532 — the same run logged again with another value (several vein types, each with its own %, over one interval) is a
        // multi-valued log, not an overlap: counted once per layer below. 7,240 of Lawyers' 7,574 warnings were these.
        if (maxEndOwner && Math.abs(cur.from - maxEndOwner.from) < 0.01 && Math.abs(cur.to - maxEndOwner.to) < 0.01 && String(cur.value) !== String(maxEndOwner.value)) multiValued++;
        else if (cur.from < maxEnd - 0.01 && maxEndOwner) {
          pushIssue(issues, "warning", layerLabel, holeId, tr("Overlapping intervals: {from}–{to}m ({value}) and {from2}–{to2}m ({value2}).", { from: maxEndOwner.from, to: maxEndOwner.to, value: maxEndOwner.value, from2: cur.from, to2: cur.to, value2: cur.value }));
        } else if (cur.from > prev.to + 0.01 && cur.from >= maxEnd - 0.01) {
          const gap = cur.from - prev.to;
          if (gaps && gap > 1) pushIssue(issues, "info", layerLabel, holeId, tr("Gap of {gap}m between {to}m and {from}m (unlogged interval).", { gap: gap.toFixed(1), to: prev.to, from: cur.from }));
        }
      }
      if (cur.to > maxEnd) { maxEnd = cur.to; maxEndOwner = cur; }
    }
    // Exact duplicate intervals (same from/to/value) — almost always a double-import.
    const seen = new Set();
    sorted.forEach((r) => {
      const key = `${r.from}|${r.to}|${r.value}`;
      if (seen.has(key)) pushIssue(issues, "warning", layerLabel, holeId, tr("Duplicate interval {from}–{to}m ({value}) — likely imported twice.", { from: r.from, to: r.to, value: r.value }));
      seen.add(key);
    });
  }
  if (multiValued) pushIssue(issues, "info", layerLabel, null, tr("{n} interval(s) repeat another's exact from–to with a different value: a log that records several values per run (e.g. vein types). Not counted as overlaps.", { n: multiValued }));
  orphans.forEach((n, id) => pushIssue(issues, "error", layerLabel, id, n === 1 ? tr("Interval references hole \"{hole_id}\", which has no matching collar.{v}", { hole_id: id, v: didYouMean(collarIds, id) }) : tr("{n} intervals reference hole \"{hole_id}\", which has no matching collar.{v}", { n, hole_id: id, v: didYouMean(collarIds, id) })));
  return issues;
}

// ---- Point layers (mnlgy/magsusc) and structure ----
function validatePointLayer(rows, layerLabel, collarIds, holeLengths) {
  const issues = [];
  const orphans = new Map(); // TASKS.csv #1663 — rows of holes with no collar, counted per hole
  rows.forEach((r) => {
    if (!collarIds.has(r.hole_id)) orphans.set(r.hole_id, (orphans.get(r.hole_id) || 0) + 1); // #1663 — once per hole, as #1275 did for survey
    const depth = r.depth ?? r.from;
    if (!Number.isFinite(depth) || depth < 0) pushIssue(issues, "error", layerLabel, r.hole_id, tr("Point has an invalid depth ({depth}).", { depth }));
    const maxDepth = holeLengths.get(r.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(depth) && depth > maxDepth + 0.5) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, tr("Point at {depth}m extends past this hole's own recorded length/survey extent (~{maxDepth}m).", { depth, maxDepth: maxDepth.toFixed(0) }));
    }
  });
  orphans.forEach((n, id) => pushIssue(issues, "error", layerLabel, id, n === 1 ? tr("Point references hole \"{hole_id}\", which has no matching collar.{v}", { hole_id: id, v: didYouMean(collarIds, id) }) : tr("{n} points reference hole \"{hole_id}\", which has no matching collar.{v}", { n, hole_id: id, v: didYouMean(collarIds, id) })));
  return issues;
}

// ---- Assays (TASKS.csv #221 — this table was never checked at all: "Run data QC" scanned collars,
// survey, and every litho/alt/vein/geotech/point layer, but a project could have 35 QC errors across
// those AND zero assay-related issues reported, because nothing here ever looked at `assays`). Same
// shape of checks as validateIntervalLayer (hole existence, from/to sanity, overlaps, duplicates) plus
// per-element numeric sanity on `values`, since an assay row's payload (multiple element results) has
// no equivalent in the single-`value` interval layers above.
function* validateAssaysSteps(assays, collarIds, holeLengths) { // #3136
  const issues = [];
  let tick = 0;
  const orphans = new Map(); // TASKS.csv #1663 — rows of holes with no collar, counted per hole
  const byHole = new Map();
  // TASKS.csv #261 — over-range (">x") assays are lab placeholders awaiting a re-assay, not results.
  // parseAssayValue now preserves them AT the detection ceiling (it used to fabricate 1.5x the
  // ceiling), and the importer records the qualifier, so this is where the user finally gets told.
  const overRange = new Map(); // symbol -> count
  for (const a of assays) {
    if (++tick % ROW_STEP === 0) yield;
    const q = a.qualifiers;
    if (!q) continue;
    Object.keys(q).forEach((sym) => { if (q[sym] === ">") overRange.set(sym, (overRange.get(sym) || 0) + 1); });
  }
  overRange.forEach((count, sym) => {
    pushIssue(issues, "warning", "Assays", null, tr(count === 1 ? "{count} {sym} assay value is over-range (reported by the lab as \">x\"). It is a placeholder that needs a re-assay before any estimation — GeoStrix uses it at exactly the detection ceiling x, which understates the true grade, and no cap or estimate built on it is defensible." : "{count} {sym} assay values are over-range (reported by the lab as \">x\"). These are placeholders that need a re-assay before any estimation — GeoStrix uses them at exactly the detection ceiling x, which understates the true grade, and no cap or estimate built on them is defensible.", { count, sym }));
  });
  for (const a of assays) {
    if (++tick % ROW_STEP === 0) yield;
    if (isMarkedQcRow(a)) continue; // #601 — QC samples sit on a drill sample's interval or at a zero-length insertion point by design
    // TASKS.csv #1695 (review #1645, Copley) — a pXRF reading on core is a zero-length point beside the lab intervals by design: 556
    // 'zero-length' and 551 'overlapping' warnings were all pXRF. They keep the per-row checks but are not intervals to overlap.
    const pxrf = a.source === "pXRF";
    if (!pxrf) { if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []); byHole.get(a.hole_id).push(a); }
    if (!collarIds.has(a.hole_id)) orphans.set(a.hole_id, (orphans.get(a.hole_id) || 0) + 1); // #1663 — once per hole, as #1275 did for survey
    if (!Number.isFinite(a.from) || !Number.isFinite(a.to)) {
      pushIssue(issues, "error", "Assays", a.hole_id, tr("Assay interval has a non-numeric from/to ({from}–{to}).", { from: a.from, to: a.to }));
    } else if (a.from > a.to) {
      pushIssue(issues, "error", "Assays", a.hole_id, tr("Assay interval from ({from}) is greater than to ({to}) — swapped or mis-entered.", { from: a.from, to: a.to }));
    } else if (a.from === a.to && !pxrf) {
      pushIssue(issues, "warning", "Assays", a.hole_id, tr("Zero-length assay interval at {from}m.", { from: a.from }));
    }
    // TASKS.csv #285 — same negative-depth check as validateIntervalLayer above (and as survey depths
    // have always had); see that comment for why it can't be folded into the else-if chain.
    if (Number.isFinite(a.from) && Number.isFinite(a.to) && (a.from < 0 || a.to < 0)) {
      pushIssue(issues, "error", "Assays", a.hole_id, tr("Assay interval has a negative depth ({from}–{to}m) — downhole depths are measured from the collar and can't be below zero. Usually a sign flip or a stray minus.", { from: a.from, to: a.to }));
    }
    const maxDepth = holeLengths.get(a.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(a.to) && a.to > maxDepth + 0.5) {
      pushIssue(issues, "warning", "Assays", a.hole_id, tr("Assay interval to={to}m extends past this hole's own recorded length/survey extent (~{maxDepth}m).", { to: a.to, maxDepth: maxDepth.toFixed(0) }));
    }
    const values = a.values || {};
    const symbols = Object.keys(values);
    if (!symbols.length) {
      pushIssue(issues, "info", "Assays", a.hole_id, tr("Assay interval at {v}–{v2}m has no element results.", { v: Number.isFinite(a.from) ? a.from : "?", v2: Number.isFinite(a.to) ? a.to : "?" }));
    } else {
      symbols.forEach((sym) => {
        const v = values[sym];
        if (v != null && !Number.isFinite(v)) pushIssue(issues, "warning", "Assays", a.hole_id, tr("{sym} value \"{v}\" at {from}–{to}m is not numeric.", { sym, v, from: a.from, to: a.to }));
        else if (Number.isFinite(v) && v < 0) pushIssue(issues, "warning", "Assays", a.hole_id, tr("{sym} value {v} at {from}–{to}m is negative — assay results shouldn't be below zero.", { sym, v, from: a.from, to: a.to }));
      });
    }
  }
  { const px = assays.filter((a) => a.source === "pXRF" && !isMarkedQcRow(a)).length; if (px) pushIssue(issues, "info", "Assays", tr("all holes"), tr("{n} pXRF reading(s) are screening points on core, not assay intervals: the zero-length and overlap checks leave them out.", { n: px })); } // #1695
  for (const [holeId, intervals] of byHole) {
    if (++tick % HOLE_STEP === 0) yield;
    const sorted = [...intervals].filter((a) => Number.isFinite(a.from) && Number.isFinite(a.to)).sort((a, b) => a.from - b.from);
    let maxEnd = -Infinity, maxEndOwner = null;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      // TASKS.csv #2897 — the same interval twice is said once, by the duplicate rule below (it was 'Overlapping' AND 'Duplicate')
      if (i > 0 && cur.from < maxEnd - 0.01 && maxEndOwner && !(cur.from === maxEndOwner.from && cur.to === maxEndOwner.to)) {
        pushIssue(issues, "warning", "Assays", holeId, tr("Overlapping assay intervals: {from}–{to}m and {from2}–{to2}m.", { from: maxEndOwner.from, to: maxEndOwner.to, from2: cur.from, to2: cur.to }));
      }
      if (cur.to > maxEnd) { maxEnd = cur.to; maxEndOwner = cur; }
    }
    // TASKS.csv #2897 (review #2876, WA iron) — 100 field duplicates (RCB... beside RCA..., different results, once each in the source) were
    // all 'likely imported twice': two samples with different ids are a duplicate pair, worded so
    const seen = new Map();
    sorted.forEach((a) => {
      const key = `${a.from}|${a.to}`, first = seen.get(key);
      if (first) {
        const ida = String(first.sample_id ?? "").trim(), idb = String(a.sample_id ?? "").trim();
        if (ida && idb && ida !== idb) pushIssue(issues, "warning", "Assays", holeId, tr("Two samples at {from}–{to}m ({a}, {b}): a field or lab duplicate pair, not a double import. Both count in the statistics unless one is marked as a QAQC duplicate.", { from: a.from, to: a.to, a: ida, b: idb }));
        else pushIssue(issues, "warning", "Assays", holeId, tr("Duplicate assay interval {from}–{to}m — likely imported twice.", { from: a.from, to: a.to }));
      } else seen.set(key, a);
    });
  }
  orphans.forEach((n, id) => pushIssue(issues, "error", "Assays", id, n === 1 ? tr("Assay interval references hole \"{hole_id}\", which has no matching collar.{v}", { hole_id: id, v: didYouMean(collarIds, id) }) : tr("{n} assay intervals reference hole \"{hole_id}\", which has no matching collar.{v}", { n, hole_id: id, v: didYouMean(collarIds, id) })));
  return issues;
}

// ---- Project-level ----
function validateProject(project) {
  const issues = [];
  if (!project?.epsg) pushIssue(issues, "warning", "Project", null, tr("No EPSG/CRS set for this project — collars/survey/rasters are assumed to already share one consistent CRS, but nothing here confirms it."));
  return issues;
}

// ---- Boundaries/claims (TASKS.csv #125) ----
// QGIS-specialist audit finding: "#82's QC is excellent for collars/survey/intervals, but there's
// nothing for general vector layers ... no dangling-vertex, self-intersection, or overlap checks for
// boundaries/claims, which QGIS's Topology Checker plugin covers routinely for claim/tenure work."
// Distinct concern from every check above — this is 2D polygon topology, not drillhole geometry.

// Two segments (p1->p2, p3->p4) intersect — standard orientation/cross-product test, excluding the
// shared-endpoint case (adjacent edges in the same ring always "touch" at their common vertex, which
// isn't a topology error).
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

// Checks one ring for zero-length (duplicate consecutive vertex) edges and self-intersection (any two
// non-adjacent edges crossing — a real "bowtie" shape, which usually means a hand-digitized or
// exported claim boundary has its vertices out of order rather than a genuinely self-crossing
// property line). O(n²) edge-pair comparisons — fine at the tens-to-low-hundreds of vertices a real
// claim/boundary .ply or .dxf actually has.
function checkRingTopology(pts, label, boundaryName, issues) {
  const n = pts.length;
  if (n < 3) return;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) {
      pushIssue(issues, "warning", label, boundaryName, tr("Two consecutive vertices are at (near) the same point (~{x}, {y}) — a zero-length edge.", { x: a.x.toFixed(1), y: a.y.toFixed(1) }));
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip edges that share a vertex (adjacent, including the ring's own closing edge) — those
      // always "touch", which isn't a self-intersection.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) {
        pushIssue(issues, "error", label, boundaryName, tr("Self-intersecting boundary — edge {v} crosses edge {v2}. This will render as a bowtie/twisted shape and its area calculation will be wrong.", { v: i + 1, v2: j + 1 }));
        return; // one reported crossing is enough to flag the ring as bad — avoids a wall of redundant messages for a badly-ordered vertex list
      }
    }
  }
}

function validateBoundaryTopology(boundaries) {
  const issues = [];
  boundaries.forEach((b) => {
    const label = b.kind === "claim" ? "Claims" : "Boundaries";
    (b.polylines || []).forEach((pts, partIdx) => {
      if (pts.length < 3) return;
      const closed = pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y;
      const ring = closed ? pts.slice(0, -1) : pts; // checkRingTopology already treats the ring as implicitly closed
      checkRingTopology(ring, label, `${b.name}${b.polylines.length > 1 ? ` (part ${partIdx + 1})` : ""}`, issues);
    });
  });
  // Pairwise overlap check between different boundaries — a heuristic (any vertex of one lies inside
  // the other), not a full polygon-clip intersection: catches the common real cases (one boundary
  // wholly or mostly inside another, e.g. an accidentally-reimported duplicate, or two claims that
  // genuinely overlap) without needing a full computational-geometry library, same "practical
  // approximation over exact geometry" tradeoff this app already makes elsewhere (e.g. reprojectGrid's
  // corner-bbox reprojection). Won't catch two polygons that cross without either's vertices landing
  // inside the other (a rare, thin-sliver overlap) — an accepted first-pass limitation.
  for (let i = 0; i < boundaries.length; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      const a = boundaries[i], b = boundaries[j];
      const aInB = (a.polylines || []).some((pts) => pts.some((p) => pointInBoundary(p.x, p.y, b.polylines)));
      const bInA = !aInB && (b.polylines || []).some((pts) => pts.some((p) => pointInBoundary(p.x, p.y, a.polylines)));
      if (aInB || bInA) {
        pushIssue(issues, "warning", "Boundaries", null, tr("\"{name}\" and \"{name2}\" appear to overlap — check whether this is intentional (e.g. a renewed claim) or a duplicate import.", { name: a.name, name2: b.name }));
      }
    }
  }
  return issues;
}

// Runs every check and returns { issues: [...], summary: {error,warning,info}, byCategory: Map }.
// `layers` is the store's full layers object ({litho:[],alt:[],...}); `holeLengths` (hole_id -> max
// known depth) is derived once here from survey (max station depth) falling back to collar.length,
// then reused across every interval/point layer check rather than recomputed per-layer.
// TASKS.csv #558 — collar elevation vs the loaded terrain / DEM. Handheld-GPS Z (±10-30 m), ellipsoidal heights and
// feet entered as metres are among the commonest errors in junior-company data, and they shift every intercept
// elevation and section. Only collars inside the DEM's footprint with a finite Z are compared.
export function collarTerrainOffsets(collars, terrain) {
  if (!terrain?.bbox || !terrain.elevations?.length) return [];
  const [x0, y0, x1, y1] = terrain.bbox;
  const out = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) continue;
    if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const dem = terrainGroundAt(terrain, c.x, c.y);
    if (!Number.isFinite(dem)) continue;
    out.push({ hole_id: c.hole_id, z: c.z, dem, dz: c.z - dem });
  }
  return out.sort((a, b) => Math.abs(b.dz) - Math.abs(a.dz));
}
function validateCollarsVsTerrain(collars, terrain, threshold) {
  const issues = [];
  const offs = collarTerrainOffsets(collars, terrain);
  if (!offs.length) return issues;
  const abs = offs.map((o) => Math.abs(o.dz)).sort((a, b) => a - b);
  const med = abs[Math.floor(abs.length / 2)];
  const off = offs.filter((o) => Math.abs(o.dz) > threshold);
  const grid = terrain.source?.nodeM ? ` The terrain's nodes are ~${Math.round(terrain.source.nodeM)} m apart, so on steep ground a correct collar can differ from it by tens of metres.` : ""; // #726
  pushIssue(issues, "info", "Collar vs terrain", null, tr("{offs} collar(s) compared with the terrain \"{v}\": median difference {med} m, {off} over {threshold} m.{grid}{v2}", { offs: offs.length, v: terrain.name || "DEM", med: med.toFixed(1), off: off.length, threshold, grid, v2: off.length && off.every((o) => Math.sign(o.dz) === Math.sign(off[0].dz)) && off.length >= 3 ? tr(" All {off} are {v} the ground — a datum or unit problem (ellipsoidal vs orthometric height, feet vs metres) rather than GPS scatter?", { off: off.length, v: off[0].dz > 0 ? "above" : "below" }) : "" }));
  off.forEach((o) => pushIssue(issues, "warning", "Collar vs terrain", o.hole_id, tr("Collar elevation {z} m is {v} m {v2} the terrain ({dem} m) — a GPS / datum / units error, or a DEM that is too coarse here. Every intercept elevation on this hole moves with it.", { z: o.z.toFixed(1), v: Math.abs(o.dz).toFixed(1), v2: o.dz > 0 ? "above" : "below", dem: o.dem.toFixed(1) })));
  return issues;
}

// TASKS.csv #3136 (the rest of #3099, WA iron) — the check ran in one 1.1-2.4 s main-thread block: validateAssays (~0.9 s), the survey
// checks (~0.8 s) and the litho interval checks (~0.3 s) were most of it. The three are generators that pause every ROW_STEP rows and
// every HOLE_STEP holes; runDataQC drains them at once (the same result, synchronously), and runDataQCSliced runs them a slice at a time.
const ROW_STEP = 4000, HOLE_STEP = 250;
const drain = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
// the interval layers checked, in order: [layer key, label, options]
const INTERVAL_CHECKS = [
  ["litho", "Lithology"],
  ["alt", "Alteration"],
  ["vein", "Vein", { gaps: false }],
  ["breccia", "Breccia", { gaps: false }], // #608
  ["weath", "Weathering", { gaps: false }], // #2162: logged over the profile only
  ["structzone", "Structural zones", { gaps: false }], // #604: zones are logged where they occur
  ["geotech", "Geotech", { range: PLAUSIBLE_RANGE.geotech }], // range: #1531
  ["recovery", "Recovery %", { range: PLAUSIBLE_RANGE.recovery }],
  ["sg", "Specific gravity", { gaps: false, range: PLAUSIBLE_RANGE.sg }],
  ["litho_gc", "Litho (geochem-derived)"],
  ["alt_gc", "Alteration (geochem-derived)"],
];

// TASKS.csv #3211 — the custom layers Data QC checks as intervals: most rows have a From and a To; a binned log and a modelled layer are left out
export function customIntervalLayers(customLayers) {
  return (customLayers || []).filter((l) => {
    const rows = l?.rows || [];
    if (!rows.length || l.binM !== undefined || rows[0]?.modelled) return false;
    let iv = 0; const n = Math.min(rows.length, 200);
    for (let i = 0; i < n; i++) if (Number.isFinite(rows[i]?.from) && Number.isFinite(rows[i]?.to)) iv++;
    return iv * 2 > n;
  });
}

export function* runDataQCSteps({ project, collars, survey, layers, boundaries, assays, terrain = null, terrainThreshold = 15, doglegWarn = 3, doglegError = 10, customLayers = [] }) { // customLayers: #2493
  const collarIds = new Set(collars.map((c) => c.hole_id));
  // TASKS.csv #339 — end of hole = the DEEPER of the collar length and the last survey station. Letting the
  // survey win outright flagged every interval below the last shot (surveys usually stop short of EOH) as
  // "past the end of the hole". A survey deeper than the collar length is its own warning (Survey).
  // #2167 — only for a hole with a collar and a length above 0 m (checkableHoleLengths)
  const holeLengths = new Map([...checkableHoleLengths(collars, survey)].map(([id, l]) => [id, l.length]));

  const step = (k) => ({ step: k, of: 5 }); // #3136 — the progress the sliced run reports: collars, survey, logs, assays, the rest
  const parts = [];
  parts.push(validateProject(project), validateCollars(collars, survey), validateCollarsVsTerrain(collars, terrain, terrainThreshold)); yield step(1);
  parts.push(yield* validateSurveyAndTrajectorySteps(collars, survey, { doglegWarn, doglegError })); yield step(2); // #545
  for (const [k, label, opt] of INTERVAL_CHECKS) { parts.push(yield* validateIntervalLayerSteps(layers[k] || [], label, collarIds, holeLengths, opt)); }
  // TASKS.csv #3211 (#3195, Galore Creek) — the custom interval layers get the same checks (holes, from / to, reversed, overlaps, past the end of
  // the hole); not a binned log (its bins are the import's) nor a modelled layer (made by the app)
  for (const l of customIntervalLayers(customLayers)) parts.push(yield* validateIntervalLayerSteps(l.rows, tr("Custom layer: {name}", { name: l.name }), collarIds, holeLengths, { gaps: false }));
  yield step(3);
  parts.push(yield* validateAssaysSteps(assays || [], collarIds, holeLengths)); yield step(4);
  const tail1 = [
    ...validatePointLayer(layers.mnlgy || [], "Mineralization", collarIds, holeLengths),
    ...validatePointLayer(layers.magsusc || [], "Mag. susceptibility", collarIds, holeLengths),
    ...validatePointLayer(layers.structure || [], "Structure", collarIds, holeLengths),
    ...validateBoundaryTopology(boundaries || []),
  ];
  yield;
  const tail2 = [
    // #1109 — calculator picks solved with a hole direction the survey no longer gives
    ...staleCalculatorPicks(collars, survey, layers.structure).map(({ pick, angle, now }) => ({ severity: "warning", category: tr("Core orientation calculator"), holeId: pick.hole_id,
      message: tr("The structure pick at {depth} m was calibrated with the hole at azimuth {az0}°, dip {dip0}°; the survey now gives {az1}°, {dip1}° ({angle}° apart), so its dip / dip direction is stale: re-enter it in the core orientation calculator.", { depth: Number(pick.depth).toFixed(1), az0: pick.hole_az_used.toFixed(1), dip0: pick.hole_dip_used.toFixed(1), az1: now.azimuth.toFixed(1), dip1: now.dip.toFixed(1), angle: angle.toFixed(1) }) })),
  ];
  yield;
  const tail3 = [
    // TASKS.csv #2493 — holes missing from a layer most holes have, logs ending short of the hole, rows the imports left out (infos)
    ...coverageInfos({ collars, layers, assays: assays || [], lengths: checkableHoleLengths(collars, survey), project, customLayers }).map((i) => ({ severity: "info", ...i })),
  ];
  const issues = [...parts.flat(), ...tail1, ...tail2, ...tail3];

  const summary = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { summary[i.severity] = (summary[i.severity] || 0) + 1; });
  const byCategory = new Map();
  issues.forEach((i) => {
    if (!byCategory.has(i.category)) byCategory.set(i.category, []);
    byCategory.get(i.category).push(i);
  });
  return { issues, summary, byCategory };
}

// the whole check at once (what it always was)
export function runDataQC(args) { return drain(runDataQCSteps(args)); }
// TASKS.csv #3136 — the same check a slice at a time (sliceMs of work, then the window paints and takes input), so the dialog stays
// responsive; onProgress({ step, of }) after each stage; cancelled() -> true stops it (the promise then resolves null).
export function runDataQCSliced(args, { sliceMs = 12, onProgress = null, cancelled = () => false } = {}) {
  const g = runDataQCSteps(args);
  return new Promise((resolve, reject) => {
    const slice = () => {
      if (cancelled()) { resolve(null); return; }
      try {
        const end = performance.now() + sliceMs;
        let r;
        do { r = g.next(); if (r.value && !r.done) onProgress?.(r.value); } while (!r.done && performance.now() < end);
        if (r.done) resolve(r.value); else setTimeout(slice, 0);
      } catch (e) { reject(e); }
    };
    setTimeout(slice, 0);
  });
}

export { clampSeverityIcon as severityIcon };

// TASKS.csv #1111 (review #1016, drillhole-database admin) — the issue list as table rows, the database validation record a QP
// or the database manager asks for; it existed only on screen until the dialog closed. Errors first, then warnings, then
// information, each in the order found.
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
export function qcIssueRows(issues) {
  return (issues || []).map((i, n) => ({ i, n })).sort((a, b) => (SEVERITY_ORDER[a.i.severity] ?? 3) - (SEVERITY_ORDER[b.i.severity] ?? 3) || a.n - b.n)
    .map(({ i }) => ({ severity: i.severity, category: i.category, hole_id: i.holeId || "", message: i.message }));
}

// TASKS.csv #1109 (review #1016, structural geologist) — calculator picks (#429: they carry beta_scribed and the hole
// attitude the calibration was solved with, hole_az_used / hole_dip_used) are never re-derived when the survey or collar
// changes, though the solved pole depends on the hole direction: a +14.8 deg azimuth change (a survey re-imported as
// magnetic) moved the calibrated pole a median 5.7 deg, max 87 deg in the review's test. These are the picks whose hole
// now points more than tolDeg away from the direction they were solved with. -> [{ pick, angle, now: { azimuth, dip } }]
const dirOf = (az, dip) => { const a = (az * Math.PI) / 180, d = (dip * Math.PI) / 180; return [Math.sin(a) * Math.cos(d), Math.cos(a) * Math.cos(d), -Math.sin(d)]; };
export function staleCalculatorPicks(collars, survey, structure, tolDeg = 0.5) {
  const collarBy = new Map((collars || []).map((c) => [c.hole_id, c]));
  const surveyBy = new Map();
  for (const s of survey || []) { const l = surveyBy.get(s.hole_id); if (l) l.push(s); else surveyBy.set(s.hole_id, [s]); }
  const out = [];
  for (const p of structure || []) {
    if (!Number.isFinite(p.hole_az_used) || !Number.isFinite(p.hole_dip_used) || !Number.isFinite(Number(p.depth))) continue;
    const c = collarBy.get(p.hole_id);
    if (!c) continue;
    const now = surveyAzimuthDipAt(c, surveyBy.get(p.hole_id) || [], Number(p.depth));
    if (!now || !Number.isFinite(now.azimuth) || !Number.isFinite(now.dip)) continue;
    const a = dirOf(p.hole_az_used, p.hole_dip_used), b = dirOf(now.azimuth, now.dip);
    const angle = (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
    if (angle > tolDeg) out.push({ pick: p, angle, now });
  }
  return out;
}
