// TASKS.csv #693 — the 3D Modelling tool panes (Model settings, grade estimation, explicit surface, modelling codes,
// litho groups, correlation, geoML, implicit surface, stratigraphic stack, structures, alteration, veins / dykes, grade
// shell), moved out of ViewerModule.jsx VERBATIM by a script (every TASKS.csv comment inside still applies where it
// stands) and loaded on demand: they are only rendered once a modelling pane is opened, and ViewerModule was over its
// startup budget. The props are exactly the free identifiers of the moved JSX that ViewerModule declares (found by
// Babel scope analysis, not by hand); module imports are re-imported here.
import { Activity, Calculator, ChevronDown, ChevronRight, ChevronUp, Compass, Droplets, FileBarChart2, Gem, GitCompare, Group, Layers, Layers3, Milestone, Mountain, Settings, Shapes, Sparkles, Trash2, Waves, Waypoints, X, PenTool } from "../../components/icons.js";
import { BLOCK_BUDGETS, ESTIMATION_METHODS, MAX_BLOCKS } from "../../lib/estimationMeta.js";
import InfoButton from "../../components/InfoButton.jsx";
import { PRECIOUS_METALS } from "../../lib/geochem.js";
import { Suspense, useCallback, useMemo } from "react";
import { withChangeLog } from "../../lib/explicitLog.js"; // TASKS.csv #878
import { activateOnKey, iconAction } from "../../lib/a11y.js";
import { colorForLithology, isCrossCuttingRole, roleForLithology } from "../../lib/layers.js";
import { codedRuns, topsForCode } from "../../lib/modellingCodes.js"; // TASKS.csv #871
import { pBtn, smallSel } from "../../lib/sidebarStyles.js";
import { sceneVertsToWorldFlat } from "../../lib/meshFlat.js";
import { t as tr } from "../../lib/i18n.js";
import { errorNotice } from "../../lib/notices.js";
import { tx } from "../../lib/i18nRich.js";

export default function ModellingPanes(props) {
  const {
    viewDragHookRef, cameraRef, rendererRef, explicitOverlayRef, // TASKS.csv #813 — dragging explicit-surface picks
    tracesSeq, // TASKS.csv #888
    explicitTrend, // TASKS.csv #881
    camState, sectionImages, setDigitizeImageId, // TASKS.csv #824 — digitizing section images in the 3D view
    runMapModel, MapModelPanel, // TASKS.csv #817
    ExplicitSurfacePanel,
    ModellingCodesPane,
    PredictivePanel,
    SurfaceGeologyProjection,
    TrendsPanel,
    activeInterceptSet,
    activeInterceptSetId,
    addLithoGroup,
    addStackUnit,
    addVoxelModel,
    addWorldMeshSurface,
    alt_units,
    alterationBusy,
    alterationCellSize,
    alterationSearchRadius,
    alterationTarget,
    askPrompt,
    assayElements,
    assays,
    clipToDomainBoundary,
    clipToTopo,
    collars,
    desurveyMethod,
    domains,
    emptyPaneHint,
    expandedLithoGroupId,
    explicitClickRef,
    explicitPickFor,
    explicitSnap,
    explicitSurfaces,
    faultCandidates,
    implicitBusy,
    implicitGroupRef,
    implicitMeshesRef,
    implicitSurfaces,
    implicitTarget,
    includeSectionContacts,
    interceptSets,
    isLithoGroupKey,
    isMcodeKey,
    lastActivityRef,
    layers,
    lithoGroupCrossCuts,
    lithoGroupKey,
    lithoGroupRole,
    lithoGroups,
    litho_units,
    mapConstraint,
    mapLayers,
    mcConnectFrom,
    mcGroupOf,
    mcPickMode,
    mcSelected,
    mcodeDefaultRole,
    miniField,
    modelDomainId,
    modelResolution,
    modellingCodeList,
    modellingCodes,
    moveStackUnit,
    numericBudgetHint,
    numericBusy,
    numericCapValue,
    numericCellSize,
    numericCloseShell,
    numericCompositeLength,
    numericCutoff,
    numericIncludeQAQC,
    numericMaxBlocks,
    numericMethod,
    numericVariogram, setNumericVariogram, // TASKS.csv #1015
    numericMinCoverage,
    numericMinHoles,
    numericPadding,
    numericSearchRadius,
    numericSymbol,
    numericUseComposites,
    orientTypes,
    orientTypesSel,
    originRef,
    paneHeader,
    projectMapContact,
    rangeMultiplier,
    removeImplicitSurface,
    removeLithoGroup,
    removeStackUnit,
    resolveLithoTarget,
    runAlterationModel,
    runImplicitModel,
    runNumericModel,
    runStackModel,
    runStructuralModel,
    runVeinModel,
    searchEllipsoid,
    sections,
    sensBudget,
    sensN,
    sensOpen,
    sensSigmaDeg,
    sensSigmaPos,
    setActiveInterceptSetId,
    setAlterationCellSize,
    setAlterationSearchRadius,
    setAlterationTarget,
    setClipToDomainBoundary,
    setClipToTopo,
    setCoreOrientOpen,
    setExpandedLithoGroupId,
    setExplicitPickFor,
    setExplicitSnap,
    setExplicitSurfaces,
    setFenceOpen,
    setGradeEstOpen,
    setImplicitSurfaces,
    setImplicitTarget,
    setIncludeSectionContacts,
    setMapConstraint,
    setMcConnectFrom,
    setMcPickMode,
    setMcSelected,
    setModelDomainId,
    setModelResolution,
    setModellingCodes,
    setNotices,
    setNumericBudgetHint,
    setNumericCapValue,
    setNumericCellSize,
    setNumericCloseShell,
    setNumericCompositeLength,
    setNumericCutoff,
    setNumericIncludeQAQC,
    setNumericMaxBlocks,
    setNumericMethod,
    setNumericMinCoverage,
    setNumericMinHoles,
    setNumericPadding,
    setNumericSearchRadius,
    setNumericSymbol,
    setNumericUseComposites,
    setOrientTypesSel,
    setRangeMultiplier,
    setSearchEllipsoid,
    setSensBudget,
    setSensN,
    setSensOpen,
    setSensSigmaDeg,
    setSensSigmaPos,
    setSmoothClusters,
    setStackAdd,
    setStackFaults,
    setStackRelation,
    setStereonetOpen,
    setStructuralTarget,
    setStructuralTrends,
    setSurfaceDetail,
    setTadpoleOpen,
    setThinPicks,
    setThinWindowM,
    setTrendPreviewId,
    setVariogramOpen,
    setVeinCellSize,
    setVeinDip,
    setVeinDipDir,
    setVeinSearchRadius,
    setVeinTarget,
    smoothClusters,
    stackAdd,
    stackFaults,
    stackRelation,
    stackUnits,
    struct_types,
    structuralTarget,
    structuralTrends,
    structurePicksWithHoleAttitude,
    structureTypes,
    surfaceDetail,
    surfaceStructures,
    survey,
    terrain,
    thinPicks,
    thinWindowM,
    toolPane,
    tracesRef,
    trendFor,
    trendPreviewId,
    updateLithoGroup,
    veinBusy,
    veinCellSize,
    veinDip,
    veinDipDir,
    veinSearchRadius,
    veinTarget,
    vein_units,
    worldPointFromHits,
  } = props;
  // TASKS.csv #871 — the logged tops of a unit for the Explicit surface pane, by the implicit tool's rules (#354 / #495 /
  // #599); recomputed only when the logs, the modelling codes or the groups change
  const setExplicitLogged = useMemo(() => withChangeLog(setExplicitSurfaces), [setExplicitSurfaces]);
  // TASKS.csv #901 — the Explicit surface pane's scene handles: one object while its parts are the same (it was a new
  // object every render, so the pane's effects that list it re-ran on every render)
  const explicitScene = useMemo(() => ({origin: originRef, meshes: implicitMeshesRef, group: implicitGroupRef, traces: tracesRef, activity: lastActivityRef, setSurfaces: setImplicitSurfaces, worldPointFromHits, clickRef: explicitClickRef,
              dragHookRef: viewDragHookRef, camera: cameraRef, renderer: rendererRef, overlay: explicitOverlayRef, litho: layers.litho /* #813 */, structure: layers.structure /* #1002 */, camState /* #824 */ }), [originRef, implicitMeshesRef, implicitGroupRef, tracesRef, lastActivityRef, setImplicitSurfaces, worldPointFromHits, explicitClickRef, viewDragHookRef, cameraRef, rendererRef, explicitOverlayRef, layers.litho, layers.structure, camState]); // TASKS.csv #878 — every edit of a surface goes in its history
  const topsOfUnit = useCallback((unit) => {
    const runs = codedRuns(layers.litho || [], modellingCodes, mcGroupOf), { tops, skipped } = topsForCode(runs, unit, modellingCodes, mcodeDefaultRole);
    return { tops: tops.map((r) => ({ hole_id: r.hole_id, md: r.from, above: r.above?.code ?? null, below: r.code })), skipped, holes: [...new Set(runs.filter((r) => r.code === unit).map((r) => r.hole_id))] };
  }, [layers.litho, modellingCodes, lithoGroups]); // mcGroupOf / mcodeDefaultRole are rebuilt every render from lithoGroups
  return (<>
        {toolPane === "settings" && (<>
        {paneHeader("Model settings", Settings, "model")}
        {/* TASKS.csv #309 — this block of explanatory prose used to render ALWAYS-ON directly under
            the section label, at the smallest font size in the app. The 3D Modelling sidebar had five
            of these (Domain / Intercept set / Resolution / Surface stiffness / Search ellipsoid),
            roughly four lines of help per control, so a 900px sidebar showed about five actual
            controls and the rest was prose — while the 3D View sidebar, rendered by this SAME
            component, is almost entirely controls. The writing is good and specific and is NOT cut;
            it moves behind the existing InfoButton disclosure (already used 8x in GeophysicsModule,
            1x in RasterModule, and 0x here until now), which opens on hover OR click. */}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Domain")}</span>
          <InfoButton title={tr("Domain")} width={280} text={tr("Restricts every tool below to one side of one or more faults — build domains in \"Domains\" further down first, then pick one here. Applies to all four tools; \"Whole property\" is the original, undomained behaviour.")} />
        </div>
        <select value={modelDomainId} onChange={(e) => setModelDomainId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 4 }}>
          <option value="">{tr("Whole property")}</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {/* TASKS.csv #52 (c) — named intercept sets. Sits with the Domain selector because it is the
            same kind of control: both narrow WHICH picks feed every tool below, one spatially and one
            by hand. */}
        <div className="ge-section-label" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Intercept set")}</span>
          <InfoButton title={tr("Intercept set")} width={280} text={tr("Restricts every tool below to a hand-picked set of intercepts — the way to model a unit that repeats in the pile as the separate surfaces it really is, instead of every pick of that code feeding one surface. Build sets in \"Boundary intercepts\" on the Home tab. \"All intercepts\" is the original behaviour. Structural orientation picks are not covered: the tools read those directly from the structure layer, not through this table.")} />
        </div>
        <select value={activeInterceptSetId} onChange={(e) => setActiveInterceptSetId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 4 }}>
          <option value="">{tr("All intercepts")}</option>
          {(interceptSets || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({(x.ids || []).length})</option>)}
        </select>
        {activeInterceptSet && (activeInterceptSet.ids || []).length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon-strong)", marginBottom: 4, lineHeight: 1.4 }}>
            {tr("\"{name}\" is empty, so every tool below has nothing to model. Add intercepts to it in \"Boundary intercepts\", or switch back to All intercepts.", { name: activeInterceptSet.name })}</div>
        )}

        {/* TASKS.csv #88 — boundary constraint: #89 above only restricts which control points feed a
            run, this additionally clips the OUTPUT mesh to the domain, since GemPy still fits/
            extrapolates across the whole extent regardless. */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: modelDomainId ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: modelDomainId ? "pointer" : "default" }}>
          <input type="checkbox" checked={clipToDomainBoundary} disabled={!modelDomainId} onChange={(e) => setClipToDomainBoundary(e.target.checked)} />{tr("Clip result to domain boundary")}</label>
        {/* TASKS.csv #358 */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: terrain ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: terrain ? "pointer" : "default" }} title={terrain ? tr("Removes the parts of modelled surfaces that lie above the terrain surface.") : tr("Load a terrain surface (Geophysics > Terrain) to cut surfaces at the ground.")}>
          <input type="checkbox" checked={clipToTopo && !!terrain} disabled={!terrain} onChange={(e) => setClipToTopo(e.target.checked)} />{tr("Cut surfaces at topography")}</label>

        {/* TASKS.csv #361 — which structure types are contact orientations (litho + alteration tools). */}
        {structureTypes.length > 0 && (<>
          <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{tr("Contact orientations")}</span>
            <InfoButton title={tr("Contact orientations")} width={300} text={tr("Which structure-pick types are used as the dip/dip-direction of the contacts being modelled. Faults, veins, joints and foliation are not contacts and usually point the surface the wrong way. With none chosen, the orientation is estimated from the contact points' own shape (and the run says so).")} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {structureTypes.map((t) => {
              const on = orientTypes.includes(t);
              return (
                <button key={t} aria-pressed={on} onClick={() => setOrientTypesSel(on ? orientTypes.filter((x) => x !== t) : [...orientTypes, t])}
                  style={{ padding: "2px 8px", borderRadius: 10, fontSize: "var(--font-size-sm)", cursor: "pointer", border: `1px solid ${on ? "var(--color-accent-dark)" : "var(--color-border)"}`, background: on ? "var(--color-selected-bg)" : "transparent", color: on ? "var(--color-text)" : "var(--color-text-muted)", fontWeight: on ? 600 : 400 }}>
                  {t}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8 }}>
            {orientTypes.length ? tr(orientTypesSel === null ? "Using {codes} (picked automatically as contact/bedding codes)." : "Using {codes}.", { codes: orientTypes.join(", ") }) : tr("None chosen — orientations will be estimated from the contact points.")}
          </div>
        </>)}

        {/* TASKS.csv #231 — resolution control for every GemPy run (Implicit Model, Stratigraphic
            Stack, Structural, Alteration all funnel through the same runSurfaceStack). Lower = faster/
            coarser, higher = slower/finer; GemPy's own cost scales with grid cell count, so this is the
            single biggest lever a user has over the 80s+ run times real properties hit. */}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Resolution")}</span>
          <InfoButton title={tr("Resolution")} width={300} text={tr("Cells per axis of the model's lithology block: the grid the model check against the logs falls back to, the unit volumes, \"Add as block model\" and the block read on sections. It does not change how finely the surfaces are drawn — that is Surface detail below. Lower is faster; a real property-scale run at 36 (the default) commonly takes 60-90+ seconds — try 24 or lower for a quick first look.")} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input type="range" min={12} max={64} step={4} value={modelResolution} onChange={(e) => setModelResolution(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", width: 46, textAlign: "right", flexShrink: 0 }}>{modelResolution}³</span>
        </div>

        {/* TASKS.csv #766 — GemPy's octree level for the surface mesh (dual contouring), fixed at 4 before */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Surface detail")}</span>
          <InfoButton title={tr("Surface detail")} width={300} text={tr("How finely the model surfaces are triangulated. Finer follows tight folds and fault steps more closely and gives smoother sections through the surfaces; it does not move the surface (measured: the same mean distance to the true surface at every level), and it does not change the block, the model check or the volumes. Measured on the Harry sample (two-unit stack): Standard 34 s; Fine 4x the triangles in 77 s (2.2x); Very fine 16x the triangles in 248 s (7x). Try Fine on the final run, not while iterating.")} />
        </div>
        <select value={surfaceDetail} onChange={(e) => setSurfaceDetail(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }} aria-label={tr("Surface detail")}>
          <option value={4}>{tr("Standard (fastest)")}</option>
          <option value={5}>{tr("Fine — 4x the triangles, ~2x the time")}</option>
          <option value={6}>{tr("Very fine — 16x the triangles, ~7x the time")}</option>
        </select>

        {/* TASKS.csv #274 — GemPy's potential-field range: the parameter that actually controls how
            tight or smooth a fitted surface is. It was never set and never reported, so the same job
            re-run could look different with nothing in the UI to point at. Auto = don't send it (GemPy's
            own default, byte-identical to every run before this control existed); the effective value is
            reported in the run notice and stamped into the surface's export provenance either way. */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Surface stiffness (advanced)")}</span>
          <InfoButton title={tr("Surface stiffness")} width={280} text={tr("Scales GemPy's potential-field range — the interpolator's own smoothness lever. Lower follows your control points more tightly (more curvature, more risk of over-fitting sparse data); higher gives stiffer, smoother surfaces. Leave on Auto unless a surface is visibly too wobbly or too flat for the data.")} />
        </div>
        <select value={rangeMultiplier} onChange={(e) => setRangeMultiplier(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }}>
          <option value={0}>{tr("Auto — GemPy's own default")}</option>
          <option value={0.5}>{tr("0.5x — tighter, follows the points more closely")}</option>
          <option value={0.75}>{tr("0.75x — slightly tighter")}</option>
          <option value={1.5}>{tr("1.5x — slightly smoother")}</option>
          <option value={2}>{tr("2x — smoother, stiffer surfaces")}</option>
        </select>

        {/* TASKS.csv #765 — structure picks averaged per hole: faster and less pick-scatter in the surface */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Contact orientations from picks")}</span>
          <InfoButton title={tr("Average picks per hole")} width={300} text={tr("GemPy honours every orientation it is given, one by one, and its run time grows with their number. Averaging the picks of each hole in depth windows sends a few representative orientations instead: much faster, and the scatter between neighbouring oriented-core picks no longer bends the surface. A window never mixes picks more than 30 degrees apart (a fold limb, an overturned pick, a different structure). Untick to send every pick as it is.")} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <input type="checkbox" checked={thinPicks} onChange={(e) => setThinPicks(e.target.checked)} />{tr("Average picks per hole, in windows of")}<input type="number" min={5} max={500} step={5} value={thinWindowM} disabled={!thinPicks} onChange={(e) => setThinWindowM(Math.max(5, Math.min(500, Number(e.target.value) || 50)))} style={{ ...smallSel, width: 56 }} aria-label={tr("Averaging window along the hole (m)")} /> m
        </label>

        {/* TASKS.csv #761 — automatic local smoothing of clustered contacts (off by default) */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Clustered contacts")}</span>
          <InfoButton title={tr("Smooth clustered contacts")} width={300} text={tr("GemPy passes exactly through every contact point. Where many noisy picks crowd one spot (holes from one pad, digitised map or section lines) it bends the surface to honour them all, and the kink spreads. With this on, each surface's contacts are scanned for clusters (a kernel density over the points, as in von Harten et al. 2021): points at least twice as crowded as an even spread would be, and near the densest, are fitted loosely instead of exactly. Isolated points stay exact. The run says how many were smoothed. Off by default: if the clustered picks are accurate, smoothing throws away real detail.")} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <input type="checkbox" checked={smoothClusters} onChange={(e) => setSmoothClusters(e.target.checked)} />{tr("Smooth clustered contacts")}</label>

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Search ellipsoid")}<InfoButton title={tr("Search ellipsoid")} width={300} text={tr("GemPy fits one global surface, not per-query local kriging, so this can't steer the interpolator's own search the way classic kriging software would. What it does instead: drops any control point with fewer than the minimum neighbour count within an ellipsoid oriented along the structural trend below, so isolated points don't quietly feed a run alongside well-supported ones. The structural trends below are set separately.")} />
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={searchEllipsoid.enabled} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, enabled: e.target.checked }))} />{" "}{tr("On")}</label>
        </div>
        {searchEllipsoid.enabled && (
          <div style={{ opacity: searchEllipsoid.enabled ? 1 : 0.5, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>{tr("Azimuth°")}<input type="number" value={searchEllipsoid.azimuth} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, azimuth: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Dip°")}<input type="number" value={searchEllipsoid.dip} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, dip: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>{tr("Major (m)")}<input type="number" value={searchEllipsoid.major} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, major: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Semi-major (m)")}<input type="number" value={searchEllipsoid.semiMajor} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, semiMajor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Minor (m)")}<input type="number" value={searchEllipsoid.minor} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, minor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <label style={miniField}>{tr("Min. neighbours required")}<input type="number" value={searchEllipsoid.minSamples} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, minSamples: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...smallSel, width: 70 }} />
            </label>
          </div>
        )}

        {/* TASKS.csv #650 — named structural trends (replaces the single unsaved "Anisotropy" on/off) */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Structural trends")}</div>
        <Suspense fallback={null}>
          <TrendsPanel structuralTrends={structuralTrends} setStructuralTrends={setStructuralTrends}
            structurePicks={structurePicksWithHoleAttitude}
            surfaces={implicitSurfaces.map((x) => ({ id: x.id, name: x.name }))}
            surfacePoints={(id) => {
              const geo = implicitMeshesRef.current[id]?.geometry; if (!geo) return [];
              const { vertices } = sceneVertsToWorldFlat(geo, originRef.current);
              const pts = []; for (let i = 0; i < vertices.length; i += 3) pts.push({ x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] });
              return pts;
            }}
            onView={(t) => setTrendPreviewId(t ? t.id : null)} viewingId={trendPreviewId}
            small={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}
            inputStyle={smallSel} btnStyle={pBtn} />
        </Suspense>

        </>)}
        {toolPane === "gradeEst" && (<>
        {paneHeader("Grade estimation", Calculator, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Populate a block model FROM composited assays — nearest-neighbour or inverse- distance weighting, not a surface — a separate workflow from the implicit surface tools below.")}</div>
        <button onClick={() => setGradeEstOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 8 }}>
          <FileBarChart2 size={14} />{" "}{tr("Estimate grade into block model…")}</button>
        {/* TASKS.csv #147 — deliberately sits directly under the estimation button, because it is the
            diagnostic you are supposed to run BEFORE choosing a search radius or an anisotropy ratio,
            not a separate curiosity. It does NOT feed the estimator (GeoStrix still does not krige) —
            the modal itself says so up front; see VariogramModal.jsx's header. */}
        <button onClick={() => setVariogramOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 16 }}>
          <Activity size={14} />{" "}{tr("Variogram / spatial continuity…")}</button>

        {/* TASKS.csv #176 — lithology groups: lump codes logged differently for the same real unit
            (AND + BAS, SLT + GWK...) into one modelled unit. Same terse add/remove-list style as the
            Layers "+ Group" header above and CoreOrientationCalculator's field-reference library —
            a short, infrequently-edited list, not a modal workflow. */}
        </>)}
        {toolPane === "mapmodel" && (<>
        {paneHeader("Model from map", Mountain, "model")}
        <Suspense fallback={null}>
          <MapModelPanel mapLayers={mapLayers} surfaceStructures={surfaceStructures} terrain={terrain} busy={implicitBusy} onRun={runMapModel} pBtn={pBtn} smallSel={smallSel}
            onBuildBodies={(p) => import("./intrusionRun.js").then((m) => m.buildIntrusionBodies(p, { implicitGroupRef, implicitMeshesRef, originRef, setImplicitSurfaces, setNotices, terrain })).catch((e) => setNotices((q) => [...q, errorNotice(tr("Intrusion bodies could not be built: {v}", { v: e?.message || String(e) }))]))} /* #992 — a failed load or throw is said, not swallowed */ /* #821, loaded on use */ />
        </Suspense>
        </>)}{/* TASKS.csv #817 */}
        {toolPane === "explicit" && (<>
        {paneHeader("Explicit surface", PenTool, "model")}
        <Suspense fallback={null}>
          <ExplicitSurfacePanel surfaces={implicitSurfaces} /* #861 */ tracesSeq={tracesSeq} /* #888 */ trend={explicitTrend} /* #881 */ topsOfUnit={topsOfUnit} /* #871 */ defs={explicitSurfaces || []} setDefs={setExplicitLogged} /* #878 */ sections={sections} terrain={terrain} mapLayers={mapLayers} surfaceStructures={surfaceStructures} /* #817 */ sectionImages={sectionImages} onDigitizeImage={setDigitizeImageId} /* #824 */ unitChoices={[...modellingCodeList.map((c) => c.name), ...lithoGroups.map((g) => g.name)]} /* #831 */ pickFor={explicitPickFor} setPickFor={setExplicitPickFor} snap={explicitSnap} setSnap={setExplicitSnap}
            scene={explicitScene} /* #901 — memoized below the props */
            onRemove={(d) => { if (d.surfaceId && implicitMeshesRef.current[d.surfaceId]) removeImplicitSurface(d.surfaceId); setExplicitSurfaces((p) => p.filter((x) => x.id !== d.id)); }}
            askPrompt={askPrompt} pBtn={pBtn} smallSel={smallSel} numInput={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
        </Suspense>
        </>)}
        {toolPane === "mcodes" && (<>
        {paneHeader("Modelling codes", Waypoints, "model")}
        <Suspense fallback={null}>        <ModellingCodesPane litho={layers.litho || []} modellingCodes={modellingCodes} setModellingCodes={setModellingCodes} groupOf={mcGroupOf} defaultRole={mcodeDefaultRole}
          pickMode={mcPickMode} setPickMode={setMcPickMode} selected={mcSelected} setSelected={setMcSelected} connectFrom={mcConnectFrom} setConnectFrom={setMcConnectFrom}
          askPrompt={askPrompt} pBtn={pBtn} inputStyle={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} /></Suspense>
        </>)}
        {toolPane === "groups" && (<>
        {paneHeader("Lithology groups", Group, "model")}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{tr("Lithology groups")}</span>
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => askPrompt("New lithology group name:", "", (name) => { if (name && name.trim()) setExpandedLithoGroupId(addLithoGroup({ name: name.trim() })); })}
            style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", textTransform: "none", letterSpacing: 0 }} title={tr("New lithology group")}>{tr("+ New group")}</span>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Lump codes that were logged differently for the same real unit (e.g. andesite + basalt) into one modelled unit. Groups appear alongside raw codes in the pickers below; raw intervals keep their own colours in 3D.")}</div>
        {lithoGroups.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("No groups yet.")}</div>
        )}
        {lithoGroups.map((g) => {
          const open = expandedLithoGroupId === g.id;
          const codesInGroup = g.codes || [];
          const crossCuts = lithoGroupCrossCuts(g);
          const role = lithoGroupRole(g);
          return (
            <div key={g.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6, background: "var(--color-bg-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedLithoGroupId(open ? null : g.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0, display: "flex" }} title={open ? tr("Collapse") : tr("Choose which codes belong to this group")}>
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <input type="color" value={g.color || "#8a7fbf"} onChange={(e) => updateLithoGroup(g.id, { color: e.target.value })} title={tr("Surface / legend colour for this group")}
                  style={{ width: 20, height: 18, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                  onClick={() => askPrompt("Rename lithology group:", g.name, (name) => { if (name && name.trim()) updateLithoGroup(g.id, { name: name.trim() }); })} title={tr("Click to rename")}>
                  {g.name} <span style={{ color: "var(--color-text-muted)" }}>({codesInGroup.length})</span>
                </div>
                {crossCuts && <span title={tr("Contains a cross-cutting code (fault/dyke/breccia) — excluded from the Stratigraphic stack, same rail as a raw cross-cutting code")} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon)", background: "#f3e3e3", border: "1px solid #dcc2c2", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("X-cut")}</span>}
                {!crossCuts && role === "overburden" && <span title={tr("Every member is overburden — modelled as an overburden_base surface")} style={{ fontSize: "var(--font-size-xs)", color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("OB")}</span>}
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Delete lithology group \"{name}\"? Its codes stay in the log — they just stop being modelled together.", { name: g.name }))) removeLithoGroup(g.id); }, tr("Delete lithology group \"{name}\" (its codes stay in the log, just ungrouped)", { name: g.name }))} />
              </div>
              {open && (
                <div style={{ padding: "0 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {litho_units.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("No lithology codes loaded yet — import a litho CSV first.")}</div>}
                  {litho_units.map((u) => {
                    const on = codesInGroup.includes(u);
                    return (
                      <span role="button" tabIndex={0} onKeyDown={activateOnKey} key={u} onClick={() => updateLithoGroup(g.id, { codes: on ? codesInGroup.filter((c) => c !== u) : [...codesInGroup, u] })}
                        title={on ? tr("Remove {u} from this group", { u }) : tr("Add {u} to this group", { u })}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", padding: "2px 7px", borderRadius: 10, cursor: "pointer", userSelect: "none",
                          background: on ? "var(--color-success-bg)" : "var(--color-bg)", color: on ? "var(--color-success-text)" : "var(--color-text-secondary)", border: `1px solid ${on ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: colorForLithology(u), flexShrink: 0 }} />{u}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* TASKS.csv #139 — fence/panel diagram. Deliberately sits immediately ABOVE the implicit
            modelling tools because it is the lighter-weight companion to them: three holes on a line
            cannot support a GemPy surface but can absolutely support a hand correlation, and that is
            the stage of a project this answers. */}
        </>)}
        {toolPane === "correlation" && (<>
        {paneHeader("Section correlation", GitCompare, "model")}
        <button
          onClick={() => setFenceOpen(true)}
          disabled={!collars.length}
          style={{ ...pBtn, marginBottom: 8, opacity: collars.length ? 1 : 0.5, cursor: collars.length ? "pointer" : "default" }}
          title={tr("Fence / panel diagram — project the holes onto a common vertical panel along the drill line and correlate lithology hole-to-hole, with each hole's perpendicular offset from the section shown")}
        ><Layers3 size={14} />{" "}{tr("Fence / panel diagram…")}</button>

        {/* TASKS.csv #318 — mapped surface contacts projected underground (dip projection), or fed to the
            implicit model run just below as extra interface points + orientations. */}
        <SurfaceGeologyProjection
          mapLayers={mapLayers} surfaceStructures={surfaceStructures} terrain={terrain} pBtn={pBtn}
          onProject={projectMapContact} mapConstraint={mapConstraint} setMapConstraint={setMapConstraint}
        />

        </>)}
        {toolPane === "geoml" && (<>
        {/* TASKS.csv #750 — the former Predictive tab, as a 3D Modelling tool */}
        {paneHeader("geoML models", Sparkles, "model")}
        <Suspense fallback={null}>
          <PredictivePanel collars={collars} survey={survey} litho={layers.litho || []} assays={assays} assayElements={assayElements} terrain={terrain} desurveyMethod={desurveyMethod} trend={trendFor("geoml")}
            addVoxelModel={addVoxelModel} addSurface={addWorldMeshSurface} setNotices={setNotices} />
        </Suspense>
        </>)}
        {toolPane === "implicit" && (<>
        {paneHeader("Implicit surface", Mountain, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models the top contact of one unit from litho intervals, via GemPy in GeoStrix's Python engine. Uses structure dip/azimuth for orientation when available; if not, estimates one from the contact points themselves so it can still run.")}</div>
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the 3D View tab (Add layer › Lithology), or load the sample project."))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title={tr("Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points")}>
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />{tr("Include drawn cross-section contacts{v}", { v: sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : "" })}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={implicitTarget} onChange={(e) => setImplicitTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a unit…")}</option>
            {litho_units.map((u) => {
              const role = roleForLithology(u);
              return <option key={u} value={u}>{u}{role !== "stratigraphic" ? ` (${role}${isCrossCuttingRole(role) ? ", cross-cutting" : ""})` : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups under their own optgroup; a mixed-role group gets no role
                suffix (no guessing), a cross-cutting group is still offered HERE (this tool has no
                non-crossing constraint), just labelled. */}
            {lithoGroups.length > 0 && (
              <optgroup label={tr("Groups")}>
                {lithoGroups.map((g) => {
                  const role = lithoGroupRole(g);
                  const xcut = lithoGroupCrossCuts(g);
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || tr("no codes yet")}]{xcut ? tr(" (cross-cutting)") : role && role !== "stratigraphic" ? ` (${role})` : ""}</option>;
                })}
              </optgroup>
            )}
            {modellingCodeList.length > 0 && (
              <optgroup label={tr("Modelling codes")}>
                {modellingCodeList.map((c) => <option key={c.name} value={`mcode:${c.name}`}>{c.name}{c.role !== "stratigraphic" ? ` (${c.role})` : ""}</option>)}
              </optgroup>
            )}
          </select>
          <button
            onClick={() => runImplicitModel(implicitTarget)}
            disabled={!implicitTarget || implicitBusy}
            aria-label={tr("Run the implicit model (GemPy)")}
            title={tr("Runs in GeoStrix's Python engine (GemPy) — the status bar's Py shows whether it is ready")}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", whiteSpace: "nowrap", opacity: implicitTarget && !implicitBusy ? 1 : 0.5, cursor: implicitTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? tr("Running…") : <><Layers3 size={14} aria-hidden="true" />{" "}{tr("Run")}</>}</button>{/* #572 — was an unlabeled icon */}
        </div>
        {/* TASKS.csv #52 (a) — sensitivity spread. Collapsed by default: it is N+1 GemPy runs, not a
            casual click. Copy says "spread", never "confidence" — see lib/surfaceSpread.js's header. */}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSensOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
          {sensOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}{tr("Sensitivity: spread across realizations")}<InfoButton title={tr("Sensitivity spread")} width={380} text={tr("Re-runs the implicit model for the chosen unit several times with every contact point moved by a random amount (standard deviation = the position sigma you enter, in metres, per axis) and every orientation tipped by a random angle (the orientation sigma, in degrees), then colours the surface by how far the realizations land from it (RMS distance per vertex). Pale = the surface barely moves under that input uncertainty; dark = it moves a lot. Grey = at least one realization produced no surface there at all. It is a spread under the uncertainty YOU state — not a probability or a confidence, and only as meaningful as the sigmas entered. There is deliberately no default for them. A per-pick value in an 'uncertainty_m' number column (mapped as an extra field when importing lithology) overrides the position sigma for that pick. Cost: each realization is a full GemPy run. The base run is timed first and the number of realizations is cut to fit your time budget.")} />
        </div>
        {sensOpen && (
          <div style={{ padding: "8px 9px", marginBottom: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            {[
              [tr("Contact position ±"), sensSigmaPos, setSensSigmaPos, "m", "e.g. 2"],
              [tr("Orientation ±"), sensSigmaDeg, setSensSigmaDeg, "°", "e.g. 5"],
            ].map(([label, val, set, unit, ph]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ width: 108, flexShrink: 0 }}>{label}</span>
                <input type="number" min={0} step="any" value={val} placeholder={ph} onChange={(e) => set(e.target.value)} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
                <span>{unit} (1 σ)</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ width: 108, flexShrink: 0 }}>{tr("Realizations")}</span>
              <input type="number" min={3} max={50} value={sensN} onChange={(e) => setSensN(e.target.value)} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ width: 108, flexShrink: 0 }}>{tr("Time budget")}</span>
              <input type="number" min={10} step={30} value={sensBudget} onChange={(e) => setSensBudget(e.target.value)} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
              <span>s</span>
            </div>
            {(() => {
              const sp = Number(sensSigmaPos), sd = Number(sensSigmaDeg);
              const ready = implicitTarget && !implicitBusy && sensSigmaPos !== "" && sensSigmaDeg !== "" && sp >= 0 && sd >= 0 && (sp > 0 || sd > 0);
              return (
                <button
                  onClick={() => runImplicitModel(implicitTarget, { ensemble: { n: Math.min(50, Math.max(3, Number(sensN) || 8)), sigmaPos: sp, sigmaDeg: sd, budgetS: Math.max(10, Number(sensBudget) || 300) } })}
                  disabled={!ready}
                  title={!implicitTarget ? tr("Choose a unit above first") : (sensSigmaPos === "" || sensSigmaDeg === "") ? tr("Enter both sigmas — there is deliberately no default") : tr("Run the model, then the realizations")}
                  style={{ ...pBtn, marginBottom: 0, justifyContent: "center", opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "default" }}
                >{tr("Run with sensitivity spread")}</button>
              );
            })()}
          </div>
        )}

        </>)}
        {toolPane === "stack" && (<>
        {paneHeader("Stratigraphic stack", Layers, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models several units' top contacts together in one run so they can't cross each other — add units below in order, youngest (shallowest) first. Litho-only: veins/dykes cut across a stack by nature, so model those with the Structural tool instead, not here.")}</div>
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the 3D View tab (Add layer › Lithology), or load the sample project."))}
        {/* TASKS.csv #810 — the stack reads the same option; it had no checkbox, so drawn contacts were dropped unseen */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title={tr("Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points")}>
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />{tr("Include drawn cross-section contacts{v}", { v: sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : "" })}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={stackAdd} onChange={(e) => { addStackUnit(e.target.value); setStackAdd(""); }} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Add a unit…")}</option>
            {/* TASKS.csv #241 — cross-cutting units (fault/dyke/breccia) are hidden here, not just
                warned about in the paragraph above: they break the tool's own non-crossing guarantee,
                so they're unselectable rather than trusting the user to read the warning first. */}
            {litho_units.filter((u) => !stackUnits.includes(u) && !isCrossCuttingRole(roleForLithology(u))).map((u) => {
              const role = roleForLithology(u);
              return <option key={u} value={u}>{u}{role === "overburden" ? tr(" (overburden)") : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups with ANY cross-cutting member are excluded here, same rail as
                a raw cross-cutting code just above. */}
            {lithoGroups.some((g) => !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g)) && (
              <optgroup label={tr("Groups")}>
                {lithoGroups.filter((g) => !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g)).map((g) => {
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || tr("no codes yet")}]{lithoGroupRole(g) === "overburden" ? tr(" (overburden)") : ""}</option>;
                })}
              </optgroup>
            )}
            {/* TASKS.csv #599 — intrusion / cross-cutting / ignored codes break the stack's non-crossing rule: not offered */}
            {modellingCodeList.some((c) => !stackUnits.includes(`mcode:${c.name}`) && (c.role === "stratigraphic" || c.role === "overburden")) && (
              <optgroup label={tr("Modelling codes")}>
                {modellingCodeList.filter((c) => !stackUnits.includes(`mcode:${c.name}`) && (c.role === "stratigraphic" || c.role === "overburden")).map((c) => <option key={c.name} value={`mcode:${c.name}`}>{c.name}{c.role === "overburden" ? tr(" (overburden)") : ""}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        {stackUnits.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("No units added yet.")}</div>
        )}
        {stackUnits.map((u, i) => {
          // TASKS.csv #176 — a `group:` entry shows the group's name and gets a badge only when every
          // member shares the role (mixed => plain, no guessing); a since-deleted group is flagged.
          const grp = isLithoGroupKey(u) ? resolveLithoTarget(u) : null;
          const role = isLithoGroupKey(u) ? (grp ? lithoGroupRole(grp) : null) : isMcodeKey(u) ? (modellingCodeList.find((c) => c.name === u.slice(6))?.role ?? null) : roleForLithology(u);
          const display = isLithoGroupKey(u) ? (grp ? grp.name : "(deleted group)") : isMcodeKey(u) ? `${u.slice(6)} (code)` : u; // #599
          return (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", width: 14, flexShrink: 0 }}>{i + 1}</span>
            {grp && <span style={{ width: 8, height: 8, borderRadius: 2, background: grp.color || "#8a7fbf", flexShrink: 0 }} title={tr("Group: {v}", { v: (grp.codes || []).join(" + ") })} />}
            <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: grp || !isLithoGroupKey(u) ? "var(--color-text)" : "var(--color-danger-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={grp ? tr("Group: {v}", { v: (grp.codes || []).join(" + ") }) : undefined}>{display}</div>
            {role === "overburden" && <span title={tr("Overburden — tagged as its own surface type (overburden_base) rather than an ordinary stratigraphic contact")} style={{ fontSize: "var(--font-size-xs)", color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("OB")}</span>}
            <ChevronUp size={14} style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, -1), tr("Move \"{u}\" up in the stratigraphic stack", { u }))} />
            <ChevronDown size={14} style={{ cursor: i === stackUnits.length - 1 ? "default" : "pointer", color: i === stackUnits.length - 1 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, 1), tr("Move \"{u}\" down in the stratigraphic stack", { u }))} />
            <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeStackUnit(u), tr("Remove \"{u}\" from the stratigraphic stack", { u }))} />
          </div>
          );
        })}
        {/* TASKS.csv #360 — faults solved WITH the stack: contacts either side become offset blocks */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 6 }} title={tr("Each fault is its own GemPy group ahead of the stack (a FAULT relation): the contacts either side are fitted as offset blocks in one run, instead of one surface ramped across the fault. Faults come from the Structure planes layer (picks with dip and dip direction), one per structure type and name.")}>{tr("Faults that offset the stack")}</div>
        <select value="" onChange={(e) => { const k = e.target.value; if (k && !stackFaults.includes(k) && stackFaults.length < 6) setStackFaults((p) => [...p, k]); }} style={{ ...smallSel, width: "100%", marginTop: 3 }} aria-label={tr("Add a fault that offsets the stack")}>
          <option value="">{faultCandidates.length ? tr("Add a fault…") : tr("No structure picks with dip / dip direction")}</option>
          {faultCandidates.filter((c) => !stackFaults.includes(c.key)).map((c) => <option key={c.key} value={c.key}>{c.id ? `${c.type} — ${c.id}` : tr("{type} (all picks)", { type: c.type })} · {tr(c.n === 1 ? "{n} pick" : "{n} picks", { n: c.n })}{c.faultLike ? "" : tr(" (not named as a fault)")}</option>)}
        </select>
        {stackFaults.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", marginTop: 4, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.replace(/\|$/, " (all picks)").replace("|", " — ")}</span>
            <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => setStackFaults((p) => p.filter((x) => x !== k)), tr("Remove fault \"{k}\" from the stack", { k }))} />
          </div>
        ))}
        {/* TASKS.csv #271 — GemPy's own StructuralGroup semantics, exposed instead of hardcoded. */}
        <label style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 6 }} title={tr("Erode: each younger unit truncates everything below it (an erosional unconformity), and a unit missing between its neighbours in a hole pinches out there. Conformable: every unit is a level of one shared field, so the surfaces stay parallel, never cross and never meet: a unit keeps a thickness everywhere and cannot pinch out.")}>{tr("Unit relationship")}<select value={stackRelation} onChange={(e) => setStackRelation(e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }}>
            <option value="erode">{tr("Erode — younger units truncate older (unconformity)")}</option>
            <option value="onlap">{tr("Conformable — one shared field (units keep a thickness everywhere, cannot pinch out)")}</option>
          </select>
        </label>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 6px", lineHeight: 1.45 }}>
          {stackRelation === "erode"
            ? tr("Erosional: each unit is fitted in its own structural group and truncates the ones beneath it. Right for an unconformity; wrong for a conformable volcanic pile, where it will cut contacts that should simply drape.")
            : tr("Conformable: every unit shares one interpolated field, so the surfaces stay parallel and can never cross. Right for a continuous layered sequence. A unit that is missing between its neighbours in some holes cannot pinch out in this mode (it keeps a thickness there): use Erode for discontinuous units.")}
        </div>
        <button
          onClick={() => runStackModel(stackUnits)}
          disabled={stackUnits.length < 2 || implicitBusy}
          title={tr("Runs in GeoStrix's Python engine (GemPy) — the status bar's Py shows whether it is ready")}
          style={{ ...pBtn, marginTop: 4, opacity: stackUnits.length >= 2 && !implicitBusy ? 1 : 0.5, cursor: stackUnits.length >= 2 && !implicitBusy ? "pointer" : "default" }}
        ><Layers3 size={14} /> {implicitBusy ? tr("Running…") : tr(stackUnits.length === 1 ? "Run stack ({n} unit)" : "Run stack ({n} units)", { n: stackUnits.length })}</button>


        </>)}
        {toolPane === "structural" && (<>
        {paneHeader("Structural modelling", Compass, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models a surface from one structure-plane type (e.g. a fault or shear) using each pick's own position and dip/azimuth — no separate contact layer needed.")}</div>
        {/* User request: "we need to find a way to calculate the beta angle for non-oriented drilling
            based on field structural measurements" — the alpha-beta method (coreOrientation.js), placed
            right above the Stereonet QC button since it's the natural upstream step: solve a pick's true
            orientation here, then feed it (or the whole layer) into that QC/trend-checking tool. */}
        <button
          onClick={() => setCoreOrientOpen(true)}
          style={{ ...pBtn, marginBottom: 8 }}
          title={tr("Recover a non-oriented core pick's true dip/dip-direction by calibrating against a known field/outcrop structural reading")}
        ><Compass size={14} />{" "}{tr("Core orientation calculator")}</button>
        {/* TASKS.csv #141 — check the structure picks' own orientation trend/scatter BEFORE feeding them
            into the anisotropy or structural-surface tools above/below. */}
        <button
          onClick={() => setStereonetOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth)) && !(surfaceStructures || []).some((st) => (st.rows || []).length)} // #428: outcrop data alone is enough
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length || (surfaceStructures || []).length ? 1 : 0.5, cursor: (layers.structure || []).length || (surfaceStructures || []).length ? "pointer" : "default" }}
          title={tr("Pole-plot / great-circle stereonet of the Structure layer's downhole picks and/or outcrop measurements")}
        ><Milestone size={14} />{" "}{tr("Stereonet (QC picks)")}</button>
        {/* TASKS.csv #277 — the downhole (tadpole) view, sitting next to the Stereonet because the two
            are the pair a geologist works structural data with: this one answers "where in the hole,
            and does it change at a contact", the stereonet answers "what is the orientation
            population". Neither replaces the other, and this one is normally opened first. */}
        <button
          onClick={() => setTadpoleOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth))}
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length ? 1 : 0.5, cursor: (layers.structure || []).length ? "pointer" : "default" }}
          title={tr("Downhole tadpole plot — depth vs alpha/dip with an azimuth tail, plus lithology and structure-frequency tracks, per hole")}
        ><Milestone size={14} />{" "}{tr("Downhole structure (tadpole)")}</button>
        {!struct_types.length && emptyPaneHint(tr("No structure picks loaded — import downhole structure planes on the 3D View tab (Add layer › Structure planes), or load the sample project."))}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={structuralTarget} onChange={(e) => setStructuralTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a structure type…")}</option>
            {struct_types.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runStructuralModel(structuralTarget)}
            disabled={!structuralTarget || implicitBusy}
            aria-label={tr("Run the structural model (GemPy)")}
            title={tr("Runs in GeoStrix's Python engine (GemPy) — the status bar's Py shows whether it is ready")}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", whiteSpace: "nowrap", opacity: structuralTarget && !implicitBusy ? 1 : 0.5, cursor: structuralTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? tr("Running…") : <><Layers3 size={14} aria-hidden="true" />{" "}{tr("Run")}</>}</button>{/* #572 */}
        </div>

        </>)}
        {toolPane === "alteration" && (<>
        {paneHeader("Alteration modelling", Droplets, "model")}
        {/* TASKS.csv #272 — this tool no longer builds a draped contact through the alteration tops via
            GemPy; it interpolates a 0/1 "altered?" indicator and takes the 0.5 iso-surface, which is a
            closed envelope with no assumed up-direction. Runs in-app, no sidecar. */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Builds a closed halo envelope for one assemblage: every logged alteration interval becomes a 0/1 \"altered?\" sample down its hole, interpolated onto a grid, iso-surfaced at 0.5. Unlike the lithology/structural tools this makes no assumption about which way is \"up\" — a halo wraps its conduit rather than draping like a contact. Runs in-app, no Python engine needed.")}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={alterationTarget} onChange={(e) => setAlterationTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose an assemblage…")}</option>
            {alt_units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runAlterationModel(alterationTarget)}
            disabled={!alterationTarget || alterationBusy}
            title={tr("Build a closed alteration-halo envelope from the logged intervals (runs in-app)")}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: alterationTarget && !alterationBusy ? 1 : 0.5, cursor: alterationTarget && !alterationBusy ? "pointer" : "default" }}
          >{alterationBusy ? <span style={{ fontSize: "var(--font-size-sm)" }}>…</span> : <Layers3 size={14} />}</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Grid cell size for the indicator interpolation. 0 = auto (about 1/8 of the search radius).")}>{tr("Cell size (m)")}<input type="number" min={0} value={alterationCellSize} onChange={(e) => setAlterationCellSize(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("Search radius for the indicator interpolation, and the padding the envelope is given to close outside the outermost altered sample. 0 = auto (about 1.2x the median hole spacing).")}>{tr("Search (m)")}<input type="number" min={0} value={alterationSearchRadius} onChange={(e) => setAlterationSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("0 = auto (derived from your own hole spacing). The model domain and the structural trend chosen for alteration halos (Model settings → Structural trends) are honoured; the search ellipsoid's minimum-neighbour filter is not — it exists to drop under-supported contact picks, which a closed envelope has none of.")}</div>
        {alterationBusy && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)", marginTop: -4, marginBottom: 8 }}>{tr("Building the halo envelope…")}</div>}

        {/* TASKS.csv #144 — vein/dyke tool. The copy here deliberately states what the construction can
            and cannot do (paired by construction; thickness between holes is interpolated), because a
            vein drawn from a handful of intercepts looks far more certain on screen than it is. */}
        </>)}
        {toolPane === "vein" && (<>
        {paneHeader("Vein / dyke modelling", Waves, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models a vein or dyke as a PAIR of contacts: each logged interval's from-depth and to-depth are the two walls of one structure. A midplane is fitted through the intercept midpoints and a TRUE-thickness field (downhole length corrected for how obliquely each hole cuts the vein) is interpolated over it; the hangingwall and footwall are that midplane offset by half the thickness each way, so they stay a consistent thickness apart and cannot cross. Runs in-app, no Python engine needed.")}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={veinTarget} onChange={(e) => setVeinTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a vein / dyke…")}</option>
            {vein_units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runVeinModel(veinTarget)}
            disabled={!veinTarget || veinBusy}
            title={tr("Build paired hangingwall/footwall surfaces plus a closed solid from the logged vein intervals (runs in-app)")}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: veinTarget && !veinBusy ? 1 : 0.5, cursor: veinTarget && !veinBusy ? "pointer" : "default" }}
          >{veinBusy ? <span style={{ fontSize: "var(--font-size-sm)" }}>…</span> : <Layers3 size={14} />}</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Grid spacing across the vein plane. 0 = auto (about 1/12 of the search radius).")}>{tr("Cell size (m)")}<input type="number" min={0} value={veinCellSize} onChange={(e) => setVeinCellSize(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("In-plane search radius for the midplane and thickness interpolation, and how far the modelled vein is allowed to extend past the outermost intercept. 0 = auto (about 1.5x the median intercept spacing).")}>{tr("Search (m)")}<input type="number" min={0} value={veinSearchRadius} onChange={(e) => setVeinSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Optional. Leave both blank to fit the vein's attitude from the intercept midpoints. Required when every intercept lies on one section line, because collinear midpoints cannot fix a plane.")}>{tr("Dip (°)")}<input type="number" min={0} max={90} value={veinDip} placeholder={tr("fit")} onChange={(e) => setVeinDip(e.target.value)} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("Optional. Dip DIRECTION (not strike), 0-360. Only used when a dip is also entered.")}>{tr("Dip dir (°)")}<input type="number" min={0} max={360} value={veinDipDir} placeholder={tr("fit")} onChange={(e) => setVeinDipDir(e.target.value)} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("0 = auto (derived from your own intercept spacing). Dip / dip direction blank = fitted from the data. Adds three surfaces: hangingwall, footwall, and a closed solid for volume. Between holes the shape and thickness are interpolated, so treat the result as an interpretation — a pinch-out or swell no hole intersected will not be in it.")}</div>
        {veinBusy && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)", marginTop: -4, marginBottom: 8 }}>{tr("Building the vein pair…")}</div>}

        {/* TASKS.csv #142 — numeric implicit model (grade shell). Runs entirely in the browser (no
            sidecar): IDW onto a dense grid + marching cubes at the cutoff. Result lands in the
            Generated surfaces list below like any GemPy surface. */}
        </>)}
        {toolPane === "shell" && (<>
        {paneHeader("Grade shell", Gem, "model")}
        {/* TASKS.csv #269 — standing, unmissable framing. The QP review's explicit recommendation was
            NOT to add a Measured/Indicated/Inferred classifier (that is a QP's professional judgement,
            and deriving a regulatory label from a search radius would launder a parameter choice into
            a regulatory term). The real live risk is the opposite one: the app emitted confident
            tonnages with zero classification context. This is the fix — framing, not features.
            TASKS.csv #674 — it said "no anisotropy", untrue since #650 lets the shell follow a structural trend. */}
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", marginBottom: 8, lineHeight: 1.45 }}>
          <strong>{tr("Not a resource estimate.")}</strong>{" "}{tr("This builds an interpolated envelope to help you visualize and target mineralization. It can follow a structural trend you choose; Ordinary kriging fits a variogram to the composites automatically (check it in the Variogram tool), and there is no classification, dilution or recovery. Nothing it produces is a Mineral Resource under NI 43-101 or JORC, and it must not be reported publicly as one.")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Builds a wireframe envelope of everything at or above a cutoff grade directly from assay values — inverse-distance interpolation onto a grid, then an iso-surface at the cutoff. Runs in-app, no Python engine needed.")}{/* TASKS.csv #273 — this tool was a second, uncoupled interpolator that consumed none of the
              shared search-ellipsoid/anisotropy/domain machinery. The domain and the anisotropy trend
              are now threaded through it (see runNumericModel); the search ellipsoid's minimum-neighbour
              filter deliberately still isn't, and the panel says so instead of leaving the difference
              for the user to discover. */}
          {" "}{tx("It honours the model domain and the structural trend chosen for grade shells (Model settings → Structural trends). It does {not} apply the search ellipsoid's minimum-neighbour filter — that exists to drop under-supported contact picks, and dropping isolated assays would delete grade rather than improve the shell.", { not: <strong>{tr("not")}</strong> })}</div>
        {(() => {
          const symbols = assayElements.map((e) => e.symbol);
          const sym = numericSymbol || symbols[0] || "";
          const unit = assayElements.find((e) => e.symbol === sym)?.unit || "ppm";
          const canRun = symbols.length > 0 && collars.length > 0 && !numericBusy && Number.isFinite(numericCutoff);
          return (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title={tr("Assay element to model")}>{tr("Element")}<select value={sym} onChange={(e) => setNumericSymbol(e.target.value)} style={{ ...smallSel, width: "100%" }} disabled={!symbols.length}>
                    {symbols.length === 0 && <option value="">{tr("— no assays —")}</option>}
                    {symbols.map((s) => <option key={s} value={s}>{s} ({assayElements.find((e) => e.symbol === s)?.unit || "ppm"})</option>)}
                  </select>
                </label>
                {/* TASKS.csv #270 (LOW-1) — every geologist and every press release says g/t, never ppm.
                    Numerically identical for a solid, but a cutoff typo of one order of magnitude is a
                    real risk, so show the unit the user actually thinks in and keep ppm in the tooltip. */}
                <label style={{ ...miniField }} title={tr("Iso-value: the shell encloses every interpolated cell at or above this grade.{v}", { v: PRECIOUS_METALS.has(sym) && unit === "ppm" ? tr(" Displayed as g/t; stored as ppm — numerically identical for a solid (1 g/t = 1 ppm).") : "" })}>{tr("Cutoff ({unit})", { unit: PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit })}
                  <input type="number" step="any" value={numericCutoff} onChange={(e) => setNumericCutoff(e.target.value === "" ? NaN : Number(e.target.value))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title={tr("Interpolation grid cell size (cubic). Smaller = smoother shell but more cells, within the block budget below.")}>{tr("Cell (m)")}<input type="number" min="0.5" step="any" value={numericCellSize} onChange={(e) => { setNumericCellSize(Math.max(0.5, Number(e.target.value) || 10)); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #292 — "0 = unlimited" actively invited the pathological setting: an
                    unbounded search made every sample a candidate for every cell (measured: 81 s of
                    blocked main thread at 62,500 cells x 5,000 points, 250 s at the block cap). 0 now
                    means "cap at the grid diagonal", which is a no-op mathematically and a real bound
                    computationally. */}
                <label style={{ ...miniField }} title={tr("No sample within this distance of a grid cell leaves it un-estimated (no shell there) rather than extrapolating grade far from real data. 0 = no radius assumption, capped internally at the grid's own diagonal so the run can't hang — but a real radius is both faster and far more defensible.")}>{tr("Search (m)")}<input type="number" min="0" step="any" value={numericSearchRadius} onChange={(e) => setNumericSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
                </label>
                <label style={{ ...miniField }} title={tr("Extends the grid past the outermost sample so the shell can close beyond the last hole")}>{tr("Pad (m)")}<input type="number" min="0" step="any" value={numericPadding} onChange={(e) => setNumericPadding(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }} title={tr("The variogram ordinary kriging weights the composites with. Leave nugget, sill and range blank to fit one to the composites at run time (with a trend, the range is along its major axis). The Variogram tool shows the experimental points if you want to choose them yourself.")}>
                  <label style={{ ...miniField }}>{tr("Variogram model")}<select value={numericVariogram.model} onChange={(e) => setNumericVariogram((v) => ({ ...v, model: e.target.value }))} style={{ ...smallSel, width: "100%" }} aria-label={tr("Variogram model")}>
                      <option value="spherical">{tr("Spherical")}</option><option value="exponential">{tr("Exponential")}</option><option value="gaussian">{tr("Gaussian")}</option>
                    </select>
                  </label>
                  {[["nugget", tr("Nugget")], ["sill", tr("Sill (total)")], ["range", tr("Range (m)")]].map(([k, l]) => (
                    <label key={k} style={{ ...miniField, width: 64, flex: "0 0 auto" }}>{l}
                      <input type="number" min="0" step="any" value={numericVariogram[k]} placeholder={tr("fit")} onChange={(e) => setNumericVariogram((v) => ({ ...v, [k]: e.target.value }))} style={{ ...smallSel, width: "100%" }} aria-label={tr("Variogram {l}", { l })} />
                    </label>
                  ))}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flex: "1 1 100%" }}>{tr("Blank = fitted to the composites when you run; with a trend, the range is along its major axis.")}</div>
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Regularize raw assay intervals to a fixed length first (recommended — same compositing as Grade estimation)")}>
                <input type="checkbox" checked={numericUseComposites} onChange={(e) => setNumericUseComposites(e.target.checked)} />{tr("Composite first")}{numericUseComposites && (
                  <input type="number" step="any" min="0.1" value={numericCompositeLength} onChange={(e) => setNumericCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={{ ...smallSel, width: 50, marginLeft: 4 }} title={tr("Composite length (m)")} />
                )}
                {numericUseComposites && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>m</span>}
              </label>
              {/* TASKS.csv #262 — minCoverage was hardcoded at 0.5 here with no way to tighten it. */}
              {numericUseComposites && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }} title={tr("Minimum fraction of a composite interval that must actually be covered by real assay data (vs. missing/lost core) for it to be used. At the 50% default, a half-missing-core composite still counts as a full sample.")}>{tr("Min coverage")}<input type="number" step="1" min="0" max="100" value={Math.round(numericMinCoverage * 100)} onChange={(e) => setNumericMinCoverage(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} style={{ ...smallSel, width: 50 }} />
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>%</span>
                </label>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                {/* TASKS.csv #259 — high-grade capping was implemented in compositeDownhole and wired
                    only into CompositingModal; the grade shell composited uncapped, so a single bonanza
                    assay drove IDW² across its whole search neighbourhood. */}
                <label style={{ ...miniField }} title={tr("Cap every RAW assay at this grade before compositing (commonly the 97.5th-99th percentile of the element's distribution). Blank = no cap. For a nuggety, log-normal element like Au in an epithermal system, estimating without a cap overstates grade.")}>{tr("High-grade cap ({unit})", { unit: PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit })}
                  <input type="number" min="0" step="any" placeholder={tr("none")} value={Number.isFinite(numericCapValue) ? numericCapValue : ""} onChange={(e) => setNumericCapValue(e.target.value === "" ? NaN : Number(e.target.value))} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #258 — minSamples counts sample POINTS: one hole composited at 2 m supplies
                    ~25 of them inside a 50 m radius, so it can never express "at least two holes must
                    see this cell". This can. */}
                <label style={{ ...miniField }} title={tr("A grid cell is only estimated if samples from at least this many DISTINCT drillholes fall inside its search radius. 1 lets a single hole populate a whole 50m-radius sphere of 'mineralization' with continuity asserted rather than demonstrated; 2 (or 3) is the standard first sanity constraint.")}>{tr("Min holes")}<input type="number" min="1" step="1" value={numericMinHoles} onChange={(e) => setNumericMinHoles(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              {/* TASKS.csv #266 — QC inserts were excluded from Best Intercepts / Compositing / Grade
                  Statistics but reached the grade shell unfiltered. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default, the same as the Best Intercepts, Compositing and Grade Statistics panels. A field duplicate logged under its parent hole's id would otherwise be double-counted in the estimate.")}>
                <input type="checkbox" checked={numericIncludeQAQC} onChange={(e) => setNumericIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates)")}</label>
              {/* TASKS.csv #257 — relabelled and now defaulting OFF. With this on, every grid node with
                  no sample in range reads as below cutoff and the shell closes halfway to it: that wall
                  is the SEARCH RADIUS, not a grade boundary, and computeMeshVolume happily calls the
                  result watertight. Volume then scales as R³ while looking converged and stable. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Off (default): the shell stays open where the data runs out - honest, but there is no enclosed volume to report. On: the shell is sealed at the search-radius boundary so it becomes a watertight solid with a volume and tonnage - but that seal is your search radius, not a grade boundary, so the volume is an assumption you are making, not something measured. Doubling the search radius roughly multiplies the volume by eight.")}>
                <input type="checkbox" checked={numericCloseShell} onChange={(e) => setNumericCloseShell(e.target.checked)} />{tr("Close shell artificially at the search-radius boundary (volume becomes an assumption)")}</label>
              {/* TASKS.csv #803 — the same "Cut at topography" setting as the GemPy pane: the shell closes on the ground */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: terrain ? "var(--color-text-secondary)" : "var(--color-text-faint)", marginBottom: 4, cursor: terrain ? "pointer" : "default" }} title={tr("The shell ends at the terrain surface and stays a closed solid there (the grid is cut below the ground before the shell is drawn). Same setting as \"Cut surfaces at topography\".")}>
                <input type="checkbox" checked={clipToTopo && !!terrain} disabled={!terrain} onChange={(e) => setClipToTopo(e.target.checked)} />{terrain ? tr("End the shell at the terrain surface") : tr("End the shell at the terrain surface (import or fetch a terrain first, under Maps › Terrain)")}</label>
              {numericCloseShell && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 8, lineHeight: 1.45 }}>{tr("Part of this shell's boundary will not be a grade boundary — it is where the search radius ran out of samples. Its volume will depend on your search radius, not only on the data.")}</div>
              )}
              {/* TASKS.csv #625 — the block budget (grid cells the shell may use). Runs in a background worker with
                  progress and Cancel; measured ~18 s per million blocks on a mid-range laptop. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}
                title={tr("How many grid cells the grade shell may use. Bigger budgets allow smaller cells over a large area, at the cost of time and memory (the run stays cancellable from the status bar). Remembered on this computer.")}>
                <span style={{ flexShrink: 0 }}>{tr("Block budget")}</span>
                <select value={numericMaxBlocks} onChange={(e) => { setNumericMaxBlocks(Number(e.target.value)); setNumericBudgetHint(null); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Grade shell block budget")}>
                  {BLOCK_BUDGETS.map((b) => <option key={b} value={b}>{tr("{b} blocks{v}", { b: b.toLocaleString(), v: b === MAX_BLOCKS ? tr(" (fast)") : b >= 5000000 ? tr(" (~2 min, ~70 MB)") : b >= 2000000 ? " (~40 s)" : " (~20 s)" })}</option>)}
                </select>
              </label>
              {numericBudgetHint && (
                <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("At {cell} m cells this extent needs {needed} blocks — over the {budget}-block budget.", { cell: numericBudgetHint.cell, needed: numericBudgetHint.needed.toLocaleString(), budget: numericBudgetHint.budget.toLocaleString() })}<div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setNumericCellSize(numericBudgetHint.fit); setNumericBudgetHint(null); }} style={{ ...smallSel, cursor: "pointer" }}>{tr("Use {n} m cells", { n: numericBudgetHint.fit })}</button>
                    {numericBudgetHint.budget < BLOCK_BUDGETS[BLOCK_BUDGETS.length - 1] && (
                      <button type="button" onClick={() => { setNumericMaxBlocks(BLOCK_BUDGETS[BLOCK_BUDGETS.length - 1]); setNumericCellSize(numericBudgetHint.fitMax); setNumericBudgetHint(null); }} style={{ ...smallSel, cursor: "pointer" }}>{tr("Largest budget + {n} m cells", { n: numericBudgetHint.fitMax })}</button>
                    )}
                  </div>
                </div>
              )}
              {/* TASKS.csv #292 — warn before the work, not after (pattern from #209). */}
              {!(numericSearchRadius > 0) && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("With no search radius, every grid cell is estimated from the whole dataset — the run can take a minute or more and the window will be unresponsive while it does. Set a real search radius unless you specifically want an unbounded first pass.")}</div>
              )}
              <button
                onClick={runNumericModel}
                disabled={!canRun}
                title={symbols.length ? (collars.length ? tr("Interpolate grades onto a grid and extract the cutoff iso-surface") : tr("Load collars first")) : tr("Import assays first")}
                style={{ ...pBtn, marginBottom: 8, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "default" }}
              ><Shapes size={14} /> {numericBusy ? tr("Running…") : (sym ? tr("Generate {el} shell", { el: sym }) : tr("Generate grade shell"))}</button>
            </>
          );
        })()}

        </>)}
  </>);
}
