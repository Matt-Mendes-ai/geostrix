import React, { useEffect, useMemo, useRef, useState } from "react"; // useRef: #3016
import { Download } from "./icons.js";
import { colorForLithology, colorForAlteration, colorForVein, colorForWeathering } from "../lib/layers.js";
import { customCodeColour } from "../lib/customColour.js"; // TASKS.csv #1745 — a custom layer's codes in its own colours
import { useStore } from "../lib/store.jsx"; // #1745 — the other interval logs
import { buildFencePanel, panelPointAtDepth, correlationBands, stackCollarLabels, lineFromSection, holesInCorridor, initialFenceSelection, FENCE_MANY, dropOffLineSelection, FENCE_LABEL_SLOTS, FENCE_VE, suggestFenceVe } from "../lib/fence.js"; // stackCollarLabels: #1375; section / corridor / initial: #1552
import { saveFile } from "../lib/desktop.js";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { exportSvgMarkup } from "../lib/svgExport.js"; // TASKS.csv #1089 — font, size, no UI chrome
import { fenceFurniture } from "../lib/figureFurniture.js"; // TASKS.csv #1017
import { lithoPatternMap, loadPatternTiles, patternDefs, patternFill, sectionTilePx } from "../lib/lithoPatterns.js"; // TASKS.csv #1995
import { buildBentPanel } from "../lib/fenceBent.js"; // TASKS.csv #3560 B3
import { numericTrackSources, numericTrackRows, trackFraction } from "../lib/fenceTrack.js"; // TASKS.csv #2786

// TASKS.csv #139 — FENCE / PANEL DIAGRAM (hole-to-hole lithology correlation along a drill line).
//
// Micromine-specialist audit finding. Beyond arbitrary cross-sections, this is the view geologists
// build to correlate specific lithology units hole-to-hole along a drill line — and it is deliberately
// LIGHTER than implicit modelling, not a poor substitute for it. It is the tool for the stage of a
// project BEFORE there is enough data for GemPy to produce anything trustworthy: three holes on a line
// cannot support an implicit surface, but they can absolutely support "the basalt top drops 40 m to the
// east between 17HR-282 and 17HR-278", and that observation is what the next hole gets sited on.
//
// Follows DownholeStructurePlot.jsx (#277) throughout rather than inventing a second convention:
// the same inline-SVG rendering with a controls column on the right (the shell is StepDialog's since #4073, with its Esc and focus trap, #238), same Export SVG via saveFile. The projection math is in src/lib/fence.js so it
// could be verified in Node against hand-worked geometry first — see the #139 notes.
//
// ================= HOW OFF-LINE HOLES ARE HANDLED (the honest bit) =================
// Holes are essentially never collinear, and a fence diagram is a flattening of 3D onto one vertical
// plane. Every hole's perpendicular distance from that plane is error that the picture silently
// absorbs: a hole 80 m off the line is DRAWN as though it sat on the line, so a contact correlated
// through it carries 80 m of horizontal fiction. The decision here is to make that visible rather than
// smooth it away, in four places:
//   1. The section line is the TOTAL-LEAST-SQUARES principal axis of the selected collars (rotation-
//      invariant, defined for a north-south drill line where an ordinary y-on-x regression is not), or
//      an azimuth the user types when they have a specific section in mind.
//   2. Every hole's signed perpendicular offset is printed under its label, on the diagram itself —
//      not buried in a tooltip. Holes beyond the (adjustable) offset limit are highlighted amber and
//      can be excluded from the panel in one click.
//   3. An OFFSET RIBBON runs along the top of the panel: each hole's offset drawn to the same
//      horizontal scale as the section itself, so "40 m off a 300 m line" looks like what it is.
//   4. The whole TRACE is projected, not just the collar. An inclined hole wanders in plan as it goes
//      down, so its toe is usually further off-section than its collar; drawing a vertical bar under
//      the collar would misplace every deep contact. Each trace vertex is projected independently, so
//      a hole leans across the panel exactly as it does in the ground, and the reported offset is the
//      MAXIMUM along the hole, not the collar's.
// What this tool will NOT do is quietly redraw geometry to make the section look tidier.
//
// CORRELATION BANDS are drawn only between ADJACENT holes, for the SAME lithology code, using each
// hole's SHALLOWEST occurrence of that code. A correlation is an interpretation, not a measurement;
// matching up repeated units (fault repetition, interbedding) is a judgement this tool has no business
// making silently, so it draws the one defensible band and leaves the rest to the geologist. They are
// off by default for that reason.
// TASKS.csv #3016 (WA iron review) — areaIds: the Model area's checked holes (a Set) or null. The fence opens on them (a 12 km fence of 594 of
// 6,390 holes opened on a 228-hole Model area); every hole stays in the list. It opens at the exaggeration it proposes (suggestFenceVe).
// TASKS.csv #4073 — on the shared StepDialog: 1 Holes (the line and the holes, pre-selected as below, so it opens on step 2), 2 Panel (the figure, its
// display settings and the panel in numbers; Export SVG). How to read it is in the Help card.
export default function FenceDiagramModal({ traces = [], litho = [], labelFor = null, patternOverride = null, sections = [], areaIds = null, onClose }) { // labelFor, patternOverride: #1995; sections: #1552

  const allIds = useMemo(
    () => (traces || []).filter((t) => t?.wx?.length).map((t) => t.hole_id).sort(),
    [traces]
  );
  // TASKS.csv #1552 — more than 40 holes: open along the latest saved section (its corridor's holes) when there is one, else on the
  // holes near a line fitted through them; never on every hole in the district
  const usableSections = useMemo(() => (sections || []).filter((s) => lineFromSection(s)), [sections]);
  const [initial] = useState(() => {
    const pool = areaIds?.size ? (traces || []).filter((t) => areaIds.has(t.hole_id)) : traces || []; // #3016
    const many = pool.filter((t) => t?.wx?.length > 1).length > FENCE_MANY;
    const last = usableSections[usableSections.length - 1];
    if (many && last) {
      const ids = holesInCorridor(pool, lineFromSection(last), Number(last.corridor) || 100);
      if (ids.length >= 2) return { ids, trimmed: 0, sectionId: last.id };
    }
    return initialFenceSelection(pool, 100);
  });
  const [selected, setSelected] = useState(() => new Set(initial.ids));
  const [step, setStep] = useState(() => (initial.ids.length >= 2 ? 1 : 0)); // TASKS.csv #4073 — the holes are pre-selected: open on the panel, Holes one click back
  const [azMode, setAzMode] = useState(initial.sectionId ? "section" : "fit"); // "fit" | "manual" | "section" (#1552)
  const [sectionId, setSectionId] = useState(initial.sectionId || "");
  const pickSection = (id) => { // its line, and the holes in its corridor
    const s = usableSections.find((x) => x.id === id) || usableSections[usableSections.length - 1];
    if (!s) return;
    setSectionId(s.id); setAzMode("section");
    const ids = holesInCorridor(traces, lineFromSection(s), Number(s.corridor) || 100);
    setSelected(new Set(ids));
  };
  const sectionLine = useMemo(() => (azMode === "section" ? lineFromSection(usableSections.find((x) => x.id === sectionId)) : null), [azMode, sectionId, usableSections]);
  const [manualAz, setManualAz] = useState("90");
  const [ve, setVeState] = useState(1); // vertical exaggeration
  const veChosen = useRef(false), setVe = (v) => { veChosen.current = true; setVeState(v); }; // #3016 — until the user picks one, the proposed one
  const [showBands, setShowBands] = useState(false);
  const [offsetLimit, setOffsetLimit] = useState(100); // metres; beyond this a hole is flagged
  const [colWidth, setColWidth] = useState(9); // px half-width of each lithology column
  // TASKS.csv #1995 — FGDC lithology patterns over the columns, each code's pattern as in the strip log (where it is chosen); a per-user
  // preference, on by default like the strip log's
  const [patternsOn, setPatternsOnState] = useState(() => { try { return localStorage.getItem("geostrix.fencePatterns") !== "0"; } catch { return true; } });
  const setPatternsOn = (on) => { setPatternsOnState(on); try { localStorage.setItem("geostrix.fencePatterns", on ? "1" : "0"); } catch { /* private window */ } };
  const patternByCode = useMemo(() => lithoPatternMap(litho, (v) => (labelFor ? labelFor("litho", v) : v), patternOverride), [litho, labelFor, patternOverride]);
  const [tiles, setTiles] = useState({});
  // TASKS.csv #1745 / #2426 — which interval log the columns (and the correlation bands) show: Lithology only, it joined sand to sand
  // across units on a palaeochannel whose stratigraphic unit is a custom layer
  const { layers: storeLayers = {}, customLayers = [], assays = [], assayElements = [], project: fenceProject } = useStore() || {}; // assays: #2786; project: #3573
  const showSources = useMemo(() => [
    { key: "litho", label: tr("Lithology") },
    ...((storeLayers.alt || []).length ? [{ key: "alt", label: tr("Alteration") }] : []),
    ...((storeLayers.vein || []).length ? [{ key: "vein", label: tr("Veins") }] : []),
    ...((storeLayers.weath || []).length ? [{ key: "weath", label: tr("Weathering") }] : []),
    ...customLayers.filter((c) => (c.rows || []).some((r) => r.value != null && r.value !== "" && !Number.isFinite(Number(r.value)))).map((c) => ({ key: `custom:${c.id}`, label: c.name, layer: c })),
  ], [storeLayers.alt, storeLayers.vein, storeLayers.weath, customLayers]);
  const [show, setShow] = useState("litho");
  const showSrc = showSources.find((x) => x.key === show) || showSources[0];
  const shownRows = show === "litho" || !showSrc || showSrc.key === "litho" ? litho : showSrc.layer ? showSrc.layer.rows || [] : storeLayers[showSrc.key] || [];
  const colorOf = (v) => (showSrc?.key === "alt" ? colorForAlteration(v) : showSrc?.key === "vein" ? colorForVein(v) : showSrc?.key === "weath" ? colorForWeathering(v) : showSrc?.layer ? customCodeColour(showSrc.layer, "value", v) : colorForLithology(v));

  // TASKS.csv #2786 — a numeric track beside each column: an assay element or a numeric log, one scale for the panel (lib/fenceTrack.js)
  const trackSources = useMemo(() => numericTrackSources({ layers: storeLayers, customLayers, assays, assayElements, displayUnits: fenceProject?.displayUnits }, tr), [storeLayers, customLayers, assays, assayElements, fenceProject?.displayUnits]);
  const [trackKey, setTrackKey] = useState("");
  const [trackLog, setTrackLog] = useState(false); // #2813 — a log scale for skewed values (gamma, grades)
  const trackSrc = trackSources.find((x) => x.key === trackKey) || null;

  const chosen = useMemo(
    () => (traces || []).filter((t) => t?.wx?.length > 1 && selected.has(t.hole_id)),
    [traces, selected]
  );

  const panel = useMemo(() => {
    if (azMode === "through") return buildBentPanel(traces, [...selected]) || buildFencePanel(chosen, {}); // #3560 B3 — the ticked holes in the order ticked, unfolded
    if (sectionLine) return buildFencePanel(chosen, { line: sectionLine }); // #1552
    const az = azMode === "manual" ? Number(manualAz) : null;
    return buildFencePanel(chosen, Number.isFinite(az) ? { azimuth: az } : {});
  }, [chosen, azMode, manualAz, sectionLine, traces, selected]);
  useEffect(() => { if (!veChosen.current && panel) setVeState(Math.max(1, suggestFenceVe(panel.sRange, panel.zRange))); }, [panel]); // #3016 — the proposed exaggeration, until one is picked

  const track = useMemo(() => (trackSrc && panel ? numericTrackRows(trackSrc, panel.holes.map((h) => h.hole_id), assays, { log: trackLog }) : null), [trackSrc, panel, assays, trackLog]);
  const TRACK_PX = 26; // the track's full width, px

  const lithoByHole = useMemo(() => {
    const m = {};
    (shownRows || []).forEach((r) => { // #1745 — the chosen log
      if (r.from == null || r.to == null || isNaN(r.from) || isNaN(r.to)) return;
      (m[r.hole_id] = m[r.hole_id] || []).push({ value: r.value, from: Number(r.from), to: Number(r.to) });
    });
    Object.values(m).forEach((rows) => rows.sort((a, b) => a.from - b.from));
    return m;
  }, [shownRows]);

  const codes = useMemo(() => {
    const set = new Set();
    (panel?.holes || []).forEach((h) => (lithoByHole[h.hole_id] || []).forEach((r) => {
      const v = String(r.value ?? "").trim(); if (v) set.add(v);
    }));
    return Array.from(set).sort();
  }, [panel, lithoByHole]);
  const fencePatternCodes = useMemo(() => [...new Set(codes.map((c) => patternByCode[c]).filter((p) => p != null))].sort().join(","), [codes, patternByCode]);
  useEffect(() => {
    if (!patternsOn || !fencePatternCodes) return undefined;
    let live = true;
    loadPatternTiles(fencePatternCodes.split(",").map(Number)).then((t) => { if (live) setTiles(t); });
    return () => { live = false; };
  }, [patternsOn, fencePatternCodes]);
  const patternOf = (v) => { if (showSrc && showSrc.key !== "litho") return null; const p = patternByCode[v]; return patternsOn && p != null && tiles[p] ? patternFill(p, colorForLithology(v)) : null; }; // FGDC patterns are lithology's only (#1745)

  // ---- layout ----
  const PLOT_W = 760, PLOT_H = 430, RIBBON_H = 34;
  const PAD_L = 56, PAD_T = 22 + RIBBON_H, PAD_R = 16, PAD_B = 40;
  const W = PAD_L + PLOT_W + PAD_R, H = PAD_T + PLOT_H + PAD_B;

  const view = useMemo(() => {
    if (!panel) return null;
    // Pad the section-length range so the outermost holes' columns aren't clipped at the frame edge.
    const sPad = Math.max(10, (panel.sRange.max - panel.sRange.min) * 0.06);
    const s0 = panel.sRange.min - sPad, s1 = panel.sRange.max + sPad;
    const zPad = Math.max(5, (panel.zRange.max - panel.zRange.min) * 0.05);
    const z0 = panel.zRange.min - zPad;
    let z1 = panel.zRange.max + zPad;
    const sSpan = Math.max(1e-6, s1 - s0);
    // TRUE SCALE by default: one metre along section is one metre of elevation, so a 60° hole is drawn
    // at 60° and a geologist can measure a dip off the page. Vertical exaggeration is opt-in and
    // labelled on the diagram, because an unlabelled VE is how people misread dips off a section.
    let sPerPx = Math.max(sSpan / PLOT_W, ((z1 - z0) * ve) / PLOT_H);
    // TASKS.csv #1375 — room above the collars for a stack of fan-hole labels (19 px a label): Silvertip's four PAD42 labels ran up
    // into the offset ribbon. The tallest stack, from the collars as drawn at the first scale.
    const slots = stackCollarLabels(panel.holes.map((h) => ({ id: h.hole_id, x: h.pts[0].s / sPerPx, y: (-h.pts[0].z * ve) / sPerPx })), { dx: 52 }); // #3900: a 10 px id is about 52 px wide (40 was set for 8.6 px)
    const need = 26 + 19 * Math.min(FENCE_LABEL_SLOTS - 1, Math.max(0, ...Object.values(slots))); // #2327 — a stack of at most three labels
    const topCollar = Math.max(...panel.holes.map((h) => h.pts[0].z));
    const room = ((z1 - topCollar) * ve) / sPerPx;
    if (room < need) { z1 += ((need - room) * sPerPx) / ve * 1.1; sPerPx = Math.max(sSpan / PLOT_W, ((z1 - z0) * ve) / PLOT_H); }
    const xFor = (s) => PAD_L + PLOT_W / 2 + (s - (s0 + s1) / 2) / sPerPx;
    const yFor = (z) => PAD_T + PLOT_H / 2 - ((z - (z0 + z1) / 2) * ve) / sPerPx;
    return { xFor, yFor, sPerPx, s0, s1, z0, z1 };
  }, [panel, ve]);

  const bands = useMemo(() => {
    if (!showBands || !panel) return [];
    const out = [];
    for (let i = 0; i < panel.holes.length - 1; i++) {
      correlationBands(panel.holes[i], panel.holes[i + 1], lithoByHole).forEach((b) => out.push(b));
    }
    return out;
  }, [showBands, panel, lithoByHole]);

  const svgRef = React.useRef(null);
  const exportSvg = () => {
    if (!svgRef.current) return;
    saveFile({
      suggestedName: "fence_diagram.svg",
      filters: [{ name: "SVG", extensions: ["svg"] }],
      // TASKS.csv #1048 — the title, the holes, the section line and the lithology key, drawn into the file
      content: exportSvgMarkup(svgRef.current, { furniture: panel ? fenceFurniture({ holeIds: panel.holes.map((h) => h.hole_id), azimuth: panel.line.azimuth, fitted: azMode === "fit", ve, offsetLimit, bands: showBands, codes, colorOf, patternOf, keyTitle: showSrc?.label, /* #1745 */ date: new Date().toISOString().slice(0, 10) }) : null }).markup, encoding: "text", // #1017 — in lib, tested
    });
  };

  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  // TASKS.csv #2064 — refit while dropping, and never down to one hole
  const [dropNote, setDropNote] = useState(null);
  const dropOffLine = () => {
    if (!panel) return;
    const az = azMode === "manual" ? Number(manualAz) : null;
    const r = dropOffLineSelection(chosen, offsetLimit, sectionLine ? { line: sectionLine } : Number.isFinite(az) ? { azimuth: az } : {});
    if (!r) { setDropNote(tr("No two of these holes lie within {m} m of one line: they are on separate prospects or lines. Tick one prospect's holes, or draw the panel along a saved section.", { m: offsetLimit })); return; }
    setDropNote(null);
    setSelected(new Set(r.ids));
  };

  const offHoles = (panel?.holes || []).filter((h) => h.maxAbsOffset > offsetLimit);
  const zTicks = useMemo(() => {
    if (!view) return [];
    const span = view.z1 - view.z0;
    const pow = Math.pow(10, Math.floor(Math.log10(span / 6 || 1)));
    const stepZ = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= 9) || pow * 10;
    const out = [];
    for (let z = Math.ceil(view.z0 / stepZ) * stepZ; z <= view.z1; z += stepZ) out.push(Math.round(z * 100) / 100);
    return out;
  }, [view]);

  const heading = tr("Fence / panel diagram");
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-accent-dark)", marginBottom: 6, cursor: "pointer" }}>{tr("Reading this panel")}</summary>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 }}>{tr("Horizontal is distance along the section line, vertical is elevation. Each whole trace is projected, so inclined holes lean as in the ground. The number under each collar is the hole's largest distance off the section plane: the error of this flattening.")}</div>
    </details>
  );
  if (!allIds.length) {
    return <StepDialog title={heading} onClose={onClose} help={help} width="min(560px, 96vw)" at={0} onAt={() => {}}
      steps={[{ key: "none", label: heading, render: () => <div style={{ ...sheet, fontSize: "var(--font-size-base)", color: "#55606e", lineHeight: 1.6 }}>{tr("No desurveyed holes yet. Import collars and survey data (and a lithology layer) and this panel will fill in.")}</div>, primary: { label: tr("Close"), onClick: onClose } }]} />;
  }
  const holesStep = (
    <div style={{ ...sheet, flex: 1, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 260px", minWidth: 240, display: "flex", flexDirection: "column", gap: 9 }}>
        <label style={rowLabel} title={tr("Best fit: the principal (total-least-squares) axis of the selected collars. Unlike a y-on-x regression, it works for a north-south line and ignores map rotation.")}>{tr("Section line")}<select value={azMode} onChange={(e) => (e.target.value === "section" ? pickSection(sectionId) : setAzMode(e.target.value))} style={sel}>
            <option value="fit">{tr("Best fit through collars")}</option>
            <option value="manual">{tr("Fixed azimuth…")}</option>
            <option value="through">{tr("Through the ticked holes, in order")}</option>{/* #3560 B3 */}
            {usableSections.length > 0 && <option value="section">{tr("Along a saved section…")}</option>}{/* #1552 */}
          </select>
        </label>
        {azMode === "through" && <div style={warnNote}>{tr("Holes are joined in the order you tick them, collar to collar in plan, and drawn unfolded along that bent line. Untick and tick again to change the order.")}</div>}{/* #3560 B3 */}
        {azMode === "section" && (
          <label style={rowLabel} title={tr("The section's own line from its start, with the holes mostly inside its corridor (at least half the hole). Tick or untick holes below.")}>{tr("Section")}
            <select value={sectionId} onChange={(e) => pickSection(e.target.value)} style={sel}>
              {usableSections.map((s) => <option key={s.id} value={s.id}>{tr("{name} (±{corridor} m)", { name: s.name || s.id, corridor: Number(s.corridor) || 100 })}</option>)}
            </select>
          </label>
        )}
        {initial.sectionId && azMode === "section" && sectionId === initial.sectionId && (
          <div style={small}>{tr("This project has {n} holes, so the panel opened along the latest saved section, on the holes in its corridor.", { n: allIds.length })}</div>
        )}
        {initial.trimmed > 0 && azMode === "fit" && (
          <div style={small}>{initial.site ? tr("Opened on {k} holes of the largest drill site's fan ({site} holes from one collar position, within 100 m of a line): one fan, one panel. {n} others are below, unticked.", { k: initial.ids.length, site: initial.site, n: initial.trimmed }) /* #2220 */ : tr("Opened on {k} holes that lie within 100 m of a line fitted through them; {n} others are in the list below, unticked.", { k: initial.ids.length, n: initial.trimmed })}{usableSections.length ? " " + tr("Or draw the panel along a saved section.") : " " + tr("Or draw a cross-section in StrixViewer first and use it here.")}</div>
        )}
        {azMode === "manual" && (
          <label style={rowLabel}>{tr("Azimuth (°)")}<input value={manualAz} onChange={(e) => setManualAz(e.target.value)} style={sel} />
          </label>
        )}
        {areaIds?.size > 0 && <div style={small}>{tr("Opened on the Model area's {n} checked holes (Model settings); the others are in the list below.", { n: areaIds.size })}</div>}{/* #3016 */}
        <label style={rowLabel} title={tr("Holes whose maximum perpendicular distance from the section plane exceeds this are flagged amber on the diagram and in the list below.")}>{tr("Flag holes over")}<select value={offsetLimit} onChange={(e) => setOffsetLimit(Number(e.target.value))} style={sel}>
            {[25, 50, 100, 200, 500].map((v) => <option key={v} value={v}>{tr("{v} m off section", { v })}</option>)}
          </select>
        </label>
        {offHoles.length > 0 && (
          <div style={warnNote}>
            {tr(offHoles.length === 1 ? "{offHoles} hole is more than {offsetLimit} m off the section plane and is drawn as if on it. Any contact correlated through it carries that much horizontal error." : "{offHoles} holes are more than {offsetLimit} m off the section plane and are drawn as if on it. Any contact correlated through them carries that much horizontal error.", { offHoles: offHoles.length, offsetLimit })}<button onClick={dropOffLine} className="gs-btn gs-btn--sm" style={{ marginTop: 5 }}>{tr("Drop them from the panel")}</button>{dropNote && <div style={{ marginTop: 4 }}>{dropNote}</div>}{/* #2064 */}
          </div>
        )}
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: "var(--font-size-xs)", color: "#55606e", fontWeight: 600 }}>{tr("Holes ({size}/{allIds})", { size: selected.size, allIds: allIds.length })}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setSelected(new Set(allIds))} className="gs-btn gs-btn--sm">{tr("All")}</button>
          <button onClick={() => setSelected(new Set())} className="gs-btn gs-btn--sm">{tr("None")}</button>
        </div>
        <div style={{ maxHeight: 300, minHeight: 90, flexShrink: 0, overflow: "auto", border: "1px solid #e0e3e8", borderRadius: 5, padding: "4px 6px" }}>{/* #1552 — it shrank to two rows when the column filled */}
          {allIds.map((id) => {
            const h = panel?.holes.find((x) => x.hole_id === id);
            const over = h && h.maxAbsOffset > offsetLimit;
            return (
              <label key={id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-xs)", color: over ? "#a8741a" : "#1a2028", padding: "1px 0" }}>
                <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</span>
                {h && <span style={{ color: over ? "#a8741a" : "#65717e", fontSize: "var(--font-size-xs)" }}>{h.maxAbsOffset.toFixed(0)}m</span>}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
  const panelStep = (
    <div style={{ ...sheet, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div>
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: "#fbfbfc", border: "1px solid #d9dce1", borderRadius: 8 }}>
              {patternsOn && Object.keys(tiles).length > 0 && <defs dangerouslySetInnerHTML={{ __html: patternDefs(tiles, sectionTilePx(colWidth)) }} />}{/* #1995 — shapes only (lithoPatterns.sanitizeTile) */}
              <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#ffffff" stroke="#d9dce1" strokeWidth={1} />
              {view && zTicks.map((z) => (
                <g key={`z${z}`}>
                  <line x1={PAD_L} y1={view.yFor(z)} x2={PAD_L + PLOT_W} y2={view.yFor(z)} stroke="#f0f2f4" strokeWidth={1} />
                  <text x={PAD_L - 5} y={view.yFor(z) + 3.5} textAnchor="end" fontSize={10} fill="#55606e">{z}</text>
                </g>
              ))}
              <text x={10} y={PAD_T - 6} fontSize={10} fill="#55606e">RL (m)</text>
              <text x={PAD_L + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#55606e">
                {tr("Distance along section (m) — bearing {v}°", { v: panel ? panel.line.azimuth.toFixed(1) : "—" })}
              </text>

              {/* ---- OFFSET RIBBON: how far each hole really is off the section plane, drawn to the
                      SAME horizontal scale as the section, so the distortion is visible as distance
                      rather than hidden in a number. Centre line = the section plane itself. ---- */}
              {view && panel && (
                <g>
                  <rect x={PAD_L} y={22} width={PLOT_W} height={RIBBON_H - 6} fill="#f7f8fa" stroke="#e6e8ec" strokeWidth={1} />
                  <line x1={PAD_L} y1={22 + (RIBBON_H - 6) / 2} x2={PAD_L + PLOT_W} y2={22 + (RIBBON_H - 6) / 2} stroke="#c7ccd3" strokeWidth={1} strokeDasharray="4 3" />
                  <text x={PAD_L + 4} y={22 - 3} fontSize={10} fill="#65717e">{tr("Offset from section plane (same scale as the section)")}</text>
                  {panel.holes.map((h) => {
                    const cy = 22 + (RIBBON_H - 6) / 2;
                    const dy = Math.max(-(RIBBON_H - 8) / 2, Math.min((RIBBON_H - 8) / 2, h.offset / view.sPerPx));
                    const over = h.maxAbsOffset > offsetLimit;
                    return (
                      <g key={`ro_${h.hole_id}`}>
                        <line x1={view.xFor(h.s)} y1={cy} x2={view.xFor(h.s)} y2={cy - dy} stroke={over ? "#c98a1f" : "#7d8a9a"} strokeWidth={1.2} />
                        <circle cx={view.xFor(h.s)} cy={cy - dy} r={2.4} fill={over ? "#c98a1f" : "#55606e"}>
                          <title>{tr("{hole_id}: collar {offset} m off section, max {maxAbsOffset} m along the hole", { hole_id: h.hole_id, offset: h.offset.toFixed(1), maxAbsOffset: h.maxAbsOffset.toFixed(1) })}</title>
                        </circle>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* ---- correlation bands, behind the holes ---- */}
              {view && bands.map((b, i) => (
                <path
                  key={`band_${i}`}
                  d={`M ${view.xFor(b.aTop.s)} ${view.yFor(b.aTop.z)} L ${view.xFor(b.bTop.s)} ${view.yFor(b.bTop.z)} L ${view.xFor(b.bBot.s)} ${view.yFor(b.bBot.z)} L ${view.xFor(b.aBot.s)} ${view.yFor(b.aBot.z)} Z`}
                  fill={colorOf(b.code)} opacity={0.16} stroke={colorOf(b.code)} strokeWidth={0.6} strokeOpacity={0.5}
                ><title>{tr("{code} correlated between adjacent holes (shallowest occurrence in each) — an interpretation, not a measurement", { code: b.code })}</title></path>
              ))}

              {view && panel && track && panel.holes.map((h) => <g key={`tk_${h.hole_id}`}>{(track.byHole[h.hole_id] || []).length > 0 && (() => { // #2786 — the numeric track, on the +normal side of each column; drawn before the columns so a close neighbour's bars never cover them
                      const at = (d) => panelPointAtDepth(h, d);
                      const side = (a, b) => { const dx = view.xFor(b.s) - view.xFor(a.s), dy = view.yFor(b.z) - view.yFor(a.z), L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L]; };
                      const tRows = track.byHole[h.hole_id], base = colWidth + 1.5;
                      if (track.points) {
                        const pts = [];
                        for (const r of tRows) {
                          const p = at(r.at), next = at(r.at + 1), prev = next ? null : at(r.at - 1);
                          if (!p || (!next && !prev)) continue;
                          const [nx, ny] = next ? side(p, next) : side(prev, p), off = base + TRACK_PX * trackFraction(r.v, track.lo, track.hi, track.log); // the downhole direction either way
                          pts.push(`${(view.xFor(p.s) + nx * off).toFixed(1)},${(view.yFor(p.z) + ny * off).toFixed(1)}`);
                        }
                        return pts.length > 1 ? <polyline points={pts.join(" ")} fill="none" stroke="#7d3c98" strokeWidth={1} style={{ pointerEvents: "none" }} /> : null;
                      }
                      return tRows.map((r, i) => {
                        const a = at(r.from), b = at(r.to);
                        if (!a || !b) return null;
                        const [nx, ny] = side(a, b), len = TRACK_PX * trackFraction(r.v, track.lo, track.hi, track.log);
                        const x1 = view.xFor(a.s), y1 = view.yFor(a.z), x2 = view.xFor(b.s), y2 = view.yFor(b.z);
                        const quad = `M ${x1 + nx * base} ${y1 + ny * base} L ${x2 + nx * base} ${y2 + ny * base} L ${x2 + nx * (base + len)} ${y2 + ny * (base + len)} L ${x1 + nx * (base + len)} ${y1 + ny * (base + len)} Z`;
                        return <path key={`t_${i}`} d={quad} fill="#7d3c98" opacity={0.75}><title>{`${h.hole_id} — ${trackSrc.label} ${r.v}  ${r.from}–${r.to} m`}</title></path>;
                      });
                    })()}</g>)}
              {/* ---- each hole: its projected trace, then its lithology intervals as a column ---- */}
              {view && panel && (() => { const slots = stackCollarLabels(panel.holes.map((h) => ({ id: h.hole_id, x: view.xFor(h.pts[0].s), y: view.yFor(h.pts[0].z) })), { dx: 52 }); /* #3900 */ return panel.holes.map((h) => {
                const lift = 23 * (slots[h.hole_id] || 0); /* #3900: a 10 px id and sub-label are 21 px tall (was 19) */ // #1375 — fan holes from one collar: their labels stacked, not printed over each other
                const labelled = (slots[h.hole_id] || 0) < FENCE_LABEL_SLOTS; // #2327 — past three in a stack: the name on hover only
                const rows = lithoByHole[h.hole_id] || [];
                const over = h.maxAbsOffset > offsetLimit;
                const traceD = h.pts.map((p, i) => `${i ? "L" : "M"} ${view.xFor(p.s)} ${view.yFor(p.z)}`).join(" ");
                return (
                  <g key={`h_${h.hole_id}`}>
                    <path d={traceD} fill="none" stroke="#98a3b2" strokeWidth={0.9} />
                    {rows.map((r, i) => {
                      const a = panelPointAtDepth(h, r.from), b = panelPointAtDepth(h, r.to);
                      if (!a || !b) return null;
                      const x1 = view.xFor(a.s), y1 = view.yFor(a.z), x2 = view.xFor(b.s), y2 = view.yFor(b.z);
                      // Draw the interval as a quad perpendicular to the local trace direction, so the
                      // column follows the hole instead of standing vertically beside it.
                      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
                      const nx = (-dy / L) * colWidth, ny = (dx / L) * colWidth;
                      const quad = `M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny} L ${x2 - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`, pat = patternOf(r.value);
                      return (
                        <g key={`i_${i}`}>
                          <path d={quad} fill={colorOf(r.value)} opacity={0.92} stroke="#ffffff" strokeWidth={0.3}
                          ><title>{`${h.hole_id} — ${r.value}  ${r.from}–${r.to} m`}</title></path>
                          {pat && <path d={quad} fill={pat} style={{ pointerEvents: "none" }} />}{/* #1995 — white lines on a dark colour */}
                        </g>
                      );
                    })}
                    <circle cx={view.xFor(h.pts[0].s)} cy={view.yFor(h.pts[0].z)} r={2.6} fill="#1a2028"><title>{`${h.hole_id} — ${h.maxAbsOffset.toFixed(0)} m off section`}</title></circle>
                    {labelled && <text x={view.xFor(h.pts[0].s)} y={view.yFor(h.pts[0].z) - 15 - lift} textAnchor="middle" fontSize={10} fill="#1a2028">{h.hole_id}</text>} {/* #3900: 10 px, the id a little higher over its 10 px sub-label */}
                    {/* Offset printed ON the diagram, per hole — the projection's error bar, not a footnote. */}
                    {labelled && <text x={view.xFor(h.pts[0].s)} y={view.yFor(h.pts[0].z) - 4 - lift} textAnchor="middle" fontSize={10} fill={over ? "#a8741a" : "#65717e"}>
                      {h.maxAbsOffset < 0.05 ? tr("on section") : `${h.maxAbsOffset.toFixed(0)} m off`}
                    </text>}
                  </g>
                );
              }); })()}
              {track && track.n > 0 && <text x={PAD_L} y={H - 22} fontSize={10} fill="#7d3c98">{track.log ? tr(track.below === 0 ? "Track: {name}, log scale from {lo} to {hi}" : track.below === 1 ? "Track: {name}, log scale from {lo} to {hi}; {n} value at or under {lo} is drawn at zero width" : "Track: {name}, log scale from {lo} to {hi}; {n} values at or under {lo} are drawn at zero width", { name: trackSrc.label, lo: Number(track.lo.toPrecision(3)).toLocaleString(undefined, { maximumFractionDigits: 10 }), hi: Number(track.hi.toPrecision(3)).toLocaleString(), n: track.below.toLocaleString() }) /* #2813 */
                : track.above === 0 ? tr("Track: {name}, the full width is {hi} (the 98th percentile of the panel's values)", { name: trackSrc.label, hi: Number(track.hi.toPrecision(3)).toLocaleString() })
                : tr(track.above === 1 ? "Track: {name}, the full width is {hi} (the 98th percentile of the panel's values); {n} higher value is drawn at full width" : "Track: {name}, the full width is {hi} (the 98th percentile of the panel's values); {n} higher values are drawn at full width", { name: trackSrc.label, hi: Number(track.hi.toPrecision(3)).toLocaleString(), n: track.above.toLocaleString() })}</text>}{/* #2786 */}
            </svg>
      </div>
      <div style={{ width: 210, display: "flex", flexDirection: "column", gap: 9, maxHeight: "68vh", overflow: "auto" }}>
        {panel && <div role="table" style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 10, rowGap: 3, fontSize: "var(--font-size-sm)" }}>{/* #4073 — the panel in numbers (StepPane's StepNumbers, in this figure's own colours) */}
          {[[tr("Holes"), String(panel.holes.length)], [tr("Bearing"), `${panel.line.azimuth.toFixed(1)}°`], [tr("Vertical scale"), ve === 1 ? tr("1× (true scale)") : `${ve}×`], offHoles.length > 0 && [tr("Flag holes over"), `${offHoles.length}`]].filter(Boolean).map(([k, v]) => (
            <React.Fragment key={k}><span role="rowheader" style={{ color: "#55606e" }}>{k}</span><span role="cell" style={{ fontWeight: 600, textAlign: "end", color: "#1a2028" }}>{v}</span></React.Fragment>
          ))}
        </div>}
        {showSources.length > 1 && <label style={rowLabel} title={tr("The interval log drawn in the columns; the correlation bands join its codes.")}>{tr("Show")}<select value={showSrc?.key || "litho"} onChange={(e) => setShow(e.target.value)} style={sel} aria-label={tr("Log shown in the columns")}>
            {showSources.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>}{/* #1745 / #2426 */}
        {trackSources.length > 0 && <label style={rowLabel} title={tr("An assay element or a numeric log beside each column, on the hole's own depth: bars for intervals, a line for point readings. One scale for the whole panel.")}>{tr("Numeric track")}<select value={trackSrc?.key || ""} onChange={(e) => setTrackKey(e.target.value)} style={sel} aria-label={tr("Numeric track")}>
            <option value="">{tr("— none —")}</option>
            {trackSources.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>}
        {track && track.positive >= 2 && <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }} title={tr("Log scale from the 2nd percentile of the positive values to the highest, for skewed values such as gamma or grades.")}>
          <input type="checkbox" checked={trackLog} onChange={(e) => setTrackLog(e.target.checked)} />{tr("Log scale")}
        </label>}{/* #2813 */}
        {track && track.n === 0 && <div style={warnNote}>{tr("No {name} values in the selected holes.", { name: trackSrc.label })}</div>}{/* #2786 */}
        <label style={rowLabel} title={tr("1x is true scale — a 60° hole is drawn at 60° and you can measure a dip off the page. Any other value is labelled on the diagram itself.")}>{tr("Vertical scale")}<select value={ve} onChange={(e) => setVe(Number(e.target.value))} style={sel}>
            {FENCE_VE.map((v) => <option key={v} value={v}>{v === 1 ? tr("1× (true scale)") : `${v}× exaggerated`}</option>)}{/* #2426 — up to 50× for a shallow flat deposit */}
          </select>
        </label>
        {panel && suggestFenceVe(panel.sRange, panel.zRange) > ve && <div style={small}>{tr("This section is {r} times longer than the holes are deep: {v}× makes the columns readable.", { r: Math.round((panel.sRange.max - panel.sRange.min) / Math.max(1e-6, panel.zRange.max - panel.zRange.min)), v: suggestFenceVe(panel.sRange, panel.zRange) })}{" "}<button onClick={() => setVe(suggestFenceVe(panel.sRange, panel.zRange))} className="gs-btn gs-btn--sm">{tr("Use {v}×", { v: suggestFenceVe(panel.sRange, panel.zRange) })}</button></div>}{/* #2426 */}
        <label style={rowLabel}>{tr("Column width")}<select value={colWidth} onChange={(e) => setColWidth(Number(e.target.value))} style={sel}>
            {[5, 7, 9, 13, 18].map((v) => <option key={v} value={v}>{tr("{v} px", { v })}</option>)}
          </select>
        </label>
        {fencePatternCodes && <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }} title={tr("FGDC lithology patterns over the columns, each code's pattern as in its strip log (chosen there).")}>
          <input type="checkbox" checked={patternsOn} onChange={(e) => setPatternsOn(e.target.checked)} />{tr("Lithology patterns (FGDC)")}
        </label>}
        <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }} title={tr("Joins the shallowest occurrence of each shared lithology code between ADJACENT holes only. This is an interpretation, not a measurement — off by default.")}>
          <input type="checkbox" checked={showBands} onChange={(e) => setShowBands(e.target.checked)} />{" "}{tr("Correlation bands")}</label>
        {codes.length > 0 && (
          <>
            <div style={{ fontSize: "var(--font-size-xs)", color: "#55606e", fontWeight: 600, marginTop: 2 }}>{showSrc?.label || tr("Lithology")}</div>{/* #1745 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {codes.map((c) => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-xs)", color: "#55606e" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(c) }} />{c}
                </div>
              ))}
            </div>
          </>
        )}
        {!codes.length && (
          <div style={warnNote}>{showSrc && showSrc.key !== "litho" ? tr("No {layer} intervals for the selected holes — the panel shows the projected traces only.", { layer: showSrc.label }) : tr("No lithology intervals for the selected holes — the panel shows the projected traces only.")}</div>
        )}
      </div>
    </div>
  );
  const steps = [
    { key: "holes", label: tr("Holes"), render: () => holesStep, primary: { label: tr("Next: panel"), disabled: !panel } },
    { key: "panel", label: tr("Panel"), render: () => panelStep, primary: { label: <><Download size={12} />{" "}{tr("Export SVG")}</>, onClick: exportSvg, disabled: !panel } },
  ];
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={step} onAt={setStep} help={help} width="min(1120px, 97vw)" />;
}

// TASKS.csv #4073 — the figure keeps its own colours (theme.js's header: this file is excluded from the token migration): each step's content sits on its
// own white sheet inside the shared shell, so the panel and its controls read the same in a dark theme as in the exported SVG
const sheet = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 8, padding: 10, color: "#1a2028" };
const small = { fontSize: "var(--font-size-xs)", color: "#55606e", lineHeight: 1.4 };
const rowLabel = { fontSize: "var(--font-size-xs)", color: "#55606e", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: "var(--font-size-sm)" };
const warnNote = { background: "#fdf6ec", border: "1px solid #e6d3b3", borderRadius: 6, padding: "6px 8px", fontSize: "var(--font-size-xs)", color: "#6b4e20", lineHeight: 1.45 };
