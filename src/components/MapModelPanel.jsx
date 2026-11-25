// TASKS.csv #817 — "Model from map": a 3D stratigraphic model from the geological map and the outcrop measurements alone
// (no drillholes). Matt: "tool should suggest strat order and let the user adjust it". The order is suggested by
// lib/pileOrder.js (bedding younging across each contact + each contact's own dip fitted from its trace on the terrain,
// faulted contacts left out) and shown WITH its evidence; the geologist reorders units, changes roles, sets each fault's
// dip, then runs the ordinary GemPy stack (modellingRuns.runMapModel).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { deepestUnitIntercept } from "../lib/holeMapContacts.js"; // TASKS.csv #2568
import { contactOrientationNear } from "../lib/sheetFromContacts.js"; // TASKS.csv #2642
import { fitSheetToLogs } from "../lib/sheetLogCheck.js"; // TASKS.csv #2724
import { featureCategoryValue, extractMapContacts } from "../lib/mapLayers.js"; // TASKS.csv #2724; extractMapContacts: #2959
import { mapGroundCount, contactsInArea } from "../lib/mapGroundCount.js"; // TASKS.csv #2959; contactsInArea: #2973
import { useStore } from "../lib/store.jsx"; // TASKS.csv #2724 — the collars and survey the logged intercepts are placed on
import { ChevronUp, ChevronDown } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import StepPane from "./StepPane.jsx"; // TASKS.csv #4070 — the pane as steps
import MoreFold from "./MoreFold.jsx";
import { suggestPileOrder, mapRoleFromLog } from "../lib/pileOrder.js"; // mapRoleFromLog: #3369
import { roleWithCodes } from "../lib/collarSubcrop.js"; // TASKS.csv #3369 — the logs' role of a code (Modelling codes first)
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { loggedCodes, suggestCodeUnits, holeContacts, MAX_GAP_M, contactsAgainstOrder } from "../lib/holeMapContacts.js"; // TASKS.csv #1718; contactsAgainstOrder: #2408
import { plainLith } from "../lib/lithText.js"; // TASKS.csv #3936: a Macrostrat unit name's lithology block in words (shown; the run keeps the value)
import { unitAges, ageOrder, sameAgeBreaks, faciesGroups } from "../lib/mapAgeOrder.js"; // TASKS.csv #4001 — the map's own ages as the order
import { cutMapOrder, mergeUnits } from "../lib/mapOrderCut.js"; // TASKS.csv #3936 — the order cut down to GemPy's limit, offered
import { GEMPY_MAX_SURFACES, GEMPY_MAX_FAULTS } from "../lib/gempyLimits.js"; // TASKS.csv #3936; faults: #3985
import { faultType, faultMajor, dipDefault, lineLength, pickFaults, joinPieces } from "../lib/faultPick.js"; // TASKS.csv #3985
import { useMcpMapModel } from "./useMcpMapModel.js"; // TASKS.csv #4053
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

const ROLES = ["stratigraphic", "intrusion", "cross-cutting", "other"];
const roleLabel = (r) => ({ stratigraphic: tr("stratigraphic"), intrusion: tr("intrusion"), "cross-cutting": tr("cross-cutting"), other: tr("other (left out)") }[r] || r);
const fieldsOf = (l) => l?.fields || Object.keys(l?.features?.[0]?.attributes || {});

export default function MapModelPanel({ mapLayers, surfaceStructures, terrain, busy, onRun, onBuildBodies, pBtn, smallSel, holeCount = 0, lithoRows = null }) { // holeCount: #1718 // onBuildBodies: #821
  const polys = (mapLayers || []).filter((l) => l.geomType === "polygon");
  const lines = (mapLayers || []).filter((l) => l.geomType === "line" || l.geomType === "polyline"); // the importer names them "polyline"
  const [layerId, setLayerId] = useState("");
  // TASKS.csv #3369 — the default map is a mapped layer that is shown, not the subcrop's nearest-hole outlines (the review's pane opened on them
  // even when they were hidden and an imported map existed)
  const derivedMap = (l) => !!(l?.subcropOutlines || l?.subcropFromCollars);
  const layer = polys.find((l) => l.id === layerId) || polys.find((l) => !derivedMap(l) && l.visible !== false) || polys.find((l) => !derivedMap(l)) || polys.find((l) => l.visible !== false) || polys[0] || null;
  const nearestHole = !!layer?.subcropOutlines; // #3369
  const [field, setField] = useState("");
  const unitField = fieldsOf(layer).includes(field) ? field : (layer?.styleField || fieldsOf(layer)[0] || "");
  const [descField, setDescField] = useState("");
  const descGuess = fieldsOf(layer).find((f) => f !== unitField && /lith|desc|name|unit/i.test(f)) || "";
  const desc = fieldsOf(layer).includes(descField) ? descField : descGuess;
  // measurements: classes present in the imported structure sets
  const allRows = useMemo(() => (surfaceStructures || []).flatMap((s) => s.rows || []), [surfaceStructures]);
  const classCounts = useMemo(() => { const m = new Map(); allRows.forEach((r) => m.set(r.cls, (m.get(r.cls) || 0) + 1)); return [...m]; }, [allRows]);
  const [classes, setClasses] = useState(["bedding"]);
  const bedding = useMemo(() => allRows.filter((r) => classes.includes(r.cls)).map((r) => ({ x: r.x, y: r.y, dip: r.dip, dipDir: r.dipDir })), [allRows, classes]);
  // faults: features of a line layer whose attributes mention a fault
  const [faultLayerId, setFaultLayerId] = useState("");
  const faultLayer = lines.find((l) => l.id === faultLayerId) || null;
  const faultFeatures = useMemo(() => (faultLayer?.features || []).filter((f) => Object.values(f.attributes || {}).some((v) => /fault|thrust|shear/i.test(String(v)))), [faultLayer]);
  const measuredFaults = useMemo(() => allRows.filter((r) => r.cls === "fault"), [allRows]);
  const [faultSet, setFaultSet] = useState({}); // index -> { dip, dipDir, on }
  const faults = useMemo(() => faultFeatures.map((f, i) => {
    const line = f.parts?.[0] || f.geometry;
    const a = line[0], b = line[line.length - 1];
    const strike = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
    const perp = [((strike + 90) % 360 + 360) % 360, ((strike - 90) % 360 + 360) % 360];
    // the nearest measured fault within 500 m of the trace, if any, suggests the dip and the side
    let near = null, best = 500;
    for (const m of measuredFaults) for (const q of line) { const d = Math.hypot(m.x - q[0], m.y - q[1]); if (d < best) { best = d; near = m; } }
    const angle = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
    const side = near ? (angle(near.dipDir, perp[0]) <= angle(near.dipDir, perp[1]) ? 0 : 1) : 0;
    const s = faultSet[i] || {};
    const name = String(Object.values(f.attributes || {}).find((v) => /fault|thrust|shear/i.test(String(v))) || tr("Fault")) + ` ${i + 1}`;
    const type = faultType(f); // TASKS.csv #3985 — its type, length and a dip default from the type (thrust 30, normal 60), said to be a default
    return { i, name, line, perp, on: s.on ?? true, dip: s.dip ?? (near ? near.dip : dipDefault(type)), dipDir: s.dipDir ?? perp[side], measured: !!near, type, major: faultMajor(f), lengthM: lineLength(line), dipIsDefault: s.dip == null && !near };
  }), [faultFeatures, measuredFaults, faultSet]);
  const setFault = (i, patch) => setFaultSet((p) => ({ ...p, [i]: { ...(p[i] || {}), ...patch } }));

  // the suggestion (recomputed when the inputs change), then the user's order and roles
  const groundAt = useMemo(() => {
    if (!terrain?.bbox) return null;
    return (x, y) => terrainGroundAt(terrain, x, y); // TASKS.csv #927
  }, [terrain]);
  // TASKS.csv #3369 — on the nearest-hole outlines: no order votes from their borders, and each code starts on the role the logs give it
  const { modellingCodes: mcodes } = useStore();
  const logRoleOf = useMemo(() => { if (!nearestHole) return null; const r = roleWithCodes(mcodes); return (u) => mapRoleFromLog(r(u)); }, [nearestHole, mcodes]);
  // TASKS.csv #3391 — on the outlines the units ARE the logged codes: their contacts down the holes (shallower = younger) give the order
  const loggedContacts = useMemo(() => (nearestHole && lithoRows?.length ? holeContacts(lithoRows, Object.fromEntries(loggedCodes(lithoRows).map((c) => [c.code, String(c.code)]))).contacts : null), [nearestHole, lithoRows]);
  // TASKS.csv #3936 — a cut of the order taken from the offer (below the order): the merged units under their merged name (a copy of the layer, for the
  // suggestion and the run) and the units set aside as 'other (left out)'
  const [cut, setCut] = useState(null); // { merge: { unit: merged name }, out: [unit] }
  useEffect(() => { setCut(null); }, [layer?.id, unitField]);
  const effLayer = useMemo(() => (cut ? mergeUnits(layer, unitField, cut.merge) : layer), [layer, unitField, cut]);
  const bedSuggestion = useMemo(() => {
    if (!effLayer || !unitField) return null;
    try { return suggestPileOrder({ layer: effLayer, field: unitField, descField: desc || null, bedding, faults: faults.filter((f) => f.on).map((f) => f.line), groundAt, nearestHole, roleOf: logRoleOf, loggedContacts }); } catch { return null; }
  }, [effLayer, unitField, desc, bedding, faults, groundAt, nearestHole, logRoleOf, loggedContacts]);
  // TASKS.csv #4001 — the map's own ages (age fields or the labels' age codes) give the order when most units carry one: bedding younging ran
  // almost upside down on a folded map (fit 10 %, by age 44 %). The bedding order stays one click away; not on the nearest-hole outlines.
  const ages = useMemo(() => (!nearestHole && effLayer && unitField ? unitAges(effLayer, unitField, bedSuggestion?.order || []) : null), [nearestHole, effLayer, unitField, bedSuggestion]);
  const ageSug = useMemo(() => (bedSuggestion && ages ? ageOrder(bedSuggestion.order, ages) : null), [bedSuggestion, ages]);
  const [orderFrom, setOrderFrom] = useState("age");
  const byAge = ageSug?.use && orderFrom === "age";
  const suggestion = useMemo(() => (bedSuggestion && byAge ? { ...bedSuggestion, order: ageSug.order } : bedSuggestion), [bedSuggestion, byAge, ageSug]);
  const [order, setOrder] = useState([]);
  const [roles, setRoles] = useState({});
  // TASKS.csv #2408 — an order set by hand is kept when the suggestion is recomputed (unticking an orientation class put Basement back on top
  // without a word): the hand order keeps its units in its own sequence, drops units the suggestion no longer has and adds new ones at the end
  const [orderByHand, setOrderByHand] = useState(false);
  useEffect(() => {
    if (!suggestion) return;
    if (!orderByHand) { const out = new Set(cut?.out || []); setOrder(suggestion.order.filter((u) => !out.has(u))); setRoles(out.size ? { ...suggestion.roles, ...Object.fromEntries([...out].filter((u) => u in suggestion.roles).map((u) => [u, "other"])) } : suggestion.roles); return; } // cut: #3936
    setOrder((p) => [...p.filter((u) => suggestion.order.includes(u)), ...suggestion.order.filter((u) => !p.includes(u))]);
  }, [suggestion]); // orderByHand is read, not a trigger
  const move = (i, d) => { setOrderByHand(true); setOrder((p) => { const q = p.slice(); const j = i + d; if (j < 0 || j >= q.length) return p; [q[i], q[j]] = [q[j], q[i]]; return q; }); };
  const setRole = (u, r) => {
    setOrderByHand(true);
    setRoles((p) => ({ ...p, [u]: r }));
    setOrder((p) => (r === "stratigraphic" ? (p.includes(u) ? p : [...p, u]) : p.filter((x) => x !== u)));
  };
  const [relation, setRelation] = useState("onlap");
  const [fullDetail, setFullDetail] = useState(false); // TASKS.csv #3162 follow-up — skip the work budget for one run (#3198)
  const [showWhy, setShowWhy] = useState(false);
  const [fit, setFit] = useState(null); // TASKS.csv #3989 — the last run's fit against this map, and its 'where it differs' overlay
  const [showDiff, setShowDiff] = useState(false);
  useEffect(() => { if (busy) { setFit(null); setShowDiff(false); } }, [busy]); // a new run: the card waits for its own fit
  const unitInfo = new Map((suggestion?.units || []).map((u) => [u.unit, u]));
  const leftOut = Object.keys(roles).filter((u) => roles[u] !== "stratigraphic");
  // TASKS.csv #821 — the units in the "intrusion" role, as closed bodies (outline to a depth, vertical or dipping walls)
  const intrusive = Object.keys(roles).filter((u) => roles[u] === "intrusion");
  const [bodyOff, setBodyOff] = useState({}); // unit -> true when unticked
  const [bodyDepth, setBodyDepth] = useState("");
  const [bodyMsg, setBodyMsg] = useState(null); // #2569 // TASKS.csv #2568 — blank until set or taken from the logs (it was a default 500 m)
  const [bodyDip, setBodyDip] = useState(90);
  const [bodyFlare, setBodyFlare] = useState("out");
  const bodyUnits = intrusive.filter((u) => !bodyOff[u]);
  // TASKS.csv #2642 — a sheet (dyke / sill): both walls dip one way, at a dip and dip direction typed or taken from the contact readings
  const [bodyShape, setBodyShape] = useState("plug");
  const [sheetDip, setSheetDip] = useState("");
  const [sheetDipDir, setSheetDipDir] = useState("");
  const contactOffer = useMemo(() => (bodyShape === "sheet" ? contactOrientationNear(allRows, layer, unitField, bodyUnits) : null), [bodyShape, allRows, layer, unitField, bodyUnits.join("\u0001")]);
  // TASKS.csv #2724 — the dip and dip direction fitted to the unit's logged intercepts (strike from the map outline), offered on a click
  const { collars: storeCollars, survey: storeSurvey, desurveyMethod } = useStore();
  const [sheetFit, setSheetFit] = useState(null); // { text, warn }
  useEffect(() => { setSheetFit(null); }, [bodyShape, bodyUnits.join("\u0001"), layer, unitField]);
  const fitUnit = bodyShape === "sheet" && bodyUnits.length === 1 ? bodyUnits[0] : null;
  const fitToLogs = () => {
    const polygons = (layer?.features || []).filter((f) => String(featureCategoryValue(f, unitField)) === String(fitUnit)).map((f) => f.parts || []);
    const r = fitSheetToLogs({ polygons, groundAt, unit: fitUnit, litho: lithoRows, codeUnit, collars: storeCollars, survey: storeSurvey, desurveyMethod });
    if (!r) { setSheetFit({ warn: true, text: tr("No logged interval of {unit}: nothing to fit.", { unit: fitUnit }) }); return; }
    if (r.reason === "no-trace") { setSheetFit({ warn: true, text: tr("{unit} has no map outline to take the strike from.", { unit: fitUnit }) }); return; }
    if (r.reason === "too-few") { setSheetFit({ warn: true, text: tr("None of the {n} logged intercept(s) of {unit} is below the ground beside its map trace on a surveyed hole: nothing to fit.", { n: r.intercepts, unit: fitUnit }) }); return; }
    if (r.reason === "flat") { setSheetFit({ warn: true, text: tr("The logs fit a dip of {dip}° toward {dir}°: under 10°, a sill rather than a sheet, so the boxes were not filled.", { dip: r.dip, dir: r.dipDir }) }); return; }
    setSheetDip(String(r.dip)); setSheetDipDir(String(r.dipDir));
    const th = r.thickness.min.toFixed(1) === r.thickness.max.toFixed(1) /* as shown: a float spread under 0.05 m is one value */ ? tr("their true thickness across it is {a} m", { a: r.thickness.median.toFixed(1) }) : tr("their true thickness across it is {a}–{b} m (median {m} m)", { a: r.thickness.min.toFixed(1), b: r.thickness.max.toFixed(1), m: r.thickness.median.toFixed(1) });
    setSheetFit({ warn: r.holes < 3, text: tr("Fitted to {n} logged intercept(s) in {h} hole(s): {dip}° toward {dir}°, {rms} m RMS off the plane; {th}. Strike is the outline's long axis; the plane passes through its trace.", { n: r.used, h: r.holes, dip: r.dip, dir: r.dipDir, rms: r.rmsM.toFixed(1), th }) + (r.holes < 3 ? " " + tr("From fewer than three holes: a guide, not a fit.") : "") });
  };
  const sheetOk = bodyShape !== "sheet" || (Number(sheetDip) >= 10 && Number(sheetDip) <= 90 && sheetDipDir !== "" && Number(sheetDipDir) >= 0 && Number(sheetDipDir) < 360);
  const why = (u) => {
    const i = unitInfo.get(u);
    if (!i) return "";
    if (byAge && ages?.[u]) return tr("map age: {age}", { age: ages[u].text }); // #4001
    if (i.evidence === "bedding" && i.overOthers && i.underOthers) return tr("between its neighbours"); // TASKS.csv #1311
    if (i.evidence === "bedding") return i.score > 0.15 ? tr("younger than its neighbours") : i.score < -0.15 ? tr("older than its neighbours") : tr("weak evidence");
    if (i.evidence === "logged") return i.score > 0.15 ? tr("younger than its neighbours in the logs") : i.score < -0.15 ? tr("older than its neighbours in the logs") : tr("weak evidence"); // TASKS.csv #3391
    if (i.evidence === "elevation") return tr("by elevation only");
    return tr("no evidence (by area)");
  };
  const planes = useMemo(() => (suggestion?.pairs || []).flatMap((p) => (p.fittedPlanes || []).map((q) => ({ x: q.x, y: q.y, dip: q.dip, dipDir: q.dipDir, younger: p.younger, older: p.older }))), [suggestion]); // younger, older: #1309
  const [breaks, setBreaks] = useState([]); // TASKS.csv #1309 — units with an unconformity below them
  const hasBreaks = breaks.some((b) => order.slice(0, -1).includes(b));
  // TASKS.csv #4001 — Erosional with same-age neighbours (facies of one formation): one package each, or their shared contacts make GemPy singular
  const runBreaks = !hasBreaks && relation === "erode" && ages ? sameAgeBreaks(order, ages) || breaks : breaks;
  // Erosional only: their contacts are lateral, not tops; under the default relation they are useful evidence (fit 43 % with them, 31 % without)
  const runFacies = relation === "erode" && ages ? faciesGroups(order, ages) : null;
  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 };
  const sel = { ...smallSel, flex: 1, minWidth: 0 };

  // TASKS.csv #1718 — the drillholes' logged contacts beside the map's: each logged code a map unit (exact matches suggested), every
  // change downhole between two units of the order a contact for the same top as on the map (lib/holeMapContacts.js)
  const codes = useMemo(() => loggedCodes(lithoRows), [lithoRows]);
  const loggedHoles = useMemo(() => new Set((lithoRows || []).map((r) => r.hole_id)).size, [lithoRows]); // TASKS.csv #2086 — the holes with a log, not every collar
  const mapUnits = useMemo(() => (suggestion?.units || []).map((u) => u.unit), [suggestion]);
  // TASKS.csv #1604 (review #1497, Lawyers) — the orientations the run will have, counted as the run counts them (on the terrain, with a
  // dip and a dip direction): with none, Build was offered and the run then refused ('No orientations on the terrain')
  const orientCount = useMemo(() => {
    if (!groundAt) return null;
    const ok = (m) => [m.dip, m.dipDir].every(Number.isFinite) && Number.isFinite(groundAt(m.x, m.y));
    return { beds: bedding.filter(ok).length, planes: planes.filter(ok).length };
  }, [bedding, planes, groundAt]);
  // TASKS.csv #2959 (WA iron review) — the run's contact points and measurements with terrain under them, said before the run (the review's run
  // found out after it that 265 of 357 sat on the map layer's flat elevation)
  const groundCount = useMemo(() => {
    if (!groundAt || !layer || !unitField || order.length < 2) return null;
    try { return mapGroundCount({ contacts: extractMapContacts(layer, unitField).contacts, order, groundAt, measurements: [...bedding, ...planes] }); } catch { return null; }
  }, [groundAt, layer, unitField, order, bedding, planes]);
  const [codeEdit, setCodeEdit] = useState({});
  const codeUnit = useMemo(() => ({ ...suggestCodeUnits(codes.map((c) => c.code), mapUnits), ...codeEdit }), [codes, mapUnits, codeEdit]);
  const [useHolesChoice, setUseHoles] = useState(null);
  const useHoles = useHolesChoice ?? Object.values(codeUnit).some(Boolean); // on when a code matches a unit
  // #2568 — the deepest logged intercept of an intrusive unit (its codes as mapped above), offered as the body's depth
  const deepestLogged = useMemo(() => deepestUnitIntercept(lithoRows, codeUnit, bodyUnits), [lithoRows, codeUnit, bodyUnits]);
  const holePreview = useMemo(() => (useHoles && lithoRows?.length ? holeContacts(lithoRows, codeUnit, (u) => order.includes(u)) : null), [useHoles, lithoRows, codeUnit, order]);
  // TASKS.csv #2409 — no outcrop orientation but logged contacts in use: the run fits one per top from its contact points
  const outcropNone = orientCount && orientCount.beds + orientCount.planes === 0;
  const holeFit = outcropNone && (holePreview?.contacts?.length || 0) >= 3;
  const noOrient = outcropNone && !holeFit;
  // TASKS.csv #2973 (WA iron review) — the count was field-wide (9,013 contacts in 4,935 holes for a 2 km map on a 21 km field): how many
  // are in holes collared inside the map layer's area is said beside it
  // TASKS.csv #3936 — over GemPy's limit: the cut offered before the run, each choice with its reason (lib/mapOrderCut.js)
  const plan = useMemo(() => (!cut && !nearestHole && suggestion && order.length > GEMPY_MAX_SURFACES
    ? cutMapOrder({ layer: effLayer, field: unitField, ageField: fieldsOf(layer).find((f) => /^age$/i.test(f)) || null, order, units: suggestion.units, pairs: suggestion.pairs, collars: storeCollars, max: GEMPY_MAX_SURFACES })
    : null), [cut, nearestHole, suggestion, order, effLayer, unitField, layer, storeCollars]);
  const roleListRef = useRef(null);
  // TASKS.csv #3985 — more faults ticked than GemPy takes: the pick offered (lib/faultPick.js), each with its reason; taking it unticks the rest and
  // merges a fault's collinear pieces into one trace for the run; Undo puts the ticks back
  const [faultPick, setFaultPick] = useState(null); // { keep, before, merged: [[i, ...]], undo: the ticks before }
  useEffect(() => { setFaultPick(null); }, [faultLayer?.id]);
  const faultPlan = useMemo(() => { const on = faults.filter((f) => f.on); return !faultPick && on.length > GEMPY_MAX_FAULTS ? pickFaults({ faults: on, layer, field: unitField, collars: storeCollars }) : null; }, [faults, faultPick, layer, unitField, storeCollars]);
  const reasonOf = (e) => [e.insideM > 0 ? tr("{d} inside the model area", { d: fmtLen(e.insideM) }) : tr("outside the model area"), tr("offsets {n} unit pair(s)", { n: e.offset }), e.major > 0 ? tr("mapped as major") : e.major < 0 ? tr("mapped as minor") : null, e.pieces > 1 ? tr("{n} pieces merged", { n: e.pieces }) : null].filter(Boolean).join(", ");
  const [faultWhy, setFaultWhy] = useState({}); // fault index -> the pick's reason (kept or left out)
  const takeFaults = () => {
    if (!faultPlan) return;
    const undo = faultSet, next = { ...faultSet }, why = {};
    for (const e of faultPlan.keep) for (const i of e.ids) { next[i] = { ...(next[i] || {}), on: true }; why[i] = reasonOf(e); }
    for (const e of faultPlan.drop) for (const i of e.ids) { next[i] = { ...(next[i] || {}), on: false }; why[i] = tr("left out: {why}", { why: reasonOf(e) }); }
    setFaultSet(next); setFaultWhy(why);
    setFaultPick({ keep: faultPlan.keep.length, before: faultPlan.before, merged: faultPlan.keep.filter((e) => e.ids.length > 1).map((e) => e.ids), undo });
  };
  const undoFaults = () => { if (faultPick) setFaultSet(faultPick.undo); setFaultPick(null); setFaultWhy({}); };
  // the faults the run gets: a merged fault's pieces as one trace (in order along its strike), named after its first piece
  const runFaults = useMemo(() => {
    const on = faults.filter((f) => f.on), byI = new Map(on.map((f) => [f.i, f])), done = new Set(), out = [];
    for (const ids of faultPick?.merged || []) { const fs = ids.map((i) => byI.get(i)).filter(Boolean); if (fs.length < 2) continue; fs.forEach((f) => done.add(f.i)); out.push({ name: fs[0].name, line: joinPieces(fs.map((f) => f.line)), dip: fs[0].dip, dipDir: fs[0].dipDir }); }
    for (const f of on) if (!done.has(f.i)) out.push({ name: f.name, line: f.line, dip: f.dip, dipDir: f.dipDir });
    return out;
  }, [faults, faultPick]);
  const takeCut = (thenEdit) => {
    if (!plan) return;
    const out = new Set(plan.leftOut.map((x) => x.unit));
    setOrderByHand(false); setCut({ merge: plan.merge, out: [...out] });
    setOrder((p) => p.filter((u) => !out.has(u))); setRoles((r) => ({ ...r, ...Object.fromEntries([...out].map((u) => [u, "other"])) }));
    if (thenEdit) setTimeout(() => roleListRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const inArea = useMemo(() => (holePreview?.contacts?.length && layer?.bbox ? contactsInArea(holePreview.contacts, storeCollars, layer.bbox) : null), [holePreview, storeCollars, layer]);
  const orderCheck = useMemo(() => (holePreview?.contacts?.length ? contactsAgainstOrder(holePreview.contacts, order) : null), [holePreview, order]); // #2408
  // TASKS.csv #1718 (review #1645, Copley) — on a drilled prospect, say that the holes are not used here and where they are
  const holesNote = holeCount > 0 ? <div className="ge-holes-note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>{loggedHoles > 0 /* TASKS.csv #2053 (review #2013): 'the 544 drillhole(s) are not used' while #1718 matches the logged holes to map units */
    ? tr("Once a geological map is loaded, the {n} drillhole(s) with a lithology log (of {m}) can be matched to its units here. Explicit surface's \"From the geological map\" section also fits map contacts to hole picks.", { n: loggedHoles, m: holeCount })
    : tr("None of the {m} drillhole(s) has a lithology log, so this tool builds from the map and the outcrop measurements only.", { m: holeCount })}</div> : null;
  // TASKS.csv #4053 — the pane's own words for what stops a run, said in the pane and (the same strings) to an AI app's model_from_map (components/useMcpMapModel.js)
  const noMapMsg = allRows.length ? tr("Import a geological map with a unit attribute, or draw its units (Unit polygons), in the Geological Mapping tab first: {n} outcrop measurement(s) are already loaded.", { n: allRows.length.toLocaleString() }) : tr("Import a geological map (polygons with a unit attribute) and the outcrop measurements in the Geological Mapping tab first.");
  const noTerrainMsg = tr("Make a terrain in Maps > Terrain (fetch one, import a DEM, or build one offline from points, from the project's samples and collars, or from a block model's top): the model cannot run without one.");
  const fewUnitsMsg = order.length === 1 ? tr("Only one unit ({unit}) is in the stratigraphic role: a model needs at least two. Set another unit's role to stratigraphic above, or build the unit as an intrusion body below.", { unit: order[0] }) : tr("No unit is in the stratigraphic role: a model needs at least two units in order. Set their roles above.");
  const noOrientMsg = allRows.length ? tr("No orientation to build from: none of the {n} outcrop measurement(s) is in a ticked 'Orientations from' class ({other} are classed Other), and no contact dip could be fitted. Tick a class above, or classify the type codes in Geological Mapping.", { n: allRows.length.toLocaleString(), other: allRows.filter((r) => r.cls === "other").length.toLocaleString() }) /* #2266 */ : tr("No orientation to build from: no outcrop measurements, and no contact dip could be fitted on this terrain (a trace needs enough relief). Import bedding or contact measurements in Geological Mapping.");
  useMcpMapModel(() => ({ polys, lines, layer, unitField, setLayerId, setFaultLayerId, faultLayer, faults, faultPlan, faultPick, takeFaults, plan, ageSug, byAge, orderFrom, setOrderFrom, order, relation, setRelation, groundAt: !!groundAt, noOrient: !!noOrient, busy, fit, noMapMsg, noTerrainMsg, fewUnitsMsg, noOrientMsg })); // TASKS.csv #4053 — an AI app's model_from_map drives this pane
  // #1447 — only what is missing: Silvertip's 51 outcrop measurements were loaded and the message still asked for them
  if (!polys.length) return <>{holesNote}<div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{noMapMsg}</div></>;
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      {holeCount > 0 && !codes.length && holesNote}
      {/* TASKS.csv #4070 (Matt's layout C) — the pane as steps: 1 Map, 2 Order, 3 Data -> Build, 4 Result (the fit card); the rarer settings and the
          intrusion bodies in Fine-tune. What it does: the first question's tooltip and Help. */}
      <StepPane id="mapmodel" label={tr("Model from map")}
        steps={[
          { key: "map", label: tr("Map"), question: tr("Which map?"), hint: tr("Builds a stratigraphic model from the geological map and outcrop measurements alone: contacts become unit tops, bedding and contact dips become orientations. Check the suggested order below."), body: (<>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Map")}</span>
        <select value={layer?.id || ""} onChange={(e) => setLayerId(e.target.value)} style={sel} aria-label={tr("Geological map")}>{polys.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      {nearestHole && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>{tr("This map is the nearest-hole subcrop: its borders lie half-way between holes, so they say nothing of order. Intrusive and cross-cutting codes start out of the pile. Set the order by hand, check it against the logged contacts below, or choose a mapped layer.")}</div>}
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Unit field")}</span>
        <select value={unitField} onChange={(e) => setField(e.target.value)} style={sel} aria-label={tr("Unit field")}>{fieldsOf(layer).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          </>) },
          { key: "order", label: tr("Order"), question: tr("Stratigraphic order (youngest at the top)"), body: (<>
            <div ref={roleListRef} />{/* the cut offer's "change the roles" scrolls here (#3936) */}
      {plan && <CutOffer plan={plan} onTake={() => takeCut(false)} onChange={() => takeCut(true)} />}
      {cut && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "6px 0 4px", lineHeight: 1.4 }}>{tr("Cut down for GemPy: {m} merged, {o} left out (listed under the order). Their roles can be changed there.", { m: Object.keys(cut.merge).length, o: cut.out.length })}{" "}<button type="button" onClick={() => { setCut(null); setOrderByHand(false); }} className="gs-btn gs-btn--quiet gs-btn--sm" style={{ padding: "0 4px" }}>{tr("Undo the cut")}</button></div>}
      {ageSug?.use && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{byAge ? tr("By the map's ages ({n} of {m} units).", { n: ageSug.dated, m: ageSug.total }) : tr("By bedding younging.")}{" "}<button type="button" onClick={() => { setOrderFrom(byAge ? "bedding" : "age"); setOrderByHand(false); }} className="gs-btn gs-btn--quiet gs-btn--sm" style={{ padding: "0 4px" }}>{byAge ? tr("Use the bedding order") : tr("Use the map's ages")}</button></div> /* #4001 */}
      {!groundAt && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4 }}>{noTerrainMsg}</div>}
      {order.map((u, i) => (
        <React.Fragment key={u}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, marginBottom: 3, fontSize: "var(--font-size-xs)" }}>
          <button data-btn-own="" onClick={() => move(i, -1)} disabled={!i} aria-label={tr("Move up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: i ? 1 : 0.3 }}><ChevronUp size={13} /></button>
          <button data-btn-own="" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={tr("Move down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: i < order.length - 1 ? 1 : 0.3 }}><ChevronDown size={13} /></button>
          <span style={{ fontWeight: 600 }}>{plainLith(u)}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-muted)" }} title={plainLith(unitInfo.get(u)?.description || "")}>{plainLith(unitInfo.get(u)?.description || "")} · {why(u)}</span>
          <select value={roles[u] || "stratigraphic"} onChange={(e) => setRole(u, e.target.value)} style={{ ...smallSel, width: 96 }} aria-label={tr("Role of {u}", { u })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
        </div>
        {i < order.length - 1 && (
          <button data-btn-own="" type="button" aria-pressed={breaks.includes(u)} onClick={() => setBreaks((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]))}
            title={tr("Units above and below an unconformity are fitted as separate conformable packages. The top of the unit below it follows the upper package.")}
            style={{ display: "block", width: "100%", background: "none", border: "none", borderTop: breaks.includes(u) ? "2px dashed var(--color-accent)" : "none", padding: "0 0 2px", marginBottom: 3, cursor: "pointer", textAlign: "center", fontSize: "var(--font-size-xs)", color: breaks.includes(u) ? "var(--color-accent-dark)" : "var(--color-text-muted)" }}>
            {breaks.includes(u) ? tr("Unconformity here (click to remove)") : tr("Mark an unconformity here")}
          </button>
        )}
        </React.Fragment>
      ))}
      {leftOut.length > 0 && (
        <div style={{ fontSize: "var(--font-size-xs)", marginTop: 4, marginBottom: 6 }}>
          {tr("Left out of the stack:")}{" "}
          {leftOut.map((u) => (
            <span key={u} style={{ marginRight: 6, whiteSpace: "nowrap" }}>{plainLith(u)} <select value={roles[u]} onChange={(e) => setRole(u, e.target.value)} style={{ ...smallSel, width: 90 }} aria-label={tr("Role of {u}", { u })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></span>
          ))}
        </div>
      )}
      <div role="button" tabIndex={0} onClick={() => setShowWhy((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowWhy((v) => !v); }} style={{ cursor: "pointer", fontSize: "var(--font-size-xs)", marginBottom: 4 }}>{showWhy ? "▾" : "▸"} {tr("Why this order (contact by contact)")}</div>
      {showWhy && byAge && <div style={{ fontSize: "var(--font-size-xs)", marginBottom: 2 }}>{tr("The order follows the map's ages; units of one age, or with none, keep their bedding order. The contacts below are the bedding evidence.")}</div> /* #4001 */}
      {showWhy && nearestHole && <div style={{ fontSize: "var(--font-size-xs)", marginBottom: 2 }}>{tr("{n} border(s) between nearest-hole outlines: not contacts, not used.", { n: (suggestion?.pairs || []).filter((p) => p.nearestHole).length })}</div>}
      {showWhy && (suggestion?.pairs || []).filter((p) => p.weight || p.faulted).sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((p) => (
        <div key={`${p.a}|${p.b}`} style={{ fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
          {p.faulted ? tr("{a} | {b}: follows a mapped fault — not used", { a: p.a, b: p.b })
            : tr("{y} over {o}: {pct}% agreement ({beds} bedding, {planes} contact dips)", { y: p.younger, o: p.older, pct: Math.round(100 * p.agreement), beds: p.measurements, planes: p.trace?.planes || 0 })}
        </div>
      ))}
      {hasBreaks ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.45 }}>{tr("Packages: units between unconformities share one field and stay parallel; each package truncates the ones below. Units missing inside a package cannot pinch out. Surfaces flatten beyond their contacts: compare the predicted map with yours.")}</div> : <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Contacts")}</span>
        <select value={relation} onChange={(e) => setRelation(e.target.value)} style={sel} aria-label={tr("Contact relation")}>
          <option value="onlap">{tr("Conformable (one shared field: units cannot pinch out)")}</option><option value="erode">{tr("Erosional (each unit truncates those below)")}</option>
        </select></div>}
          </>) },
          { key: "data", label: tr("Data"), question: tr("What else goes in?"), body: (<>
      <div style={{ marginBottom: 6 }}>
        <div style={{ marginBottom: 3 }}>{tr("Orientations from")}</div>
        {classCounts.length ? classCounts.map(([c, n]) => (
          <label key={c} style={{ marginRight: 8, cursor: "pointer", whiteSpace: "nowrap" }}><input type="checkbox" checked={classes.includes(c)} onChange={(e) => setClasses((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} /> {c} ({n})</label>
        )) : <span style={{ fontSize: "var(--font-size-xs)", color: noOrient ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{orientCount ? tr("no outcrop measurements imported — the contacts' own dips are used: {n} fitted from the map traces on this terrain", { n: orientCount.planes }) : tr("no outcrop measurements imported — the contacts' own dips are used")}</span>}{/* #1604 */}
      </div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Faults")}</span>
        <select value={faultLayer?.id || ""} onChange={(e) => setFaultLayerId(e.target.value)} style={sel} aria-label={tr("Fault lines")}><option value="">{tr("(none)")}</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      {faults.map((f) => (
        <div key={f.i} style={{ ...row, fontSize: "var(--font-size-xs)" }}>
          <input type="checkbox" checked={f.on} onChange={(e) => setFault(f.i, { on: e.target.checked })} aria-label={f.name} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${f.name}\n${f.measured ? tr("dip and side from the nearest measured fault") : tr("no measured fault nearby: set the dip")}${faultWhy[f.i] ? `\n${faultWhy[f.i]}` : ""}`}>{tr(FAULT_TYPE_LABEL[f.type])} · {fmtLen(f.lengthM)}{faultWhy[f.i] ? <span style={{ color: "var(--color-text-muted)" }}> · {faultWhy[f.i]}</span> : null}</span>{/* #3985 — type and length; the pick's reason */}
          {f.dipIsDefault && <span style={{ color: "var(--color-text-muted)" }} title={tr("From the line type: set the dip if you know it")}>{tr("default")}</span>}
          <NumberInput min={1} max={90} value={f.dip} onChange={(v) => setFault(f.i, { dip: v })} style={{ ...smallSel, width: 46 }} aria-label={tr("Dip")} />°
          <select value={Math.round(f.dipDir)} onChange={(e) => setFault(f.i, { dipDir: Number(e.target.value) })} style={{ ...smallSel, width: 62 }} aria-label={tr("Dips towards")}>
            {f.perp.map((a) => <option key={a} value={Math.round(a)}>{tr("to {a}°", { a: Math.round(a) })}</option>)}
          </select>
        </div>
      ))}
      {faultPlan && <FaultPickOffer plan={faultPlan} names={Object.fromEntries(faults.map((f) => [f.i, `${tr(FAULT_TYPE_LABEL[f.type])} · ${fmtLen(f.lengthM)}`]))} reason={reasonOf} onTake={takeFaults} /> /* TASKS.csv #3985 */}
      {faultPick && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "6px 0 4px", lineHeight: 1.4 }}>{tr("Picked {k} of {n} faults for GemPy; the rest are unticked.", { k: faultPick.keep, n: faultPick.before })} <button type="button" onClick={undoFaults} className="gs-btn gs-btn--quiet gs-btn--sm">{tr("Undo")}</button></div>}
      {holeCount > 0 && codes.length > 0 && ( /* TASKS.csv #1718 */
        <div style={{ margin: "8px 0", padding: 6, border: "1px solid var(--color-border)", borderRadius: 6 }} aria-label={tr("Drillhole contacts")}>
          <label style={{ ...row, cursor: "pointer", color: "var(--color-text)" }}><input type="checkbox" checked={useHoles} onChange={(e) => setUseHoles(e.target.checked)} />{loggedHoles < holeCount ? tr("Use the drillholes' logged contacts ({n} of the {m} holes have a lithology log)", { n: loggedHoles, m: holeCount }) : tr("Use the drillholes' logged contacts ({n} holes)", { n: loggedHoles })}</label>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Give each logged code its map unit: where a hole passes from one unit of the order to another, that depth is a contact, like those on the map.")}</div>
          {useHoles && (
            <div style={{ maxHeight: 170, overflowY: "auto", marginBottom: 6 }}>
              {codes.map(({ code, n }) => (
                <div key={code} style={{ ...row, marginBottom: 3, fontSize: "var(--font-size-xs)" }}>
                  <span style={{ width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tr("{n} interval(s)", { n })}>{code} ({n})</span>
                  <select value={codeUnit[code] || ""} onChange={(e) => setCodeEdit((p) => ({ ...p, [code]: e.target.value }))} style={sel} aria-label={tr("Map unit for {code}", { code })}>
                    <option value="">{tr("not used")}</option>{mapUnits.map((u) => <option key={u} value={u}>{plainLith(u)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {useHoles && holePreview && <div style={{ fontSize: "var(--font-size-xs)", color: holePreview.contacts.length ? "var(--color-text-muted)" : "var(--color-warn-text)", lineHeight: 1.4 }}>
            {holePreview.contacts.length ? tr("{c} contact(s) in {h} hole(s) between units of the order.", { c: holePreview.contacts.length, h: holePreview.holes }) : tr("No contact yet: no hole passes between two units of the order with these codes.")}
            {inArea && inArea.outside > 0 ? " " + tr("{k} of them in {hh} hole(s) collared inside the map's area; {o} in holes outside it, which the run leaves out.", { k: inArea.inside, hh: inArea.insideHoles, o: inArea.outside }) /* #3045 */ : ""}{/* #2973 */}
            {holePreview.gaps ? " " + tr("{g} more left out: over {m} m unlogged or not used between the two units.", { g: holePreview.gaps, m: MAX_GAP_M }) : ""}
            {[...(holePreview.repeats || new Map())].sort((a, b) => a[1].metres / a[1].runs - b[1].metres / b[1].runs).slice(0, 1) /* the thinner repeating unit is the sheet; its host repeats between the sheets */.map(([u, e]) => <div key={u} style={{ color: "var(--color-warn-text)" }}>{tr("{unit} is met {r} times in {h} hole(s), up to {max} in one, like stacked sheets (dykes, sills), a fold or a fault. A single top cannot fit all its tops and bases: model sheets in 3D Modelling > Veins / dykes.", { unit: u, r: e.runs.toLocaleString(), h: e.holes.toLocaleString(), max: e.maxRuns })}</div>)}{/* #2567 */}
            {(() => { /* TASKS.csv #3850 - the other units that repeat down the holes are named too (the larger one first): MZNA, an alteration overprint, met 343 times in 76 holes, was not */
              const rep = [...(holePreview.repeats || new Map())].sort((a, b) => a[1].metres / a[1].runs - b[1].metres / b[1].runs).slice(1).sort((a, b) => b[1].runs - a[1].runs).slice(0, 5);
              return rep.length ? <div style={{ color: "var(--color-warn-text)" }}>{tr("Also met more than once down the holes: {list}. Such a unit is the host between sheets or an overprint (alteration, deformation), not a bed: its contacts here are not stratigraphic tops.", { list: rep.map(([u, e]) => tr("{unit} ({r} times in {h} hole(s), up to {max} in one)", { unit: u, r: e.runs.toLocaleString(), h: e.holes.toLocaleString(), max: e.maxRuns })).join("; ") })}</div> : null;
            })()}
            {orderCheck && orderCheck.against > orderCheck.agree && <div style={{ color: "var(--color-warn-text)" }}>{tr("{a} of {n} logged contacts run the other way: {upper} is logged over {lower} in {k} of them. In this order {lower} is the younger: move {upper} up?", { a: orderCheck.against, n: orderCheck.agree + orderCheck.against, upper: orderCheck.worst.upper, lower: orderCheck.worst.lower, k: orderCheck.worst.n })}</div>}{/* #2408 */}
          </div>}
        </div>
      )}
      {groundCount && (groundCount.pointsOnGround < groundCount.points || groundCount.measurementsOnGround < groundCount.measurements) && ( /* TASKS.csv #2959 */
        <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4, lineHeight: 1.4 }}>
          {tr("Terrain under {a} of {n} contact point(s) and {b} of {m} measurement(s). The rest sit at the map layer's elevation{z}, where the surfaces are cut; a terrain over the whole map (Maps > Terrain) fixes that.", { a: groundCount.pointsOnGround, n: groundCount.points, b: groundCount.measurementsOnGround, m: groundCount.measurements, z: Number.isFinite(Number(layer?.elevation)) ? tr(" (RL {z})", { z: Math.round(Number(layer.elevation)) }) : "" })}
        </div>
      )}
      {groundAt && order.length < 2 && !busy && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{fewUnitsMsg}</div>}{/* TASKS.csv #2086 — Build was disabled with no word */}
      {holeFit && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("No outcrop orientation: each top will get one fitted from its logged contacts ({n} in use), a least-squares plane through its contact points.", { n: holePreview.contacts.length.toLocaleString() })}</div>}{/* #2409 */}
      {noOrient && lithoRows?.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("From drillholes alone: 3D Modelling > Stratigraphic stack or Implicit surface; or tick 'Use the drillholes' logged contacts' above with each code's unit.")}</div>}{/* #2409 */}
      {noOrient && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{noOrientMsg}</div>}{/* #1604 */}
          </>) },
        ]}
        action={{ label: busy ? tr("Running…") : tr("Build the model (GemPy)"), onClick: () => onRun({ layer: effLayer /* #3936: merged units, if the cut was taken */, field: unitField, order, breaks: runBreaks /* #4001 */, facies: runFacies, bedding, planes, faults: runFaults /* #3985 — merged pieces as one trace */, relation, leftOut, onFit: setFit /* #3989 */, holeCodes: useHoles && holeCount > 0 ? codeUnit : null, fullDetail }), disabled: busy || !groundAt || order.length < 2 || noOrient,
          attrs: { "data-mcp": "map-run" } /* #4053 — the AI app's model_from_map presses it (useMcpMapModel asks for this step first) */ }}
        result={{ key: fit && !busy ? fit : null, body: fit && !busy ? <MapFitCard fit={fit} shown={showDiff} onShow={(on) => { setShowDiff(on); fit.show(on); }} /> : null }}
        fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="mapmodel">
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Description")}</span>
        <select value={desc} onChange={(e) => setDescField(e.target.value)} style={sel} aria-label={tr("Description field")}><option value="">{tr("(none)")}</option>{fieldsOf(layer).filter((f) => f !== unitField).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
      <label style={{ ...row, cursor: "pointer", fontSize: "var(--font-size-xs)", lineHeight: 1.4, alignItems: "flex-start" }} title={tr("A large map is thinned to keep the run to a few minutes. Ticked, every contact point and orientation goes to GemPy: it can take many times longer, the 15-minute stop is off, and Cancel on the status bar stops it.")}>
        <input type="checkbox" checked={fullDetail} onChange={(e) => setFullDetail(e.target.checked)} style={{ marginTop: 2 }} />{tr("Full detail: send all the sampled contacts (can take much longer)")}
      </label>{/* TASKS.csv #3162 follow-up */}
      {/* TASKS.csv #821 — intrusions as bodies */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginTop: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Intrusions as bodies")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 6 }}>
          {tr("Each polygon of an intrusion-role unit becomes a closed body: the ground on top, walls down to a flat base. A construction from the map and the settings below, not a fitted model.")}
        </div>
        {!intrusive.length ? (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("No unit is in the intrusion role. Set a unit's role to intrusion above.")}</div>
        ) : (<>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginBottom: 6 }}>
            {intrusive.map((u) => (
              <label key={u} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={!bodyOff[u]} onChange={(e) => setBodyOff((q) => ({ ...q, [u]: !e.target.checked }))} />{plainLith(u)}
              </label>
            ))}
          </div>
          <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Depth below outcrop")}</span>
            <NumberInput allowEmpty min={10} step={50} value={bodyDepth === "" ? null : bodyDepth} placeholder={tr("required")} onChange={(v) => setBodyDepth(v == null ? "" : v)} style={{ ...sel, width: 70, flex: "none" }} aria-label={tr("Depth below outcrop")} /><span>m</span>
            {deepestLogged && bodyDepth === "" && <button type="button" onClick={() => setBodyDepth(Math.max(10, Math.ceil(deepestLogged.depth / 10) * 10))} className="gs-btn gs-btn--sm" style={{ flex: "none" }} title={tr("The deepest logged {unit} ends {d} m down hole {hole}: a body to that depth reaches every logged intercept.", { unit: deepestLogged.unit, d: Math.round(deepestLogged.depth), hole: deepestLogged.hole })}>{tr("Use {d} m (deepest logged)", { d: Math.max(10, Math.ceil(deepestLogged.depth / 10) * 10) })}</button>}{/* #2568 */}</div>
          <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Shape")}</span>{/* TASKS.csv #2642 */}
            <select value={bodyShape} onChange={(e) => setBodyShape(e.target.value)} style={sel} aria-label={tr("Body shape")}>
              <option value="plug">{tr("plug or stock (walls all round)")}</option><option value="sheet">{tr("sheet or dyke (both walls dip one way)")}</option>
            </select></div>
          {bodyShape === "sheet" ? (<>
            <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Sheet dip")}</span>
              <NumberInput allowEmpty min={10} max={90} step={1} value={sheetDip === "" ? null : sheetDip} placeholder={tr("required")} onChange={(v) => setSheetDip(v == null ? "" : String(v))} style={{ ...sel, width: 60, flex: "none" }} aria-label={tr("Sheet dip")} /><span>°</span>
              <span style={{ flexShrink: 0 }}>{tr("toward")}</span>
              <NumberInput allowEmpty min={0} max={359} step={1} value={sheetDipDir === "" ? null : sheetDipDir} placeholder={tr("required")} onChange={(v) => setSheetDipDir(v == null ? "" : String(v))} style={{ ...sel, width: 60, flex: "none" }} aria-label={tr("Sheet dip direction")} /><span>°</span></div>
            {contactOffer && (sheetDip === "" || sheetDipDir === "") && <button type="button" onClick={() => { setSheetDip(String(contactOffer.dip)); setSheetDipDir(String(contactOffer.dipDir)); }} className="gs-btn gs-btn--sm" style={{ marginBottom: 6 }} title={tr("The mean of the {n} contact readings within {m} m of the ticked units' polygons.", { n: contactOffer.n, m: contactOffer.maxM })}>{tr("Use {dip}° toward {dir}° ({n} contact readings)", { dip: contactOffer.dip, dir: contactOffer.dipDir, n: contactOffer.n })}</button>}
            {fitUnit && lithoRows?.length > 0 && Object.values(codeUnit).includes(fitUnit) /* codeUnit is declared below the hooks above */ && <button type="button" onClick={fitToLogs} disabled={!groundAt} className="gs-btn gs-btn--sm" style={{ marginBottom: 6 }} /* TASKS.csv #2724 */
              title={tr("Strike from the unit's map outline, dip from where its logged intercepts lie below the ground beside that trace (least squares); fills the two boxes.")}>{tr("Fit to the logged intercepts")}</button>}
            {sheetFit && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: sheetFit.warn ? "var(--color-warn-text)" : "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 6 }}>{sheetFit.text}</div>}
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 6 }}>{tr("The base is the outline moved down-dip, so both walls dip the same way; the thickness is the map width across the dip, said when built.")}</div>
          </>) : (
          <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Wall dip")}</span>
            <NumberInput min={30} max={90} step={5} value={bodyDip} onChange={(v) => setBodyDip(v)} style={{ ...sel, width: 70, flex: "none" }} aria-label={tr("Wall dip")} /><span>°</span>
            <select value={bodyFlare} onChange={(e) => setBodyFlare(e.target.value)} disabled={bodyDip >= 90} style={{ ...sel, opacity: bodyDip >= 90 ? 0.5 : 1 }} aria-label={tr("Wall direction")}>
              <option value="out">{tr("widens with depth")}</option><option value="in">{tr("narrows with depth")}</option>
            </select></div>
          )}
          <button onClick={() => { setBodyMsg(null); Promise.resolve(onBuildBodies?.({ layer, field: unitField, units: bodyUnits, depthM: Number(bodyDepth), wallDip: bodyShape === "sheet" ? 90 : bodyDip, flare: bodyFlare, sheet: bodyShape === "sheet" ? { dip: Number(sheetDip), dipDir: Number(sheetDipDir) } : null /* #2642 */, logs: lithoRows?.length ? { codeUnit, litho: lithoRows } : null /* #2663; plugs and stocks too: #2819 */ })).then((r) => r && setBodyMsg(r)).catch(() => {}); }}
            disabled={!groundAt || !bodyUnits.length || !(Number(bodyDepth) >= 10) || !sheetOk} title={groundAt ? "" : tr("Needs a terrain: the top of each body is the ground. Offline, Geophysics > Block models > Terrain from the model's top makes one.")}
            className="gs-btn gs-btn--block" style={{ justifyContent: "center" }}>
            {tr("Build intrusion bodies")}
          </button>
          {bodyMsg && (bodyMsg.failed.length > 0 || bodyMsg.gapFilled) && <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginTop: 4, color: bodyMsg.failed.length ? "var(--color-danger-fg)" : "var(--color-text-muted)" }}>{/* #2569 — kept in the pane */}
            {bodyMsg.failed.length > 0 && tr("{k} polygon(s) could not be built: {list}", { k: bodyMsg.failed.length, list: bodyMsg.failed.slice(0, 3).join(" ") })}
            {bodyMsg.gapFilled && <div style={{ color: "var(--color-text-muted)" }}>{tr("{k} of {n} outline point(s) fell in gaps of the terrain and took the ground of the nearest point that has some.", bodyMsg.gapFilled)}</div>}
          </div>}
        </>)}
      </div>
        </MoreFold>} />
    </div>
  );
}

// TASKS.csv #3985 — the faults' type labels and a length in words
const FAULT_TYPE_LABEL = { thrust: "Thrust", reverse: "Reverse", normal: "Normal", "strike-slip": "Strike-slip", fault: "Fault" };
const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
// TASKS.csv #3985 — the faults' offer: which ones the pick keeps and leaves out, and why, before the run
// TASKS.csv #3989 (a) — after a run: how much of the mapped ground the model's unit at the terrain matches, per unit (largest first, a poor one
// says what the model has there instead), and the 'where it differs' overlay on the terrain, hidden until ticked
const pctOf = (v) => (v == null ? "–" : `${Math.round(100 * v)} %`);
function MapFitCard({ fit, shown, onShow }) {
  const line = { fontSize: "var(--font-size-xs)", lineHeight: 1.45, color: "var(--color-text)" };
  const units = fit.units.slice(0, 8);
  return (
    <div role="status" style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", margin: "6px 0" }}>
      <div style={{ ...line, fontWeight: 600 }}>{fit.overall == null ? tr("The model has none of the mapped units here, so its fit to the map cannot be scored.") : tr("Matches the map on {pct} of the mapped ground", { pct: pctOf(fit.overall) })}</div>
      {units.map((u) => <div key={u.unit} style={line}>{u.unit}: {pctOf(u.pct)}{u.pct != null && u.pct < 0.5 && u.modelledAs ? <span style={{ color: "var(--color-text-muted)" }}> {tr("(mostly {unit})", { unit: u.modelledAs })}</span> : null}</div>)}
      {fit.unscored.length > 0 && <div style={{ ...line, color: "var(--color-text-muted)" }}>{tr("Not scored, not in the model: {list}", { list: fit.unscored.slice(0, 6).join(", ") + (fit.unscored.length > 6 ? "…" : "") })}</div>}
      {fit.differ > 0 && <label style={{ ...line, display: "flex", gap: 6, alignItems: "center", marginTop: 4, cursor: "pointer" }}>
        <input type="checkbox" checked={shown} onChange={(e) => onShow(e.target.checked)} />{tr("Show where it differs (red, on the terrain)")}
      </label>}
    </div>
  );
}
function FaultPickOffer({ plan, names, reason, onTake }) {
  const line = { fontSize: "var(--font-size-xs)", lineHeight: 1.45, color: "var(--color-text)" };
  const label = (e) => e.ids.map((i) => names[i]).filter(Boolean).slice(0, 2).join(" + ");
  return (
    <div role="note" style={{ border: "1px solid var(--color-warn-border, var(--color-border))", background: "var(--color-warn-bg, transparent)", borderRadius: 6, padding: "6px 8px", margin: "6px 0" }}>
      <div style={{ ...line, fontWeight: 600 }}>{tr("GemPy takes at most {max} faults in one model, and {n} are ticked. GeoStrix can pick the {max} that matter:", { max: GEMPY_MAX_FAULTS, n: plan.before })}</div>
      {plan.keep.map((e) => <div key={e.ids.join(",")} style={line}>✓ {label(e)} <span style={{ color: "var(--color-text-muted)" }}>({reason(e)})</span></div>)}
      {plan.drop.map((e) => <div key={e.ids.join(",")} style={{ ...line, color: "var(--color-text-muted)" }}>– {label(e)} ({reason(e)})</div>)}
      <button type="button" onClick={onTake} className="gs-btn gs-btn--sm" style={{ marginTop: 4 }}>{tr("Pick the {max} for me", { max: GEMPY_MAX_FAULTS })}</button>
    </div>
  );
}
// TASKS.csv #3936 — the offer: what the cut would do and why, before the run
function CutOffer({ plan, onTake, onChange }) {
  const names = (list) => list.map((x) => plainLith(x)).join(", ");
  const outside = plan.leftOut.filter((x) => x.why === "outside"), ranked = plan.leftOut.filter((x) => x.why === "rank");
  const line = { margin: "3px 0", lineHeight: 1.4 };
  return (
    <div role="status" style={{ fontSize: "var(--font-size-xs)", border: "1px solid var(--color-warn-text)", borderRadius: 6, padding: "6px 8px", margin: "8px 0" }}>
      <div style={{ ...line, fontWeight: 600 }}>{tr("GemPy takes at most {max} units in one model, and this order has {n}. GeoStrix can cut it down to {k}:", { max: GEMPY_MAX_SURFACES, n: plan.before, k: plan.after })}</div>
      {outside.length > 0 && <div style={line}>{tr("Left out, mapped only outside the drilled area (the holes and {m} m round them): {list}.", { m: plan.marginM.toLocaleString(), list: names(outside.map((x) => x.unit)) })}</div>}
      {plan.merged.map((m) => <div key={m.name} style={line}>{m.why === "group" ? tr("Merged into {name}, one group or formation next to each other in the order: {list}.", { name: plainLith(m.name), list: names(m.members) }) : tr("Merged into {name}, the same mapped age ({age}) next to each other in the order: {list}.", { name: plainLith(m.name), age: m.key, list: names(m.members) })}</div>)}
      {ranked.length > 0 && <div style={line}>{tr("Left out, with the least mapped area in the drilled area and the shortest contacts with other units: {list}.", { list: ranked.map((x) => tr("{unit} ({a} km², {c} km of contact)", { unit: plainLith(x.unit), a: x.areaKm2 >= 0.01 ? x.areaKm2 : "< 0.01", c: x.contactKm })).join(", ") })}</div>}
      <div style={{ ...line, color: "var(--color-text-muted)" }}>{tr("Left-out units are kept on the map as 'other (left out)'; nothing is deleted.")}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button type="button" onClick={onTake} className="gs-btn gs-btn--sm">{tr("Cut the order down for me")}</button>
        <button type="button" onClick={onChange} className="gs-btn gs-btn--quiet gs-btn--sm" title={tr("Take the cut and go to the order and roles to change it")}>{tr("Change these")}</button>
      </div>
    </div>
  );
}
