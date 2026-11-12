// TASKS.csv #817 — "Model from map": a 3D stratigraphic model from the geological map and the outcrop measurements alone
// (no drillholes). Matt: "tool should suggest strat order and let the user adjust it". The order is suggested by
// lib/pileOrder.js (bedding younging across each contact + each contact's own dip fitted from its trace on the terrain,
// faulted contacts left out) and shown WITH its evidence; the geologist reorders units, changes roles, sets each fault's
// dip, then runs the ordinary GemPy stack (modellingRuns.runMapModel).
import React, { useEffect, useMemo, useState } from "react";
import { deepestUnitIntercept } from "../lib/holeMapContacts.js"; // TASKS.csv #2568
import { contactOrientationNear } from "../lib/sheetFromContacts.js"; // TASKS.csv #2642
import { fitSheetToLogs } from "../lib/sheetLogCheck.js"; // TASKS.csv #2724
import { featureCategoryValue, extractMapContacts } from "../lib/mapLayers.js"; // TASKS.csv #2724; extractMapContacts: #2959
import { mapGroundCount, contactsInArea } from "../lib/mapGroundCount.js"; // TASKS.csv #2959; contactsInArea: #2973
import { useStore } from "../lib/store.jsx"; // TASKS.csv #2724 — the collars and survey the logged intercepts are placed on
import { ChevronUp, ChevronDown } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { suggestPileOrder } from "../lib/pileOrder.js";
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { loggedCodes, suggestCodeUnits, holeContacts, MAX_GAP_M, contactsAgainstOrder } from "../lib/holeMapContacts.js"; // TASKS.csv #1718; contactsAgainstOrder: #2408

const ROLES = ["stratigraphic", "intrusion", "cross-cutting", "other"];
const roleLabel = (r) => ({ stratigraphic: tr("stratigraphic"), intrusion: tr("intrusion"), "cross-cutting": tr("cross-cutting"), other: tr("other (left out)") }[r] || r);
const fieldsOf = (l) => l?.fields || Object.keys(l?.features?.[0]?.attributes || {});

export default function MapModelPanel({ mapLayers, surfaceStructures, terrain, busy, onRun, onBuildBodies, pBtn, smallSel, holeCount = 0, lithoRows = null }) { // holeCount: #1718 // onBuildBodies: #821
  const polys = (mapLayers || []).filter((l) => l.geomType === "polygon");
  const lines = (mapLayers || []).filter((l) => l.geomType === "line" || l.geomType === "polyline"); // the importer names them "polyline"
  const [layerId, setLayerId] = useState("");
  const layer = polys.find((l) => l.id === layerId) || polys[0] || null;
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
    return { i, name, line, perp, on: s.on ?? true, dip: s.dip ?? (near ? near.dip : 45), dipDir: s.dipDir ?? perp[side], measured: !!near };
  }), [faultFeatures, measuredFaults, faultSet]);
  const setFault = (i, patch) => setFaultSet((p) => ({ ...p, [i]: { ...(p[i] || {}), ...patch } }));

  // the suggestion (recomputed when the inputs change), then the user's order and roles
  const groundAt = useMemo(() => {
    if (!terrain?.bbox) return null;
    return (x, y) => terrainGroundAt(terrain, x, y); // TASKS.csv #927
  }, [terrain]);
  const suggestion = useMemo(() => {
    if (!layer || !unitField) return null;
    try { return suggestPileOrder({ layer, field: unitField, descField: desc || null, bedding, faults: faults.filter((f) => f.on).map((f) => f.line), groundAt }); } catch { return null; }
  }, [layer, unitField, desc, bedding, faults, groundAt]);
  const [order, setOrder] = useState([]);
  const [roles, setRoles] = useState({});
  // TASKS.csv #2408 — an order set by hand is kept when the suggestion is recomputed (unticking an orientation class put Basement back on top
  // without a word): the hand order keeps its units in its own sequence, drops units the suggestion no longer has and adds new ones at the end
  const [orderByHand, setOrderByHand] = useState(false);
  useEffect(() => {
    if (!suggestion) return;
    if (!orderByHand) { setOrder(suggestion.order); setRoles(suggestion.roles); return; }
    setOrder((p) => [...p.filter((u) => suggestion.order.includes(u)), ...suggestion.order.filter((u) => !p.includes(u))]);
  }, [suggestion]); // orderByHand is read, not a trigger
  const move = (i, d) => { setOrderByHand(true); setOrder((p) => { const q = p.slice(); const j = i + d; if (j < 0 || j >= q.length) return p; [q[i], q[j]] = [q[j], q[i]]; return q; }); };
  const setRole = (u, r) => {
    setOrderByHand(true);
    setRoles((p) => ({ ...p, [u]: r }));
    setOrder((p) => (r === "stratigraphic" ? (p.includes(u) ? p : [...p, u]) : p.filter((x) => x !== u)));
  };
  const [relation, setRelation] = useState("onlap");
  const [showWhy, setShowWhy] = useState(false);
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
    if (r.reason === "too-few") { setSheetFit({ warn: true, text: tr("None of the {n} logged intercept(s) of {unit} lies below the ground beside its map trace on a hole with a collar and survey: nothing to fit.", { n: r.intercepts, unit: fitUnit }) }); return; }
    if (r.reason === "flat") { setSheetFit({ warn: true, text: tr("The logs fit a dip of {dip}° toward {dir}°: under 10°, a sill rather than a sheet, so the boxes were not filled.", { dip: r.dip, dir: r.dipDir }) }); return; }
    setSheetDip(String(r.dip)); setSheetDipDir(String(r.dipDir));
    const th = r.thickness.min.toFixed(1) === r.thickness.max.toFixed(1) /* as shown: a float spread under 0.05 m is one value */ ? tr("their true thickness across it is {a} m", { a: r.thickness.median.toFixed(1) }) : tr("their true thickness across it is {a}–{b} m (median {m} m)", { a: r.thickness.min.toFixed(1), b: r.thickness.max.toFixed(1), m: r.thickness.median.toFixed(1) });
    setSheetFit({ warn: r.holes < 3, text: tr("Fitted to {n} logged intercept(s) in {h} hole(s): {dip}° toward {dir}°, {rms} m RMS off the plane; {th}. The strike is the map outline's long axis; the plane passes through its trace.", { n: r.used, h: r.holes, dip: r.dip, dir: r.dipDir, rms: r.rmsM.toFixed(1), th }) + (r.holes < 3 ? " " + tr("From fewer than three holes: a guide, not a fit.") : "") });
  };
  const sheetOk = bodyShape !== "sheet" || (Number(sheetDip) >= 10 && Number(sheetDip) <= 90 && sheetDipDir !== "" && Number(sheetDipDir) >= 0 && Number(sheetDipDir) < 360);
  const why = (u) => {
    const i = unitInfo.get(u);
    if (!i) return "";
    if (i.evidence === "bedding" && i.overOthers && i.underOthers) return tr("between its neighbours"); // TASKS.csv #1311
    if (i.evidence === "bedding") return i.score > 0.15 ? tr("younger than its neighbours") : i.score < -0.15 ? tr("older than its neighbours") : tr("weak evidence");
    if (i.evidence === "elevation") return tr("by elevation only");
    return tr("no evidence (by area)");
  };
  const planes = useMemo(() => (suggestion?.pairs || []).flatMap((p) => (p.fittedPlanes || []).map((q) => ({ x: q.x, y: q.y, dip: q.dip, dipDir: q.dipDir, younger: p.younger, older: p.older }))), [suggestion]); // younger, older: #1309
  const [breaks, setBreaks] = useState([]); // TASKS.csv #1309 — units with an unconformity below them
  const hasBreaks = breaks.some((b) => order.slice(0, -1).includes(b));
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
  const inArea = useMemo(() => (holePreview?.contacts?.length && layer?.bbox ? contactsInArea(holePreview.contacts, storeCollars, layer.bbox) : null), [holePreview, storeCollars, layer]);
  const orderCheck = useMemo(() => (holePreview?.contacts?.length ? contactsAgainstOrder(holePreview.contacts, order) : null), [holePreview, order]); // #2408
  // TASKS.csv #1718 (review #1645, Copley) — on a drilled prospect, say that the holes are not used here and where they are
  const holesNote = holeCount > 0 ? <div className="ge-holes-note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>{loggedHoles > 0 /* TASKS.csv #2053 (review #2013): 'the 544 drillhole(s) are not used' while #1718 matches the logged holes to map units */
    ? tr("Once a geological map with unit polygons is loaded, the {n} drillhole(s) with a lithology log (of {m}) can be matched to its units here (\"Use the drillholes' logged contacts\"). Explicit surface's \"From the geological map\" section also fits the map contacts with the hole picks.", { n: loggedHoles, m: holeCount })
    : tr("None of the {m} drillhole(s) has a lithology log, so this tool builds from the map and the outcrop measurements only.", { m: holeCount })}</div> : null;
  // #1447 — only what is missing: Silvertip's 51 outcrop measurements were loaded and the message still asked for them
  if (!polys.length) return <>{holesNote}<div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{allRows.length ? tr("Import a geological map (polygons with a unit attribute) in the Surface Geology tab first, or draw its units there (Unit polygons): the {n} outcrop measurement(s) are already loaded.", { n: allRows.length.toLocaleString() }) : tr("Import a geological map (polygons with a unit attribute) and the outcrop measurements in the Surface Geology tab first.")}</div></>;
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      {holeCount > 0 && !codes.length && holesNote}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
        {tr("Builds a stratigraphic model from the geological map and outcrop measurements alone: the map contacts on the terrain become the tops of units, the bedding and the contacts' own dips become orientations. The order below is a suggestion from the map — check it.")}
      </div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Map")}</span>
        <select value={layer?.id || ""} onChange={(e) => setLayerId(e.target.value)} style={sel} aria-label={tr("Geological map")}>{polys.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Unit field")}</span>
        <select value={unitField} onChange={(e) => setField(e.target.value)} style={sel} aria-label={tr("Unit field")}>{fieldsOf(layer).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Description")}</span>
        <select value={desc} onChange={(e) => setDescField(e.target.value)} style={sel} aria-label={tr("Description field")}><option value="">{tr("(none)")}</option>{fieldsOf(layer).filter((f) => f !== unitField).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
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
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.measured ? tr("dip and side from the nearest measured fault") : tr("no measured fault nearby: set the dip")}>{f.name}</span>
          <input type="number" min={1} max={90} value={f.dip} onChange={(e) => setFault(f.i, { dip: Number(e.target.value) })} style={{ ...smallSel, width: 46 }} aria-label={tr("Dip")} />°
          <select value={Math.round(f.dipDir)} onChange={(e) => setFault(f.i, { dipDir: Number(e.target.value) })} style={{ ...smallSel, width: 62 }} aria-label={tr("Dips towards")}>
            {f.perp.map((a) => <option key={a} value={Math.round(a)}>{tr("to {a}°", { a: Math.round(a) })}</option>)}
          </select>
        </div>
      ))}
      <div style={{ margin: "8px 0 4px", color: "var(--color-text)" }}>{tr("Stratigraphic order (youngest at the top)")}</div>
      {!groundAt && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4 }}>{tr("No terrain: the contacts' dips cannot be fitted and the model cannot run. Fetch one (Maps > Terrain, needs the internet), import a DEM, or offline make one in Maps > Terrain from points or contours, from the project's samples and collars, or from a block model's top (Geophysics > Block models).") /* #1824 — the offline route; #1599 points, samples and collars */}</div>}
      {order.map((u, i) => (
        <React.Fragment key={u}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, marginBottom: 3, fontSize: "var(--font-size-xs)" }}>
          <button onClick={() => move(i, -1)} disabled={!i} aria-label={tr("Move up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: i ? 1 : 0.3 }}><ChevronUp size={13} /></button>
          <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={tr("Move down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: i < order.length - 1 ? 1 : 0.3 }}><ChevronDown size={13} /></button>
          <span style={{ fontWeight: 600 }}>{u}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-muted)" }} title={unitInfo.get(u)?.description || ""}>{unitInfo.get(u)?.description || ""} · {why(u)}</span>
          <select value={roles[u] || "stratigraphic"} onChange={(e) => setRole(u, e.target.value)} style={{ ...smallSel, width: 96 }} aria-label={tr("Role of {u}", { u })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
        </div>
        {i < order.length - 1 && (
          <button type="button" aria-pressed={breaks.includes(u)} onClick={() => setBreaks((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]))}
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
            <span key={u} style={{ marginRight: 6, whiteSpace: "nowrap" }}>{u} <select value={roles[u]} onChange={(e) => setRole(u, e.target.value)} style={{ ...smallSel, width: 90 }} aria-label={tr("Role of {u}", { u })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></span>
          ))}
        </div>
      )}
      <div role="button" tabIndex={0} onClick={() => setShowWhy((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowWhy((v) => !v); }} style={{ cursor: "pointer", fontSize: "var(--font-size-xs)", marginBottom: 4 }}>{showWhy ? "▾" : "▸"} {tr("Why this order (contact by contact)")}</div>
      {showWhy && (suggestion?.pairs || []).filter((p) => p.weight || p.faulted).sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((p) => (
        <div key={`${p.a}|${p.b}`} style={{ fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
          {p.faulted ? tr("{a} | {b}: follows a mapped fault — not used", { a: p.a, b: p.b })
            : tr("{y} over {o}: {pct}% agreement ({beds} bedding, {planes} contact dips)", { y: p.younger, o: p.older, pct: Math.round(100 * p.agreement), beds: p.measurements, planes: p.trace?.planes || 0 })}
        </div>
      ))}
      {hasBreaks ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.45 }}>{tr("Packages: units between unconformities share one field and stay parallel, and each package truncates the ones below. Units missing inside a package cannot pinch out. A surface flattens beyond its own contacts, so compare the predicted map with your map.")}</div> : <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Contacts")}</span>
        <select value={relation} onChange={(e) => setRelation(e.target.value)} style={sel} aria-label={tr("Contact relation")}>
          <option value="onlap">{tr("Conformable (one shared field: units cannot pinch out)")}</option><option value="erode">{tr("Erosional (each unit truncates those below)")}</option>
        </select></div>}
      {holeCount > 0 && codes.length > 0 && ( /* TASKS.csv #1718 */
        <div style={{ margin: "8px 0", padding: 6, border: "1px solid var(--color-border)", borderRadius: 6 }} aria-label={tr("Drillhole contacts")}>
          <label style={{ ...row, cursor: "pointer", color: "var(--color-text)" }}><input type="checkbox" checked={useHoles} onChange={(e) => setUseHoles(e.target.checked)} />{loggedHoles < holeCount ? tr("Use the drillholes' logged contacts ({n} of the {m} holes have a lithology log)", { n: loggedHoles, m: holeCount }) : tr("Use the drillholes' logged contacts ({n} holes)", { n: loggedHoles })}</label>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Give each logged code its map unit. Where a hole passes from one unit of the order to another, that depth is a contact for the same top as on the map.")}</div>
          {useHoles && (
            <div style={{ maxHeight: 170, overflowY: "auto", marginBottom: 6 }}>
              {codes.map(({ code, n }) => (
                <div key={code} style={{ ...row, marginBottom: 3, fontSize: "var(--font-size-xs)" }}>
                  <span style={{ width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tr("{n} interval(s)", { n })}>{code} ({n})</span>
                  <select value={codeUnit[code] || ""} onChange={(e) => setCodeEdit((p) => ({ ...p, [code]: e.target.value }))} style={sel} aria-label={tr("Map unit for {code}", { code })}>
                    <option value="">{tr("not used")}</option>{mapUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {useHoles && holePreview && <div style={{ fontSize: "var(--font-size-xs)", color: holePreview.contacts.length ? "var(--color-text-muted)" : "var(--color-warn-text)", lineHeight: 1.4 }}>
            {holePreview.contacts.length ? tr("{c} contact(s) in {h} hole(s) between units of the order.", { c: holePreview.contacts.length, h: holePreview.holes }) : tr("No contact yet: no hole passes between two units of the order with these codes.")}
            {inArea && inArea.outside > 0 ? " " + tr("{k} of them in {hh} hole(s) collared inside the map's area; {o} in holes outside it (the run uses them all).", { k: inArea.inside, hh: inArea.insideHoles, o: inArea.outside }) : ""}{/* #2973 */}
            {holePreview.gaps ? " " + tr("{g} more left out: over {m} m unlogged or not used between the two units.", { g: holePreview.gaps, m: MAX_GAP_M }) : ""}
            {[...(holePreview.repeats || new Map())].sort((a, b) => a[1].metres / a[1].runs - b[1].metres / b[1].runs).slice(0, 1) /* the thinner repeating unit is the sheet; its host repeats between the sheets */.map(([u, e]) => <div key={u} style={{ color: "var(--color-warn-text)" }}>{tr("{unit} is met {r} times in {h} hole(s), up to {max} in one: it repeats down the holes, as stacked sheets (dykes, sills, pegmatites) or a fold or fault do. Its tops and bases all feed one top of {unit} here, which cannot fit them; model sheets with 3D Modelling > Veins / dykes instead.", { unit: u, r: e.runs.toLocaleString(), h: e.holes.toLocaleString(), max: e.maxRuns })}</div>)}{/* #2567 */}
            {orderCheck && orderCheck.against > orderCheck.agree && <div style={{ color: "var(--color-warn-text)" }}>{tr("{a} of {n} logged contacts run the other way: {upper} is logged over {lower} in {k} of them. In this order {lower} is the younger: move {upper} up?", { a: orderCheck.against, n: orderCheck.agree + orderCheck.against, upper: orderCheck.worst.upper, lower: orderCheck.worst.lower, k: orderCheck.worst.n })}</div>}{/* #2408 */}
          </div>}
        </div>
      )}
      {groundCount && (groundCount.pointsOnGround < groundCount.points || groundCount.measurementsOnGround < groundCount.measurements) && ( /* TASKS.csv #2959 */
        <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4, lineHeight: 1.4 }}>
          {tr("Terrain under the inputs: {a} of {n} contact point(s) and {b} of {m} measurement(s). The rest will be placed at the map layer's elevation{z} and the surfaces cut there; a terrain over the whole map (Maps > Terrain) puts them on the ground.", { a: groundCount.pointsOnGround, n: groundCount.points, b: groundCount.measurementsOnGround, m: groundCount.measurements, z: Number.isFinite(Number(layer?.elevation)) ? tr(" (RL {z})", { z: Math.round(Number(layer.elevation)) }) : "" })}
        </div>
      )}
      <button onClick={() => onRun({ layer, field: unitField, order, breaks, bedding, planes, faults: faults.filter((f) => f.on).map((f) => ({ name: f.name, line: f.line, dip: f.dip, dipDir: f.dipDir })), relation, leftOut, holeCodes: useHoles && holeCount > 0 ? codeUnit : null })}
        disabled={busy || !groundAt || order.length < 2 || noOrient} style={{ ...pBtn, justifyContent: "center", opacity: busy || !groundAt || order.length < 2 || noOrient ? 0.5 : 1 }}>
        {busy ? tr("Running…") : tr("Build the model (GemPy)")}
      </button>
      {groundAt && order.length < 2 && !busy && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{order.length === 1 ? tr("Only one unit ({unit}) is in the stratigraphic role: a model needs at least two units in order, one on top of the other. Set another unit's role to stratigraphic above, or build the unit as an intrusion body below.", { unit: order[0] }) : tr("No unit is in the stratigraphic role: a model needs at least two units in order. Set their roles above.")}</div>}{/* TASKS.csv #2086 — Build was disabled with no word */}
      {holeFit && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("No outcrop orientation: each top will get one fitted from its logged contacts ({n} in use), a least-squares plane through its contact points.", { n: holePreview.contacts.length.toLocaleString() })}</div>}{/* #2409 */}
      {noOrient && lithoRows?.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("From drillholes alone: 3D Modelling > Stratigraphic stack or Implicit surface; or tick 'Use the drillholes' logged contacts' above with each code's unit.")}</div>}{/* #2409 */}
      {noOrient && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{allRows.length ? tr("No orientation to build from: none of the {n} outcrop measurement(s) is in a class ticked under 'Orientations from' ({other} are classed Other), and no contact dip could be fitted from the map traces on this terrain. Tick a class above, or give the type codes a class when importing them in Surface Geology.", { n: allRows.length.toLocaleString(), other: allRows.filter((r) => r.cls === "other").length.toLocaleString() }) /* #2266 */ : tr("No orientation to build from: no outcrop measurements, and no contact dip could be fitted from the map traces on this terrain (a contact needs enough relief along its trace). Import outcrop bedding or contact measurements in Surface Geology.")}</div>}{/* #1604 */}
      {/* TASKS.csv #821 — intrusions as bodies */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginTop: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Intrusions as bodies")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 6 }}>
          {tr("Each mapped polygon of a unit in the intrusion role becomes a closed body: its top is the ground, its walls go down from the mapped outline to a flat base. A construction from the map and the settings below, not a fitted model.")}
        </div>
        {!intrusive.length ? (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("No unit is in the intrusion role. Set a unit's role to intrusion above.")}</div>
        ) : (<>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginBottom: 6 }}>
            {intrusive.map((u) => (
              <label key={u} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={!bodyOff[u]} onChange={(e) => setBodyOff((q) => ({ ...q, [u]: !e.target.checked }))} />{u}
              </label>
            ))}
          </div>
          <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Depth below outcrop")}</span>
            <input type="number" min={10} step={50} value={bodyDepth} placeholder={tr("required")} onChange={(e) => setBodyDepth(e.target.value === "" ? "" : Math.max(10, Number(e.target.value) || 10))} style={{ ...sel, width: 70, flex: "none" }} aria-label={tr("Depth below outcrop")} /><span>m</span>
            {deepestLogged && bodyDepth === "" && <button type="button" onClick={() => setBodyDepth(Math.max(10, Math.ceil(deepestLogged.depth / 10) * 10))} style={{ ...sel, width: "auto", flex: "none", cursor: "pointer" }} title={tr("The deepest logged {unit} ends {d} m down hole {hole}: a body to that depth reaches every logged intercept.", { unit: deepestLogged.unit, d: Math.round(deepestLogged.depth), hole: deepestLogged.hole })}>{tr("Use {d} m (deepest logged)", { d: Math.max(10, Math.ceil(deepestLogged.depth / 10) * 10) })}</button>}{/* #2568 */}</div>
          <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Shape")}</span>{/* TASKS.csv #2642 */}
            <select value={bodyShape} onChange={(e) => setBodyShape(e.target.value)} style={sel} aria-label={tr("Body shape")}>
              <option value="plug">{tr("plug or stock (walls all round)")}</option><option value="sheet">{tr("sheet or dyke (both walls dip one way)")}</option>
            </select></div>
          {bodyShape === "sheet" ? (<>
            <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Sheet dip")}</span>
              <input type="number" min={10} max={90} step={1} value={sheetDip} placeholder={tr("required")} onChange={(e) => setSheetDip(e.target.value)} style={{ ...sel, width: 60, flex: "none" }} aria-label={tr("Sheet dip")} /><span>°</span>
              <span style={{ flexShrink: 0 }}>{tr("toward")}</span>
              <input type="number" min={0} max={359} step={1} value={sheetDipDir} placeholder={tr("required")} onChange={(e) => setSheetDipDir(e.target.value)} style={{ ...sel, width: 60, flex: "none" }} aria-label={tr("Sheet dip direction")} /><span>°</span></div>
            {contactOffer && (sheetDip === "" || sheetDipDir === "") && <button type="button" onClick={() => { setSheetDip(String(contactOffer.dip)); setSheetDipDir(String(contactOffer.dipDir)); }} style={{ ...sel, width: "auto", cursor: "pointer", marginBottom: 6 }} title={tr("The mean of the {n} contact readings within {m} m of the ticked units' polygons.", { n: contactOffer.n, m: contactOffer.maxM })}>{tr("Use {dip}° toward {dir}° ({n} contact readings)", { dip: contactOffer.dip, dir: contactOffer.dipDir, n: contactOffer.n })}</button>}
            {fitUnit && lithoRows?.length > 0 && Object.values(codeUnit).includes(fitUnit) /* codeUnit is declared below the hooks above */ && <button type="button" onClick={fitToLogs} disabled={!groundAt} style={{ ...sel, width: "auto", cursor: "pointer", marginBottom: 6 }} /* TASKS.csv #2724 */
              title={tr("Strike from the unit's map outline, dip from where its logged intercepts lie below the ground beside that trace (least squares); fills the two boxes.")}>{tr("Fit to the logged intercepts")}</button>}
            {sheetFit && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: sheetFit.warn ? "var(--color-warn-text)" : "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 6 }}>{sheetFit.text}</div>}
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 6 }}>{tr("Each outline point goes down the sheet's plane: the base is the mapped outline moved down-dip, so both walls dip the same way. Its thickness comes from the map width across the dip, said when it is built.")}</div>
          </>) : (
          <div style={row}><span style={{ width: 120, flexShrink: 0 }}>{tr("Wall dip")}</span>
            <input type="number" min={30} max={90} step={5} value={bodyDip} onChange={(e) => setBodyDip(Math.min(90, Math.max(30, Number(e.target.value) || 90)))} style={{ ...sel, width: 70, flex: "none" }} aria-label={tr("Wall dip")} /><span>°</span>
            <select value={bodyFlare} onChange={(e) => setBodyFlare(e.target.value)} disabled={bodyDip >= 90} style={{ ...sel, opacity: bodyDip >= 90 ? 0.5 : 1 }} aria-label={tr("Wall direction")}>
              <option value="out">{tr("widens with depth")}</option><option value="in">{tr("narrows with depth")}</option>
            </select></div>
          )}
          <button onClick={() => { setBodyMsg(null); Promise.resolve(onBuildBodies?.({ layer, field: unitField, units: bodyUnits, depthM: Number(bodyDepth), wallDip: bodyShape === "sheet" ? 90 : bodyDip, flare: bodyFlare, sheet: bodyShape === "sheet" ? { dip: Number(sheetDip), dipDir: Number(sheetDipDir) } : null /* #2642 */, logs: lithoRows?.length ? { codeUnit, litho: lithoRows } : null /* #2663; plugs and stocks too: #2819 */ })).then((r) => r && setBodyMsg(r)).catch(() => {}); }}
            disabled={!groundAt || !bodyUnits.length || !(Number(bodyDepth) >= 10) || !sheetOk} title={groundAt ? "" : tr("Needs a terrain: the top of each body is the ground. Offline, Geophysics > Block models > Terrain from the model's top makes one.")}
            style={{ ...pBtn, justifyContent: "center", opacity: !groundAt || !bodyUnits.length || !(Number(bodyDepth) >= 10) || !sheetOk ? 0.5 : 1 }}>
            {tr("Build intrusion bodies")}
          </button>
          {bodyMsg && (bodyMsg.failed.length > 0 || bodyMsg.gapFilled) && <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginTop: 4, color: bodyMsg.failed.length ? "var(--color-danger-fg)" : "var(--color-text-muted)" }}>{/* #2569 — kept in the pane */}
            {bodyMsg.failed.length > 0 && tr("{k} polygon(s) could not be built: {list}", { k: bodyMsg.failed.length, list: bodyMsg.failed.slice(0, 3).join(" ") })}
            {bodyMsg.gapFilled && <div style={{ color: "var(--color-text-muted)" }}>{tr("{k} of {n} outline point(s) fell in gaps of the terrain (cells it has no ground for) and took the ground of the nearest outline point that has some.", bodyMsg.gapFilled)}</div>}
          </div>}
        </>)}
      </div>
    </div>
  );
}
