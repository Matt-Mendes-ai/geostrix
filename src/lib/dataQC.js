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
import { arrMax } from "./arrayStats.js";
import { isMarkedQcRow } from "./qaqc.js"; // TASKS.csv #601
import { terrainGroundAt } from "./viewer/geomath.js"; // TASKS.csv #558; #927 — never compared with the fill

import { didYouMean } from "./holeIds.js"; // TASKS.csv #541 (own module: dataQC stays out of the startup bundle)
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
export { didYouMean };

const clampSeverityIcon = { error: "🔴", warning: "🟡", info: "🔵" };

function pushIssue(issues, severity, category, holeId, message) {
  issues.push({ severity, category, holeId: holeId || null, message });
}

// ---- Collars ----
function validateCollars(collars) {
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
  seenCoords.forEach((ids, key) => {
    const unique = Array.from(new Set(ids));
    if (unique.length > 1) pushIssue(issues, "warning", "Collars", null, tr("{unique} holes ({unique2}) share essentially the same collar location (within 1m) — check for a duplicate import or a coordinate entry error.", { unique: unique.length, unique2: unique.join(", ") }));
  });
  return issues;
}

// ---- Survey / trajectory ----
function validateSurveyAndTrajectory(collars, survey, { doglegWarn = 3, doglegError = 10 } = {}) {
  const issues = [];
  const collarIds = new Set(collars.map((c) => c.hole_id));
  const byHole = new Map();
  survey.forEach((s) => {
    if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []);
    byHole.get(s.hole_id).push(s);
  });
  survey.forEach((s) => {
    if (!collarIds.has(s.hole_id)) pushIssue(issues, "error", "Survey", s.hole_id, tr("Survey row references hole \"{hole_id}\", which has no matching collar — this hole cannot be desurveyed and won't render.{v}", { hole_id: s.hole_id, v: didYouMean(collarIds, s.hole_id) }));
    if (!Number.isFinite(s.depth) || s.depth < 0) pushIssue(issues, "error", "Survey", s.hole_id, tr("Survey station has an invalid depth ({depth}).", { depth: s.depth }));
    if (Number.isFinite(s.azimuth) && (s.azimuth < 0 || s.azimuth >= 360)) pushIssue(issues, "warning", "Survey", s.hole_id, tr("Survey azimuth {azimuth}° is outside 0–360° @ {depth}m.", { azimuth: s.azimuth, depth: s.depth }));
    if (Number.isFinite(s.dip) && (s.dip < -90 || s.dip > 90)) pushIssue(issues, "warning", "Survey", s.hole_id, tr("Survey dip {dip}° is outside -90–90° @ {depth}m.", { dip: s.dip, depth: s.depth }));
  });
  const lengthOf = new Map(collars.map((c) => [c.hole_id, Number(c.length)]));
  byHole.forEach((stations, holeId) => {
    const sorted = [...stations].sort((a, b) => a.depth - b.depth);
    // TASKS.csv #714 — a survey that stops well above the end of the hole: desurvey carries the last attitude on to
    // EOH (#338), and the trace, sections, exports and estimation samples below it all use that guess with no flag
    // (Woodjam WJ23-105: stations at 0 and 50 m for a 111 m hole). Warned when the gap is over 30 m, or over 15 m and 20 %
    // of a short hole. The review's 'over 30 m AND 20 %' missed DH23-109: 56.5 m of guessed path is only 13 % of 438.5 m.
    const eoh = lengthOf.get(holeId), last = sorted.length ? sorted[sorted.length - 1].depth : NaN;
    const gap = eoh - last;
    if (Number.isFinite(eoh) && Number.isFinite(last) && (gap > 30 || (gap > 15 && gap > 0.2 * eoh))) {
      pushIssue(issues, "warning", "Survey", holeId, tr("The survey ends at {v} m, {v2} m above the end of the hole ({v3} m, {v4}%): the trace below is carried on with the last attitude, a guess — the hole's real path down there is unknown.", { v: +last.toFixed(1), v2: +(eoh - last).toFixed(1), v3: +eoh.toFixed(1), v4: Math.round((100 * (eoh - last)) / eoh) }));
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
  });
  const noSurvey = collars.filter((c) => !byHole.has(c.hole_id));
  // TASKS.csv #339 — the straight-hole fallback has two silent failure modes (desurvey.js
  // stationsWithInclination): no collar azimuth/dip means the hole has NO trace at all (it and every
  // interval on it vanish from 3D, sections and modelling), and no length means it is drawn 300 m long.
  const untraceable = noSurvey.filter((c) => !Number.isFinite(c.azimuth) || !Number.isFinite(c.dip));
  untraceable.forEach((c) => pushIssue(issues, "error", "Survey", c.hole_id, tr("No survey rows and no collar azimuth/dip — this hole cannot be traced, so it and every interval, assay and pick on it are missing from the 3D view, sections and models.")));
  const traceable = noSurvey.filter((c) => !untraceable.includes(c));
  traceable.filter((c) => !(Number.isFinite(c.length) && c.length > 0)).forEach((c) => pushIssue(issues, "warning", "Survey", c.hole_id, tr("No survey rows and no hole length — drawn as a straight hole of an ASSUMED 300 m. Add the end-of-hole depth to the collar file.")));
  if (traceable.length) {
    pushIssue(issues, "info", "Survey", null, tr("{traceable} hole(s) have no survey data — using the straight-hole fallback (collar azimuth/dip/length). Real deviation, if any, isn't captured for {v}.", { traceable: traceable.length, v: traceable.length === 1 ? tr("this hole") : tr("these holes") }));
  }
  // TASKS.csv #339 — dips are stored as degrees BELOW horizontal (import flips a negative-down file), so a
  // stored negative dip draws the hole upward. Right for an underground up-hole; for surface drilling it
  // almost always means the file's sign convention was picked wrongly on import.
  const collarById = new Map(collars.map((c) => [c.hole_id, c]));
  const upward = new Set();
  byHole.forEach((stations, holeId) => { if (stations.some((s) => Number.isFinite(s.dip) && s.dip < 0)) upward.add(holeId); });
  traceable.forEach((c) => { if (c.dip < 0) upward.add(c.hole_id); });
  upward.forEach((holeId) => pushIssue(issues, "warning", "Survey", holeId, tr("Points upward (a dip above horizontal). Correct for an underground up-hole; for surface drilling, re-import the survey/collars with the other dip sign convention.")));
  // TASKS.csv #339 — a survey deeper than the collar's end-of-hole depth: one of the two is wrong.
  byHole.forEach((stations, holeId) => {
    const c = collarById.get(holeId);
    const maxDepth = arrMax(stations.map((s) => s.depth).filter(Number.isFinite));
    if (c && Number.isFinite(c.length) && c.length > 0 && maxDepth > c.length + 0.5) {
      pushIssue(issues, "warning", "Survey", holeId, tr("Survey goes to {maxDepth} m but the collar's end-of-hole depth is {c} m — one of them is wrong.", { maxDepth, c: c.length }));
    }
  });
  return issues;
}

// ---- Interval layers (litho/alt/vein/geotech/litho_gc/alt_gc) ----
// TASKS.csv #600 — { gaps: false } for logs that are sparse by nature (veins, SG samples): on a real ARIS
// database the gap note fired 1,054 times for veins and 591 for SG — noise burying the real findings. Every
// other check (overlaps, from > to, past end of hole, no code) still runs on them.
// TASKS.csv #540 — what is wrong with the rows an import just committed, in one line for its notice (rows with a
// blank / non-numeric to, from > to, negative depths, past the end of the hole, or a hole with no collar). Import
// stays non-blocking; Data QC has the per-row list. O(rows); collars / survey give hole lengths.
export function importCheckSummary(rows, collars, survey, label = "rows") {
  const collarIds = new Set((collars || []).map((c) => c.hole_id));
  const len = new Map();
  (collars || []).forEach((c) => { if (Number.isFinite(c.length)) len.set(c.hole_id, c.length); });
  (survey || []).forEach((s) => { if (Number.isFinite(s.depth)) len.set(s.hole_id, Math.max(s.depth, len.get(s.hole_id) ?? -Infinity)); });
  let noTo = 0, swapped = 0, negative = 0, pastEoh = 0;
  const orphans = new Set();
  for (const r of rows || []) {
    if (collarIds.size && !collarIds.has(r.hole_id)) orphans.add(r.hole_id);
    if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) { noTo++; continue; }
    if (r.from > r.to) swapped++;
    if (r.from < 0 || r.to < 0) negative++;
    const L = len.get(r.hole_id);
    if (Number.isFinite(L) && r.to > L + 0.5) pastEoh++;
  }
  const parts = [];
  if (noTo) parts.push(tr("{noTo} with a blank or non-numeric from/to", { noTo }));
  if (swapped) parts.push(tr("{swapped} with from > to", { swapped }));
  if (negative) parts.push(tr("{negative} with a negative depth", { negative }));
  if (pastEoh) parts.push(tr("{pastEoh} past the end of their hole", { pastEoh }));
  if (orphans.size) {
    const ex = [...orphans].slice(0, 3).map((id) => { const m = /Did you mean "([^"]+)"/.exec(didYouMean(collarIds, id)); return m ? `${id} — collar ${m[1]} exists` : id; });
    parts.push(tr("{size} hole id(s) with no collar ({ex}{v})", { size: orphans.size, ex: ex.join("; "), v: orphans.size > 3 ? "; …" : "" }));
  }
  return parts.length ? tr("Check these {label}: {parts}. They were imported as they are — Data QC lists each one.", { label, parts: parts.join(", ") }) : "";
}

function validateIntervalLayer(rows, layerLabel, collarIds, holeLengths, { gaps = true } = {}) {
  const issues = [];
  const byHole = new Map();
  rows.forEach((r) => {
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
    if (!collarIds.has(r.hole_id)) pushIssue(issues, "error", layerLabel, r.hole_id, tr("Interval references hole \"{hole_id}\", which has no matching collar.{v}", { hole_id: r.hole_id, v: didYouMean(collarIds, r.hole_id) }));
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
    if (!r.value || r.value === "Unknown") pushIssue(issues, "info", layerLabel, r.hole_id, tr("Interval at {v}–{v2}m has no code/value.", { v: Number.isFinite(r.from) ? r.from : "?", v2: Number.isFinite(r.to) ? r.to : "?" }));
  });
  byHole.forEach((intervals, holeId) => {
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
        if (cur.from < maxEnd - 0.01 && maxEndOwner) {
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
  });
  return issues;
}

// ---- Point layers (mnlgy/magsusc) and structure ----
function validatePointLayer(rows, layerLabel, collarIds, holeLengths) {
  const issues = [];
  rows.forEach((r) => {
    if (!collarIds.has(r.hole_id)) pushIssue(issues, "error", layerLabel, r.hole_id, tr("Point references hole \"{hole_id}\", which has no matching collar.{v}", { hole_id: r.hole_id, v: didYouMean(collarIds, r.hole_id) }));
    const depth = r.depth ?? r.from;
    if (!Number.isFinite(depth) || depth < 0) pushIssue(issues, "error", layerLabel, r.hole_id, tr("Point has an invalid depth ({depth}).", { depth }));
    const maxDepth = holeLengths.get(r.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(depth) && depth > maxDepth + 0.5) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, tr("Point at {depth}m extends past this hole's own recorded length/survey extent (~{maxDepth}m).", { depth, maxDepth: maxDepth.toFixed(0) }));
    }
  });
  return issues;
}

// ---- Assays (TASKS.csv #221 — this table was never checked at all: "Run data QC" scanned collars,
// survey, and every litho/alt/vein/geotech/point layer, but a project could have 35 QC errors across
// those AND zero assay-related issues reported, because nothing here ever looked at `assays`). Same
// shape of checks as validateIntervalLayer (hole existence, from/to sanity, overlaps, duplicates) plus
// per-element numeric sanity on `values`, since an assay row's payload (multiple element results) has
// no equivalent in the single-`value` interval layers above.
function validateAssays(assays, collarIds, holeLengths) {
  const issues = [];
  const byHole = new Map();
  // TASKS.csv #261 — over-range (">x") assays are lab placeholders awaiting a re-assay, not results.
  // parseAssayValue now preserves them AT the detection ceiling (it used to fabricate 1.5x the
  // ceiling), and the importer records the qualifier, so this is where the user finally gets told.
  const overRange = new Map(); // symbol -> count
  assays.forEach((a) => {
    const q = a.qualifiers;
    if (!q) return;
    Object.keys(q).forEach((sym) => { if (q[sym] === ">") overRange.set(sym, (overRange.get(sym) || 0) + 1); });
  });
  overRange.forEach((count, sym) => {
    pushIssue(issues, "warning", "Assays", null, tr(count === 1 ? "{count} {sym} assay value is over-range (reported by the lab as \">x\"). It is a placeholder that needs a re-assay before any estimation — GeoStrix uses it at exactly the detection ceiling x, which understates the true grade, and no cap or estimate built on it is defensible." : "{count} {sym} assay values are over-range (reported by the lab as \">x\"). These are placeholders that need a re-assay before any estimation — GeoStrix uses them at exactly the detection ceiling x, which understates the true grade, and no cap or estimate built on them is defensible.", { count, sym }));
  });
  assays.forEach((a) => {
    if (isMarkedQcRow(a)) return; // #601 — QC samples sit on a drill sample's interval or at a zero-length insertion point by design
    if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []);
    byHole.get(a.hole_id).push(a);
    if (!collarIds.has(a.hole_id)) pushIssue(issues, "error", "Assays", a.hole_id, tr("Assay interval references hole \"{hole_id}\", which has no matching collar.{v}", { hole_id: a.hole_id, v: didYouMean(collarIds, a.hole_id) }));
    if (!Number.isFinite(a.from) || !Number.isFinite(a.to)) {
      pushIssue(issues, "error", "Assays", a.hole_id, tr("Assay interval has a non-numeric from/to ({from}–{to}).", { from: a.from, to: a.to }));
    } else if (a.from > a.to) {
      pushIssue(issues, "error", "Assays", a.hole_id, tr("Assay interval from ({from}) is greater than to ({to}) — swapped or mis-entered.", { from: a.from, to: a.to }));
    } else if (a.from === a.to) {
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
  });
  byHole.forEach((intervals, holeId) => {
    const sorted = [...intervals].filter((a) => Number.isFinite(a.from) && Number.isFinite(a.to)).sort((a, b) => a.from - b.from);
    let maxEnd = -Infinity, maxEndOwner = null;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i > 0 && cur.from < maxEnd - 0.01 && maxEndOwner) {
        pushIssue(issues, "warning", "Assays", holeId, tr("Overlapping assay intervals: {from}–{to}m and {from2}–{to2}m.", { from: maxEndOwner.from, to: maxEndOwner.to, from2: cur.from, to2: cur.to }));
      }
      if (cur.to > maxEnd) { maxEnd = cur.to; maxEndOwner = cur; }
    }
    const seen = new Set();
    sorted.forEach((a) => {
      const key = `${a.from}|${a.to}`;
      if (seen.has(key)) pushIssue(issues, "warning", "Assays", holeId, tr("Duplicate assay interval {from}–{to}m — likely imported twice.", { from: a.from, to: a.to }));
      seen.add(key);
    });
  });
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

export function runDataQC({ project, collars, survey, layers, boundaries, assays, terrain = null, terrainThreshold = 15, doglegWarn = 3, doglegError = 10 }) {
  const collarIds = new Set(collars.map((c) => c.hole_id));
  const holeLengths = new Map();
  collars.forEach((c) => { if (Number.isFinite(c.length)) holeLengths.set(c.hole_id, c.length); });
  const surveyMaxByHole = new Map();
  survey.forEach((s) => {
    if (!Number.isFinite(s.depth)) return;
    const cur = surveyMaxByHole.get(s.hole_id);
    if (cur === undefined || s.depth > cur) surveyMaxByHole.set(s.hole_id, s.depth);
  });
  // TASKS.csv #339 — end of hole = the DEEPER of the collar length and the last survey station. Letting the
  // survey win outright flagged every interval below the last shot (surveys usually stop short of EOH) as
  // "past the end of the hole". A survey deeper than the collar length is its own warning (Survey).
  surveyMaxByHole.forEach((maxDepth, id) => holeLengths.set(id, Math.max(maxDepth, holeLengths.has(id) ? holeLengths.get(id) : -Infinity)));

  const issues = [
    ...validateProject(project),
    ...validateCollars(collars),
    ...validateCollarsVsTerrain(collars, terrain, terrainThreshold), // #558
    ...validateSurveyAndTrajectory(collars, survey, { doglegWarn, doglegError }), // #545
    ...validateIntervalLayer(layers.litho || [], "Lithology", collarIds, holeLengths),
    ...validateIntervalLayer(layers.alt || [], "Alteration", collarIds, holeLengths),
    ...validateIntervalLayer(layers.vein || [], "Vein", collarIds, holeLengths, { gaps: false }),
    ...validateIntervalLayer(layers.breccia || [], "Breccia", collarIds, holeLengths, { gaps: false }), // #608
    ...validateIntervalLayer(layers.structzone || [], "Structural zones", collarIds, holeLengths, { gaps: false }), // #604: zones are logged where they occur
    ...validateIntervalLayer(layers.geotech || [], "Geotech", collarIds, holeLengths),
    ...validateIntervalLayer(layers.recovery || [], "Recovery %", collarIds, holeLengths),
    ...validateIntervalLayer(layers.sg || [], "Specific gravity", collarIds, holeLengths, { gaps: false }),
    ...validateIntervalLayer(layers.litho_gc || [], "Litho (geochem-derived)", collarIds, holeLengths),
    ...validateIntervalLayer(layers.alt_gc || [], "Alteration (geochem-derived)", collarIds, holeLengths),
    ...validateAssays(assays || [], collarIds, holeLengths),
    ...validatePointLayer(layers.mnlgy || [], "Mineralization", collarIds, holeLengths),
    ...validatePointLayer(layers.magsusc || [], "Mag. susceptibility", collarIds, holeLengths),
    ...validatePointLayer(layers.structure || [], "Structure", collarIds, holeLengths),
    ...validateBoundaryTopology(boundaries || []),
  ];

  const summary = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { summary[i.severity] = (summary[i.severity] || 0) + 1; });
  const byCategory = new Map();
  issues.forEach((i) => {
    if (!byCategory.has(i.category)) byCategory.set(i.category, []);
    byCategory.get(i.category).push(i);
  });
  return { issues, summary, byCategory };
}

export { clampSeverityIcon as severityIcon };
