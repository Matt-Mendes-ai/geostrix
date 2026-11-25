// TASKS.csv #4070 — the Grade shell pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "shell"` test inside
// is ModellingPanes' own, kept as it was.
import GeochemCompositingNote from "../../../components/GeochemCompositingNote.jsx";
import { Gem, Shapes } from "../../../components/icons.js";
import MoreFold from "../../../components/MoreFold.jsx";
import NumberInput from "../../../components/NumberInput.jsx"; // TASKS.csv #3926
import StepPane, { StepChoices, StepNumbers } from "../../../components/StepPane.jsx";
import { GradeShellUnsampled } from "../../../components/UnsampledChoice.jsx";
import { anisotropyFor, cellHeightFromRange } from "../../../lib/estimateMemory.js";
import { BLOCK_BUDGETS, ESTIMATION_METHODS, gradeShellBudgetMB, gradeShellBudgetNote, NUMERIC_CELL_DEFAULT } from "../../../lib/estimationMeta.js";
import { fetchBudgetMB } from "../../../lib/fetchMemory.js";
import { gradeUnitLabel, PRECIOUS_METALS } from "../../../lib/geochem.js";
import { cutoffPct } from "../../../lib/gradeTonnage.js";
import { t as tr } from "../../../lib/i18n.js";
import { tx } from "../../../lib/i18nRich.js";
import { errorNotice } from "../../../lib/notices.js";
import { findNumericSource } from "../../../lib/numericSources.js";
import { shapeOf, shapeSettings, shareAbove, shellResult } from "../../../lib/paneSteps.js";
import { rememberElement } from "../../../lib/preferredElement.js";
import { pBtn, smallSel } from "../../../lib/sidebarStyles.js";
import { drillThresholdOffers } from "../../../lib/thresholds.js";
import { describeTrend, searchEllipsoidAxes } from "../../../lib/trend.js";
import { trendCellM, trendCellText } from "../../../lib/trendCell.js";
import { ENVELOPE_RANGES } from "../../../lib/viewer/shellEnvelope.js";
import { computeMeshVolume } from "../../../lib/volumetrics.js";
import DomainUpdateSection from "../DomainUpdateSection.jsx";
import ShellCapNote from "../ShellCapNote.jsx";

export default function GradeShellPane({ addVoxelModel, assayElements, assays, clipToTopo, collars, customLayersAll, desurveyMethod, geochemThresholds, implicitGroupRef, implicitMeshesRef, implicitSurfaces, layers, miniField, modelArea, numericBudgetHint, numericBusy, numericCapValue, numericCellHeight, numericCellSize, numericCloseShell, numericCompositeLength, numericCutoff, numericFlatReach, numericIncludeQAQC, numericMaxBlocks, numericMethod, numericMinCoverage, numericMinHoles, numericPadding, numericSearchRadius, numericSources, numericSymbol, numericUseComposites, numericVariogram, originRef, paneHeader, proposeShellCutoff, ramGB, runNumericModel, setClipToTopo, setImplicitSurfaces, setNotices, setNumericBudgetHint, setNumericCapValue, setNumericCellHeight, setNumericCellSize, setNumericCloseShell, setNumericCompositeLength, setNumericCutoff, setNumericFlatReach, setNumericIncludeQAQC, setNumericMaxBlocks, setNumericMethod, setNumericMinCoverage, setNumericMinHoles, setNumericPadding, setNumericSearchRadius, setNumericSymbol, setNumericUseComposites, setNumericVariogram, setShellEnvIso, setShellMode, setShellPlaneSearch, shellAreaAssays, shellBudgetOk, shellCapAuto, shellCutoffAuto, shellEnvIso, shellMode, shellPlaneSearch, shellSampleSpacing, shellSearchSet, shellSearchTyped, shellStep, shellSymbols, storeProject, survey, terrain, toolPane, trendFor, visibleHoles }) {
  return (<>
{toolPane === "shell" && (<>
        {paneHeader("Grade shell", Gem, "model", true /* #4070 — the run's messages as one line, the whole text one click away */)}
        {(() => {
          const symbols = shellSymbols; // #1744 — lab elements only
          const numSrc = findNumericSource(numericSymbol, { layers, customLayers: customLayersAll }); // #1741 — a downhole log or a numeric layer field
          const sym = numericSymbol || symbols[0] || numericSources[0]?.key || "";
          const unit = numSrc ? numSrc.unit : (assayElements.find((e) => e.symbol === sym)?.unit || "ppm");
          const canRun = (symbols.length > 0 || numericSources.length > 0) && collars.length > 0 && !numericBusy && Number.isFinite(numericCutoff);
          // TASKS.csv #4070 (Matt's layout C, 2026-11-24) — the pane as steps: 1 Element (by sample count), 2 Cut-off (P90 suggested, quick values, the
          // share above), 3 Shape -> Generate, 4 Result in numbers; every other setting, as it was, in Fine-tune. The explanations are in Help.
          // TASKS.csv #1736 (review #1645, Copley) — a cap and a cutoff belong to their element: Au's 0.078 cap and Cu's 1000 cutoff were kept
          // across a switch. The cap is cleared; the cutoff is proposed as the new element's P90 of lab assays (pXRF left out).
          const pickElement = (next) => {
            setNumericSymbol(next); setNumericCapValue(NaN); shellCapAuto.current = { symbol: null, value: null }; /* #3650 — a pick is never an emptied box */ if (!findNumericSource(next, { layers, customLayers: customLayersAll })) rememberElement("gradeShell", next); // #2552
            proposeShellCutoff(next); // #3272 — the holes the run uses; logValidRange (#3116) is applied inside
          };
          const cutUnit = PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit;
          const top = (shellStep?.counts || []).filter((c) => c.n > 0).slice(0, 5), rest = symbols.filter((s) => !top.some((c) => c.symbol === s));
          const above = shareAbove(shellStep?.vals, numericCutoff), quick = shellStep?.quick;
          const gt = trendFor("gradeShell"), flatOn = Number(numericFlatReach) > 0;
          const setShape = (k) => { const s = shapeSettings(k); setShellMode(s.shellMode); if (s.planeSearch != null) setShellPlaneSearch(s.planeSearch); };
          const lastShell = [...implicitSurfaces].reverse().find((s) => s.params?.tool === "numeric grade shell");
          const lastMesh = lastShell ? implicitMeshesRef.current?.[lastShell.id] : null;
          const res = lastShell ? shellResult(lastShell, (() => { try { return lastMesh?.geometry ? computeMeshVolume(lastMesh.geometry) : null; } catch { return null; } })()) : null;
          const pct = (x) => `${Math.round(100 * x)} %`;
          const addShellBlocks = async () => { // the last shell's own cells as a block model, as the AI tool add_grade_shell_blocks does (#3932)
            const C = await import("../../../lib/lastShellCells.js");
            const r = C.shellBlockModel(C.lastShellCells(), { surfaces: implicitSurfaces });
            if (!r.ok) { setNotices((p) => [...p, errorNotice(r.error)]); return; }
            addVoxelModel(r.model);
            setNotices((p) => [...p, tr("Added \"{name}\" as a block model ({n} blocks).", { name: r.model.name, n: r.cells.toLocaleString() })]);
          };
          return (
            <StepPane id="shell" label={tr("Grade shell")}
              top={<div role="note" title={tr("An interpolated envelope to visualize and target mineralization, with no classification, dilution or recovery. Nothing it produces is a Mineral Resource under NI 43-101 or JORC; do not report it publicly as one.")} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6 }}><strong>{tr("Not a resource estimate.")}</strong>{/* TASKS.csv #269 — framing, not features; one line now (#4070), the rest in its tooltip and Help */}</div>}
              steps={[
                { key: "element", label: tr("Element"), question: tr("Which element?"), body: (<>
                  {top.length > 0 && <StepChoices label={tr("Element")} value={sym} onChange={pickElement} options={top.map((c) => ({ value: c.symbol, label: `${c.symbol} (${gradeUnitLabel(c.symbol, assayElements.find((e) => e.symbol === c.symbol)?.unit || "ppm")})`, sub: c.n.toLocaleString(), title: tr("{n} samples in the holes the shell uses", { n: c.n.toLocaleString() }) }))} />}
                  {(rest.length > 0 || numericSources.length > 0 || !top.length) && (
                    <select value={top.some((c) => c.symbol === sym) ? "" : sym} onChange={(e) => { if (e.target.value) pickElement(e.target.value); }} aria-label={tr("Other element or log")} title={tr("Assay element, downhole log or numeric layer field to model")} style={{ ...smallSel, width: "100%", marginTop: 4 }} disabled={!symbols.length && !numericSources.length}>
                      {top.length > 0 && <option value="">{tr("Other…")}</option>}
                      {symbols.length === 0 && numericSources.length === 0 && <option value="">{tr("— no assays —")}</option>}
                      {rest.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, assayElements.find((e) => e.symbol === s)?.unit || "ppm")})</option>)}{/* #2218 */}
                      {numericSources.length > 0 && <optgroup label={tr("Downhole logs and numeric layers")}>{numericSources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.unitLabel || s.unit})</option>)}</optgroup>}{/* #1741 */}
                    </select>)}
                  {numSrc && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4 }} title={numSrc.logScale ? tr("{label}: {n} readings, values as logged. Interpolated as log10 values (a geometric mean between readings); the cutoff is in the same units as the readings.", { label: numSrc.label, n: numSrc.n.toLocaleString() }) : tr("{label}: {n} readings, values as logged; the cutoff is in the same units.", { label: numSrc.label, n: numSrc.n.toLocaleString() })}>{tr("{n} readings", { n: numSrc.n.toLocaleString() })}</div>}{/* #1741 */}
                </>) },
                { key: "cutoff", label: tr("Cut-off"), question: tr("Shell above what grade?"), hint: shellCutoffAuto && shellCutoffAuto.symbol === sym && numericCutoff === shellCutoffAuto.value ? (shellCutoffAuto.floor ? tr("Cutoff {v}: the 90th percentile of the {symbol} values above the detection floor, since {pct}% of the {n} values are the half-limit {floor}. Type your own.", { v: shellCutoffAuto.value, pct: Math.round(shellCutoffAuto.floor.share * 100), n: shellCutoffAuto.n.toLocaleString(), floor: shellCutoffAuto.floor.value, symbol: sym }) /* #3788 */ : shellCutoffAuto.onOpen ? tr("Cutoff {v}: the 90th percentile of the {n} {symbol} values in the holes the shell uses, proposed for the element it opened on. Type your own.", { v: shellCutoffAuto.value, n: shellCutoffAuto.n.toLocaleString(), symbol: sym }) : tr("Cutoff {v}: the 90th percentile of the {n} {symbol} values, proposed when {symbol} was chosen. Type your own.", { v: shellCutoffAuto.value, n: shellCutoffAuto.n.toLocaleString(), symbol: sym })) : undefined /* #3025 (6); onOpen: #3272 */, body: (<>
                  <label style={{ ...miniField, display: "block", marginBottom: 6 }} title={tr("Iso-value: the shell encloses every interpolated cell at or above this grade.{v}", { v: PRECIOUS_METALS.has(sym) && unit === "ppm" ? tr(" Displayed as g/t; stored as ppm — numerically identical for a solid (1 g/t = 1 ppm).") : "" })}>{tr("Cutoff ({unit})", { unit: cutUnit })}
                  <NumberInput allowEmpty value={Number.isFinite(numericCutoff) ? numericCutoff : null} onChange={(v) => setNumericCutoff(v == null ? NaN : v)} style={{ ...smallSel, width: "100%" }} />
                </label>
                  {quick && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>{[["P75", quick.p75], ["P90", quick.p90], ["P95", quick.p95]].map(([k, v]) => (
                    <button key={k} type="button" className="gs-btn gs-btn--sm" aria-pressed={numericCutoff === v} onClick={() => setNumericCutoff(v)} title={k === "P90" ? tr("Suggested: the 90th percentile of the samples") : undefined}
                      style={{ fontWeight: numericCutoff === v ? 600 : 400, borderColor: numericCutoff === v ? "var(--btn-primary-border)" : undefined }}>{`${k} ${v}`}</button>))}</div>}
                  {above != null && <div style={{ fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{tr("{p} of the samples at or above", { p: pct(above) })}</div>}
              {!numSrc && cutoffPct(numericCutoff, sym, unit) != null && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("{v} ppm {symbol} is {p} %.", { v: numericCutoff.toLocaleString(), symbol: sym, p: +cutoffPct(numericCutoff, sym, unit).toPrecision(4) })}</div>}{/* #3272 */}
              {!numSrc && (() => { const offers = drillThresholdOffers(geochemThresholds, sym, unit).slice(0, 4); return offers.length ? ( /* TASKS.csv #2689 (#2675 part 2) — saved drill thresholds offered as shell levels, never applied */
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", alignItems: "center", marginBottom: 6 }}>
                  <span>{tr("Saved threshold:")}</span>
                  {offers.map((o) => <button key={o.key} type="button" onClick={() => setNumericCutoff(o.value)} className="gs-btn gs-btn--sm" style={{ cursor: "pointer", padding: "1px 6px" }} title={tr("{rule}{pop}, decided {date}. Click to use it as the shell level.", { rule: o.rule, pop: o.population ? ` (${o.population})` : "", date: o.decided })}>{o.population ? `${o.population.split(": ").pop()} ` : ""}{+Number(o.value).toPrecision(4)}</button>)}
                </div>) : null; })()}
              <ShellCapNote assays={shellAreaAssays /* #3272 — the holes the run uses */} symbol={sym} unit={unit} assayElements={assayElements} includeQAQC={numericIncludeQAQC} isAssay={!numSrc && symbols.includes(sym)} capValue={numericCapValue} setCapValue={setNumericCapValue} autoRef={shellCapAuto /* #3272 */} cutoff={numericCutoff /* #3781 */} />{/* #2222 */}
                </>) },
                { key: "shape", label: tr("Shape"), question: tr("What shape?"), body: (<>
                  {gt || flatOn ? <div style={{ fontSize: "var(--font-size-sm)" }}>{gt ? tr("Along the trend \"{name}\" (Model settings)", { name: gt.name }) : tr("A flat search (Fine-tune)")}</div>
                    : <StepChoices label={tr("Shape")} value={shapeOf(shellMode, shellPlaneSearch)} onChange={setShape} columns={3} options={[
                      { value: "tight", label: tr("Tight"), title: tr("Follows the composites closely, in a sphere around each") },
                      { value: "smooth", label: tr("Smooth"), title: tr("An envelope: one or a few smooth bodies that keep the dilution between good intervals") },
                      { value: "trend", label: tr("Along a trend"), title: tr("Tight, searched along the plane of the composites at the cut-off") },
                    ]} />}
                  {shellMode === "auto" && !gt && !flatOn && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>{tr("Now: Automatic (Fine-tune)")}</div>}
              {numericBudgetHint && !numericBudgetHint.advice && numericBudgetHint.needed > 0 && ( /* #3651 — not a 'ran at' note */
                <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("At {cell} m cells this extent needs {needed} blocks — over the {budget}-block budget.", { cell: numericBudgetHint.cell, needed: numericBudgetHint.needed.toLocaleString(), budget: numericBudgetHint.budget.toLocaleString() })}<div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setNumericCellSize(numericBudgetHint.fit); setNumericBudgetHint(null); }} className="gs-btn gs-btn--sm" style={{ cursor: "pointer" }}>{tr("Use {n} m cells", { n: numericBudgetHint.fit })}</button>
                    {numericBudgetHint.budget < (numericBudgetHint.maxBudget || BLOCK_BUDGETS[BLOCK_BUDGETS.length - 1]) && (
                      <button type="button" onClick={() => { setNumericMaxBlocks(numericBudgetHint.maxBudget || BLOCK_BUDGETS[BLOCK_BUDGETS.length - 1]) /* #3581: the largest this computer allows */; setNumericCellSize(numericBudgetHint.fitMax); setNumericBudgetHint(null); }} className="gs-btn gs-btn--sm" style={{ cursor: "pointer" }}>{tr("Largest budget + {n} m cells", { n: numericBudgetHint.fitMax })}</button>
                    )}
                  </div>
                </div>
              )}
              {/* TASKS.csv #292 — warn before the work, not after (pattern from #209). */}
              {!(numericSearchRadius > 0) && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("Set a real search radius: without one, every cell is estimated from the whole dataset and the run can take a minute or more (its progress and Cancel are in the status bar).")}</div>
              )}
                </>) },
              ]}
              action={{ label: numericBusy ? tr("Running…") : (sym ? tr("Generate {el} shell", { el: numSrc ? numSrc.label : sym }) : tr("Generate grade shell")), onClick: runNumericModel, disabled: !canRun, icon: <Shapes size={14} />,
                title: symbols.length || numericSources.length ? (collars.length ? tr("Interpolate grades onto a grid and extract the cutoff iso-surface") : tr("Load collars first")) : tr("Import assays first") }}
              result={{ key: lastShell?.id ?? null, body: res && (<>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{lastShell.name}</div>
                <StepNumbers rows={[
                  { label: tr("Volume"), value: res.volumeM3 != null ? `${Math.round(res.volumeM3).toLocaleString()} m³` : tr("open"), title: res.open ? tr("The shell stays open where the data runs out, so it has no volume (Fine-tune: close it)") : undefined },
                  res.above ? { label: tr("Composites inside"), value: `${res.inside.toLocaleString()} / ${res.above.toLocaleString()}`, level: res.insideLow ? "high" : null, title: tr("Composites at or above the cut-off that the shell holds") } : null,
                  res.beyond != null ? { label: tr("Beyond the drilling"), value: pct(res.beyond), level: res.beyondLevel === "low" ? null : res.beyondLevel, title: tr("Share of its volume over one hole spacing from any sample") } : null,
                  res.interpolated != null ? { label: tr("Surface interpolated"), value: pct(res.interpolated), level: res.interpolated < 0.5 ? "some" : null, title: tr("Share of its surface bracketed by samples from two or more holes") } : null,
                ]} />
                <button type="button" className="gs-btn gs-btn--sm" onClick={addShellBlocks} style={{ marginBottom: 6 }}>{tr("Add as block model")}</button>
              <DomainUpdateSection ctx={{ implicitSurfaces, implicitMeshesRef, implicitGroupRef, originRef, setImplicitSurfaces, setNotices, assays, assayElements, collars, survey, desurveyMethod, numericIncludeQAQC, numericCompositeLength, numericMinCoverage, numericCellSize, numericMaxBlocks }}
                symbol={sym} cutoff={numericCutoff} iso={shellEnvIso} isAssay={!numSrc && symbols.includes(sym)} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4, marginBottom: 8, fontSize: "var(--font-size-sm)" }}
                fieldStyle={miniField} selectStyle={smallSel} buttonStyle={{ ...pBtn, marginBottom: 0 }} />{/* TASKS.csv #3673 phase 2 */}
              </>) }}
              fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="shell">
        {/* TASKS.csv #3939 — the method and what it honours, behind a closed More */}
        <MoreFold style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Interpolation onto a grid (by the method chosen below), then an iso-surface at the cutoff. Runs in-app, no Python engine.")}{/* TASKS.csv #273 — this tool was a second, uncoupled interpolator that consumed none of the
              shared search-ellipsoid/anisotropy/domain machinery. The domain and the anisotropy trend
              are now threaded through it (see runNumericModel); the search ellipsoid's minimum-neighbour
              filter deliberately still isn't, and the panel says so instead of leaving the difference
              for the user to discover. */}
          {" "}{tx("It honours the model domain and the structural trend chosen for grade shells (Model settings → Structural trends). It does {not} apply the search ellipsoid's minimum-neighbour filter — that exists to drop under-supported contact picks, and dropping isolated assays would delete grade rather than improve the shell.", { not: <strong>{tr("not")}</strong> })}</MoreFold>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title={tr("Interpolation grid cell size (cubic). Smaller = smoother shell but more cells, within the block budget below.")}>{numericCellHeight > 0 && !trendFor("gradeShell") ? tr("Cell E × N (m)") : tr("Cell (m)")}<NumberInput min="0.5" value={numericCellSize} onChange={(v) => { setNumericCellSize(v); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #292 — "0 = unlimited" actively invited the pathological setting: an
                    unbounded search made every sample a candidate for every cell (measured: 81 s of
                    blocked main thread at 62,500 cells x 5,000 points, 250 s at the block cap). 0 now
                    means "cap at the grid diagonal", which is a no-op mathematically and a real bound
                    computationally. */}
                <label style={{ ...miniField }} title={tr("Cells with no sample within this distance get no shell, rather than extrapolated grade. 0 = no radius: slow and less defensible than a real one.")}>{tr("Search (m)")}<NumberInput min="0" value={numericSearchRadius} onChange={(v) => { shellSearchTyped.current = true; /* #3607 (3) */ setNumericSearchRadius(v); }} style={{ ...smallSel, width: "100%" }} />
                </label>
                <label style={{ ...miniField }} title={tr("Extends the grid past the outermost sample so the shell can close beyond the last hole")}>{tr("Pad (m)")}<NumberInput min="0" value={numericPadding} onChange={(v) => setNumericPadding(v)} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              {numericBudgetHint?.ranAt && numericCellSize === NUMERIC_CELL_DEFAULT && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("The last run used {c} m cells: {cs} m cells did not fit its {b}-block budget. A larger budget below gives smaller cells; the box keeps {cs} m.", { c: numericBudgetHint.ranAt, cs: NUMERIC_CELL_DEFAULT, b: (numericBudgetHint.ranBudget || 0).toLocaleString() })}</div>}{/* TASKS.csv #3651 */}
              {shellSearchSet && numericSearchRadius === shellSearchSet.r && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{shellSearchSet.at === "samples" ? tr("Search radius {r} m: 2.5 times the {m} m typical distance from a sample to the nearest sample of another hole, so a block between two holes reaches both.", shellSearchSet) : tr("Search radius {r} m: 2.5 times the {m} m typical spacing, so a block between two holes reaches both.", shellSearchSet)}</div>}
              {!trendFor("gradeShell") && !(Number(numericFlatReach) > 0) && <>{/* TASKS.csv #3673 — the envelope (the default) or the tight shell */}
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  <label style={{ ...miniField, flex: 2 }} title={tr("Automatic: per drilled area, Envelope where a third or more of the composites reach the cut-off, Tight otherwise. Envelope: one or a few smooth bodies that keep the dilution between good intervals. Tight: follows the composites closely; at a low cut-off it breaks into many bodies.")}>{tr("Shell")}
                    <select value={shellMode} onChange={(e) => setShellMode(e.target.value)} style={{ ...smallSel, width: "100%" }} aria-label={tr("Grade shell kind")}>
                      <option value="auto">{tr("Automatic (by the drilling)")}</option>
                      <option value="envelope">{tr("Envelope (a domain)")}</option>
                      <option value="tight">{tr("Tight (follows the composites)")}</option>
                    </select>
                  </label>
                  {shellMode !== "tight" && <label style={{ ...miniField, flex: 1 }} title={tr("The share of neighbouring composites at or above the cut-off where the surface is drawn: lower takes in more dilution, higher keeps closer to the good intervals (0.3 to 0.7).")}>{tr("Probability")}
                    <NumberInput min="0.3" max="0.7" step="0.05" value={shellEnvIso} onChange={(v) => setShellEnvIso(v)} style={{ ...smallSel, width: "100%" }} aria-label={tr("Envelope probability")} />
                  </label>}
                </div>
                {shellMode !== "tight" && shellSampleSpacing?.medianM > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("The envelope reaches {a} m along the plane, {b} m across and {c} m through it, from the {s} m sample spacing. The Search box is the tight shell's.", { s: Math.round(shellSampleSpacing.medianM), a: Math.round(ENVELOPE_RANGES.major * shellSampleSpacing.medianM), b: Math.round(ENVELOPE_RANGES.semi * shellSampleSpacing.medianM), c: Math.round(ENVELOPE_RANGES.minor * shellSampleSpacing.medianM) })}</div>}
              </>}
              {!trendFor("gradeShell") && !(Number(numericFlatReach) > 0) && shellMode !== "envelope" && <>{/* TASKS.csv #3655 (the tight shell's, Automatic's tight areas too) — by default along the plane of the composites at the cut-off */}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Searches each drilled area along the plane of its composites at or above the cut-off, so the shell follows them instead of swelling round single holes. Areas with under 30 such composites or 4 holes keep the sphere.")}>
                  <input type="checkbox" checked={shellPlaneSearch} onChange={(e) => setShellPlaneSearch(e.target.checked)} style={{ marginTop: 2 }} />{tr("Search along the composites' plane")}
                </label>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{shellPlaneSearch ? tr("The plane is fitted at each run to the composites at or above the cut-off; the result gives its attitude. A trend chosen for grade shells (Model settings › Structural trends › Used by) replaces it.") : tr("Isotropic: the search is a sphere, no structural trend is chosen for grade shells (Model settings › Structural trends › Used by).")}</div>
              </>}{/* TASKS.csv #3593 */}{/* #3272 — as Estimation's (#2420) */}
              {(() => { /* TASKS.csv #3062 — a flat, thin body (a seam, a palaeochannel, a laterite): the cell height on its own and a flat search, as Estimation's (#2418); a structural trend shapes both instead */
                const gt = trendFor("gradeShell"), reach = Number(numericFlatReach), flat = !gt && reach > 0 && numericSearchRadius > 0 && reach < numericSearchRadius;
                return <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <label style={{ ...miniField }} title={gt ? tr("Under the trend \"{name}\" the cell is a cube in its frame (see below); clear the trend to set a cell height.", { name: gt.name }) : tr("The block height on its own, for a flat, thin body: a seam, a palaeochannel, a laterite. Blank = the same as the cell size (cubic).")}>{tr("Cell height (m)")}<NumberInput min="0.25" allowEmpty value={gt || numericCellHeight === "" || numericCellHeight == null ? null : numericCellHeight} disabled={!!gt} placeholder={gt ? tr("trend") : tr("cubic")} onChange={(v) => { setNumericCellHeight(v == null ? "" : v); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} aria-label={tr("Cell height (m)")} />
                    </label>
                    <label style={{ ...miniField }} title={gt ? tr("The structural trend \"{name}\" shapes the search; clear it in 3D Modelling → Model settings to type a flat search here.", { name: gt.name }) : tr("Flatten the search: the reach up and down from a block, with the search radius across. Blank = a sphere of the search radius.")}>{tr("Vertical reach (m)")}<NumberInput min="0" allowEmpty value={gt || numericFlatReach === "" || numericFlatReach == null ? null : numericFlatReach} disabled={!!gt} placeholder={gt ? tr("trend") : tr("sphere")} onChange={(v) => { setNumericFlatReach(v == null || !(v > 0) ? "" : v); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} aria-label={tr("Vertical reach (m)")} />
                    </label>
                  </div>
                  {!gt && reach > 0 && !flat && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6 }}>{numericSearchRadius > 0 ? tr("Less than the search radius, or it is a sphere.") : tr("A flat search needs a search radius.")}</div>}
                  {!gt && (() => { const an = anisotropyFor(storeProject, numericSymbol); return an && an.flat && !(flat && Math.round(an.acrossM) === Number(numericSearchRadius) && Math.round(an.downholeM) === reach) ? <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{/* TASKS.csv #3499 — the Variogram tool's anisotropy, offered, never applied by itself */}{tr("The Variogram tool found {b} m of continuity across the holes and {a} m down them: a flat search fits.", { a: Math.round(an.downholeM), b: Math.round(an.acrossM) })}{" "}{tr("A cell height of {h} m (a quarter of the downhole range) goes with it.", { h: cellHeightFromRange(an.downholeM) })}{" "}<button type="button" onClick={() => { setNumericSearchRadius(Math.round(an.acrossM)); setNumericFlatReach(Math.round(an.downholeM)); setNumericCellHeight(cellHeightFromRange(an.downholeM)); /* TASKS.csv #3508 */ }} className="gs-btn gs-btn--sm" style={{ fontSize: "var(--font-size-xs)" }}>{tr("Use it as the flat search")}</button></div> : null; })()}
                  {flat && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("A flat search: {r} m across and {v} m up and down from each cell.", { r: numericSearchRadius, v: reach })}</div>}
                </>;
              })()}
              {(() => { /* TASKS.csv #2676 / #2551 — the trend chosen for grade shells reshapes this search: say so, as Estimation does */
                const gt = trendFor("gradeShell"); if (!gt) return null;
                const [, v, v2] = searchEllipsoidAxes(gt, numericSearchRadius > 0 ? numericSearchRadius : 100);
                const tc = numericCellSize > 0 ? trendCellM(gt, numericCellSize) : null; // TASKS.csv #3010 — the real cell under the trend
                return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tc && <div>{tr("Under this trend the cells are about {c} m (long, intermediate, short axes). For thinner cells across the trend, lower Cell.", { c: trendCellText(tc) })}</div>}{numericSearchRadius > 0
                  ? tr("Along trend \"{name}\": an ellipsoid of {searchRadius} × {v} × {v2} m ({v3})", { name: gt.name, searchRadius: numericSearchRadius, v: Math.round(v), v2: Math.round(v2), v3: describeTrend(gt) })
                  : tr("Along trend \"{name}\": with no radius the search reaches the grid diagonal along the trend and {v}% and {v2}% of it across ({v3}).", { name: gt.name, v: Math.round(v), v2: Math.round(v2), v3: describeTrend(gt) })}</div>;
              })()}
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                <label style={{ ...miniField }}>{tr("Method")}{/* TASKS.csv #87 — one shared method table (estimation.js) drives this dropdown and
                      GradeEstimationModal's, so the grade shell and the block model can never offer
                      different methods or mean different things by the same method id. */}
                  <select value={numericMethod} onChange={(e) => setNumericMethod(e.target.value)} style={{ ...smallSel, width: "100%" }} title={tr(ESTIMATION_METHODS.find((m) => m.id === numericMethod)?.blurb || "")}>
                    {ESTIMATION_METHODS.map((m) => <option key={m.id} value={m.id}>{tr(m.label)}</option>)}
                  </select>
                </label>
              </div>
              {numericMethod === "ok" && ( /* TASKS.csv #1015 — the block model modal's variogram inputs, here too */
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }} title={tr("Leave nugget, sill and range blank to fit a variogram to the composites at run time (with a trend, range is along its major axis). The Variogram tool shows the experimental points.")}>
                  <label style={{ ...miniField }}>{tr("Variogram model")}<select value={numericVariogram.model} onChange={(e) => setNumericVariogram((v) => ({ ...v, model: e.target.value }))} style={{ ...smallSel, width: "100%" }} aria-label={tr("Variogram model")}>
                      <option value="spherical">{tr("Spherical")}</option><option value="exponential">{tr("Exponential")}</option><option value="gaussian">{tr("Gaussian")}</option>
                    </select>
                  </label>
                  {[["nugget", tr("Nugget")], ["sill", tr("Sill (total)")], ["range", tr("Range (m)")]].map(([k, l]) => (
                    <label key={k} style={{ ...miniField, width: 64, flex: "0 0 auto" }}>{l}
                      <NumberInput min="0" allowEmpty value={numericVariogram[k] === "" || numericVariogram[k] == null ? null : numericVariogram[k]} placeholder={tr("fit")} onChange={(v) => setNumericVariogram((x) => ({ ...x, [k]: v == null ? "" : String(v) }))} style={{ ...smallSel, width: "100%" }} aria-label={tr("Variogram {l}", { l })} />
                    </label>
                  ))}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flex: "1 1 100%" }}>{tr("Blank = fitted to the composites when you run; with a trend, the range is along its major axis.")}</div>
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Regularize raw assay intervals to a fixed length first (recommended — same compositing as Grade estimation)")}>
                <input type="checkbox" checked={numericUseComposites} onChange={(e) => setNumericUseComposites(e.target.checked)} />{tr("Composite first")}{numericUseComposites && (
                  <NumberInput min="0.1" value={numericCompositeLength} onChange={(v) => setNumericCompositeLength(v)} style={{ ...smallSel, width: 50, marginLeft: 4 }} title={tr("Composite length (m)")} />
                )}
                {numericUseComposites && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>m</span>}
              </label>
              {!findNumericSource(numericSymbol, { layers, customLayers: customLayersAll }) && <GradeShellUnsampled assays={assays} collars={collars} symbol={numericSymbol || assayElements[0]?.symbol} assayElements={assayElements} inArea={modelArea === "checked"} visibleHoles={visibleHoles} includeQAQC={numericIncludeQAQC} selStyle={smallSel}  layers={layers} customLayers={customLayersAll} /* #2721 */ />}{/* TASKS.csv #2417 / #2542 */}
              {numericUseComposites && !numSrc && <GeochemCompositingNote symbol={sym} length={numericCompositeLength} minCoverage={numericMinCoverage} cap={numericCapValue} unitLabel={gradeUnitLabel(sym, unit)} style={{ marginBottom: 4 }}
                onUse={(g) => { setNumericCompositeLength(g.length); setNumericMinCoverage(g.minCoverage); setNumericCapValue(g.cap ?? NaN); }} />}{/* TASKS.csv #2224 */}
              {/* TASKS.csv #262 — minCoverage was hardcoded at 0.5 here with no way to tighten it. */}
              {numericUseComposites && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }} title={tr("Minimum share of a composite that must be covered by real assays (not missing core) for it to be used. At the 50% default, a half-missing composite still counts as a full sample.")}>{tr("Min coverage")}<NumberInput step="1" min="0" max="100" value={Math.round(numericMinCoverage * 100)} onChange={(v) => setNumericMinCoverage(v / 100)} style={{ ...smallSel, width: 50 }} />
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>%</span>
                </label>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                {/* TASKS.csv #259 — high-grade capping was implemented in compositeDownhole and wired
                    only into CompositingModal; the grade shell composited uncapped, so a single bonanza
                    assay drove IDW² across its whole search neighbourhood. */}
                <label style={{ ...miniField }} title={tr("Cap every raw assay at this grade before compositing (often the 97.5th-99th percentile). Blank = no cap. Uncapped, a nuggety element like Au overstates grade.")}>{tr("High-grade cap ({unit})", { unit: PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit })}
                  <NumberInput min="0" placeholder={tr("none")} allowEmpty value={Number.isFinite(numericCapValue) ? numericCapValue : null} onChange={(v) => setNumericCapValue(v == null ? NaN : v)} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #258 — minSamples counts sample POINTS: one hole composited at 2 m supplies
                    ~25 of them inside a 50 m radius, so it can never express "at least two holes must
                    see this cell". This can. */}
                <label style={{ ...miniField }} title={tr("A cell is estimated only if samples from at least this many different holes fall within its search radius. 1 lets a single hole fill a whole sphere; 2 or 3 is usual.")}>{tr("Min holes")}<NumberInput min="1" step="1" value={numericMinHoles} onChange={(v) => setNumericMinHoles(Math.round(v))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              {/* TASKS.csv #266 — QC inserts were excluded from Best Intercepts / Compositing / Grade
                  Statistics but reached the grade shell unfiltered. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("QC samples (standards, blanks, duplicates, found by hole_id naming) are left out by default, as in the other grade panels; otherwise a field duplicate counts twice.")}>
                <input type="checkbox" checked={numericIncludeQAQC} onChange={(e) => setNumericIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates)")}</label>
              {/* TASKS.csv #257 — relabelled and now defaulting OFF. With this on, every grid node with
                  no sample in range reads as below cutoff and the shell closes halfway to it: that wall
                  is the SEARCH RADIUS, not a grade boundary, and computeMeshVolume happily calls the
                  result watertight. Volume then scales as R³ while looking converged and stable. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Off (default): the shell stays open where the data runs out, with no volume. On: it is sealed at the search radius, not a grade boundary, so its volume is assumed, not measured; doubling the radius can multiply the volume by up to eight.")}>
                <input type="checkbox" checked={numericCloseShell} onChange={(e) => setNumericCloseShell(e.target.checked)} />{tr("Close shell artificially at the search-radius boundary (volume becomes an assumption)")}</label>
              {/* TASKS.csv #803 — the same "Cut at topography" setting as the GemPy pane: the shell closes on the ground */}
              {/* TASKS.csv #3580 — with no terrain the run cuts at the collar surface (#2634), and this box read unticked and disabled meanwhile: it says what the run does, as Model settings' does */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: terrain || (collars || []).length >= 3 ? "var(--color-text-secondary)" : "var(--color-text-faint)", marginBottom: 4, cursor: terrain || (collars || []).length >= 3 ? "pointer" : "default" }} title={terrain ? tr("The shell ends at the terrain surface as a closed solid. Same setting as \"Cut surfaces at topography\".") : tr("No terrain loaded: the shell ends at the ground interpolated between the collars, raised over every sample so no drilled rock is cut. Load one in Maps > Terrain. Same setting as \"Cut surfaces at the collar surface\".")}>
                <input type="checkbox" checked={clipToTopo && (!!terrain || (collars || []).length >= 3)} disabled={!terrain && (collars || []).length < 3} onChange={(e) => setClipToTopo(e.target.checked)} />{terrain ? tr("End the shell at the terrain surface") : (collars || []).length >= 3 ? tr("End the shell at the collar surface (no terrain is loaded)") : tr("End the shell at the terrain surface (import or fetch a terrain first, under Maps › Terrain)")}</label>
              {numericCloseShell && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 8, lineHeight: 1.45 }}>{tr("Part of this shell's boundary will be where the search radius ran out of samples, not a grade boundary, so its volume depends on your search radius.")}</div>
              )}
              {/* TASKS.csv #625 — the block budget (grid cells the shell may use). Runs in a background worker with
                  progress and Cancel; measured ~18 s per million blocks on a mid-range laptop. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}
                title={tr("How many grid cells the grade shell may use: more allows smaller cells over a large area, at the cost of time and memory (cancel from the status bar). Remembered on this computer.")}>
                <span style={{ flexShrink: 0 }}>{tr("Block budget")}</span>
                <select value={numericMaxBlocks} onChange={(e) => { setNumericMaxBlocks(Number(e.target.value)); setNumericBudgetHint(null); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Grade shell block budget")}>
                  {/* TASKS.csv #3581 — up to 50 million; one this computer's memory cannot take is listed, disabled, with the reason */}
                  {BLOCK_BUDGETS.map((b) => { const ok = shellBudgetOk.has(b); return <option key={b} value={b} disabled={!ok}>{ok ? tr("{b} blocks ({v})", { b: b.toLocaleString(), v: tr(gradeShellBudgetNote(b)) }) : tr("{b} blocks: needs about {mb} MB, more than this computer can spare ({max} MB)", { b: b.toLocaleString(), mb: gradeShellBudgetMB(b).toLocaleString(), max: fetchBudgetMB(ramGB).toLocaleString() })}</option>; })}
                </select>
              </label>
              {/* TASKS.csv #2882 — after a refitted run: the budget that keeps the default cell, one click away */}
              {numericBudgetHint?.advice && (
                <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("A {b}-block budget ({cost}) keeps the default {cs} m cells here.", { b: numericBudgetHint.budget.toLocaleString(), cost: tr(gradeShellBudgetNote(numericBudgetHint.budget)), cs: numericBudgetHint.cell })}<div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setNumericMaxBlocks(numericBudgetHint.budget); setNumericCellSize(numericBudgetHint.cell); setNumericBudgetHint(null); }} className="gs-btn gs-btn--sm" style={{ cursor: "pointer" }}>{tr("Use {b} blocks", { b: numericBudgetHint.budget.toLocaleString() })}</button>
                  </div>
                </div>
              )}
              </MoreFold>} />
          );
        })()}

        </>)}
  </>);
}
