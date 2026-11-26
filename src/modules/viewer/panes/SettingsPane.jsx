// TASKS.csv #4070 — the Model settings pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "settings"` test inside
// is ModellingPanes' own, kept as it was.
import { Settings } from "../../../components/icons.js";
import InfoButton from "../../../components/InfoButton.jsx";
import NumberInput from "../../../components/NumberInput.jsx"; // TASKS.csv #3926
import { t as tr } from "../../../lib/i18n.js";
import { sceneVertsToWorldFlat } from "../../../lib/meshFlat.js";
import { checkedHoleCount } from "../../../lib/modelArea.js";
import { pBtn, smallSel } from "../../../lib/sidebarStyles.js";
import { octreeCellM } from "../../../lib/viewer/contactFit.js";
import TrendHelper from "../TrendHelper.jsx";
import StepPane from "../../../components/StepPane.jsx"; // TASKS.csv #4070
import MoreFold from "../../../components/MoreFold.jsx";
import { lazy, Suspense } from "react";

const ModelAreaRange = lazy(() => import("../../../components/ModelAreaRange.jsx")); // TASKS.csv #2536

export default function SettingsPane({ TrendsPanel, activeInterceptSet, activeInterceptSetId, camState, clipToDomainBoundary, clipToTopo, clusterNote, collars, contactReachM, domains, explicitClickRef, implicitMeshesRef, implicitSurfaces, interceptSets, limitToContacts, lithoGroups, litho_units, mapLayers, miniField, modelArea, modelDomainId, modelResolution, orientTypes, orientTypesSel, orientationReachM, originRef, paneHeader, rangeMultiplier, sceneRef, searchEllipsoid, setActiveInterceptSetId, setClipToDomainBoundary, setClipToTopo, setContactReachM, setExplicitPickFor, setLimitToContacts, setModelArea, setModelDomainId, setModelResolution, setOrientTypesSel, setOrientationReachM, setRangeMultiplier, setSearchEllipsoid, setSmoothClusters, setStructuralTrends, setSurfaceDetail, setThinPicks, setThinWindowM, setTrendPreviewId, setUnitField, setVisibleHoles, sheetPositionAt, shellSymbols, smoothClusters, structuralTrends, structurePicksWithHoleAttitude, structureTypes, surfaceDetail, surfaceStructures, terrain, thinPicks, thinWindowM, tiedUnits, toolPane, topsOfUnit, tracedHoles, trendDrillingPoints, trendPreviewId, trendSamplePoints, unitField, unitFields, visibleHoles, worldPointFromHits }) {
  return (<>
{toolPane === "settings" && (<>
        {paneHeader("Model settings", Settings, "model", true /* #4070 */)}
        {/* TASKS.csv #309 — the explanations live behind each label's InfoButton. TASKS.csv #4070 (Matt's layout C) — the pane as steps: 1 Area, 2 Detail,
            3 Trend; the settings most runs leave alone in Fine-tune. Nothing runs from here: the tools on this tab read it. */}
        <StepPane id="settings" label={tr("Model settings")}
          top={<>
        {activeInterceptSet && (activeInterceptSet.ids || []).length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon-strong)", marginBottom: 4, lineHeight: 1.4 }}>
            {tr("\"{name}\" is empty, so every tool below has nothing to model. Add intercepts to it in \"Boundary intercepts\", or switch back to All intercepts.", { name: activeInterceptSet.name })}</div>
        )}
          </>}
          steps={[
            { key: "area", label: tr("Area"), question: tr("Which holes?"), body: (<>
        {/* TASKS.csv #1546 (review #1497, Lawyers) — one prospect, not the district: the tools read only the checked holes */}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span>{tr("Model area")}</span>
          <InfoButton title={tr("Model area")} width={280} text={tr("Which holes feed every modelling tool on this tab. 'Holes checked in the Holes list' models one prospect on its own, its box and cells fitted to those holes. Tick them under Holes in the StrixViewer sidebar ('Only these' on a prospect's holes).")} />
        </div>
        <select aria-label={tr("Model area")} value={modelArea || "all"} onChange={(e) => setModelArea(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
          <option value="all">{tr("Whole property")}</option>
          <option value="checked">{tracedHoles < checkedHoleCount(collars, visibleHoles).all /* #2053 — 544 collars, 10 with a trace on Woodjam */
            ? tr("Holes checked in the Holes list ({n} of {m}; {t} of the holes have a trace)", { n: checkedHoleCount(collars, visibleHoles).checked, m: checkedHoleCount(collars, visibleHoles).all, t: tracedHoles })
            : tr("Holes checked in the Holes list ({n} of {m})", { n: checkedHoleCount(collars, visibleHoles).checked, m: checkedHoleCount(collars, visibleHoles).all })}</option>
        </select>
        {modelArea === "checked" && <Suspense fallback={null}><ModelAreaRange collars={collars} visibleHoles={visibleHoles} setVisibleHoles={setVisibleHoles} small={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }} inp={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} /></Suspense>}{/* #2536 */}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Domain")}</span>
          <InfoButton title={tr("Domain")} width={280} text={tr("Restricts every modelling tool on this tab to one side of one or more faults. Build domains in \"Domains\" further down first, then pick one here. \"Whole property\" uses no domain.")} />
        </div>
        <select aria-label={tr("Model domain")} value={modelDomainId} onChange={(e) => setModelDomainId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 4 }}>
          <option value="">{tr("Whole property")}</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {clusterNote(true) /* #2056; also in the Implicit and Stack panes: #3268; one line here (#4070) */}
        {/* TASKS.csv #2378 (review #2325, WA uranium) — rock code and stratigraphic unit logged on the same intervals: which one the tools model */}
        {(unitFields || []).length > 0 && setUnitField && (
          <>
            <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span>{tr("Model the units from")}</span>
              <InfoButton title={tr("Model the units from")} width={280} text={tr("What every modelling tool reads as the unit: the Lithology code, a field imported with it, or another coded layer. The 3D view and logs still show the Lithology code. Intervals with nothing in that field are left out of the models.")} />
            </div>
            <select aria-label={tr("Model the units from")} value={unitField || ""} onChange={(e) => setUnitField(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
              <option value="">{tr("Lithology code")}</option>
              {(unitFields || []).map((f) => <option key={f.name} value={f.name}>{f.label ? tr("{layer} layer ({n} codes)", { layer: f.label, n: f.distinct }) : tr("{field} (extra field, {n} values)", { field: f.name, n: f.distinct })}</option>)}{/* #2529 — another coded layer */}
            </select>
          </>
        )}
            </>) },
            { key: "detail", label: tr("Detail"), question: tr("How fine?"), body: (<>
        {/* TASKS.csv #231 — resolution control for every GemPy run (Implicit Model, Stratigraphic
            Stack, Structural, Alteration all funnel through the same runSurfaceStack). Lower = faster/
            coarser, higher = slower/finer; GemPy's own cost scales with grid cell count, so this is the
            single biggest lever a user has over the 80s+ run times real properties hit. */}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Resolution")}</span>
          <InfoButton title={tr("Resolution")} width={300} text={tr("The lithology block holds about this number cubed of cells, used for the unit volumes, \"Add as block model\" and sections. Surface smoothness is Surface detail below. Lower is faster: 36 (the default) can take over a minute; try 24 for a first look.")} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input type="range" min={12} max={64} step={4} value={modelResolution} onChange={(e) => setModelResolution(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", width: 46, textAlign: "right", flexShrink: 0 }}>{modelResolution}³</span>
        </div>
        {/* TASKS.csv #2624 — the counts follow the box's shape at this total: what the last model box got */}
        {(() => { const p = implicitSurfaces[implicitSurfaces.length - 1]?.params; const r = p?.resolution, c = p?.blockCellM; return Array.isArray(r) && r.length === 3 ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -6, marginBottom: 10, lineHeight: 1.4 }}>{Array.isArray(c) ? tr("About {n} cells, shaped to the model box: the last box got {nx} x {ny} x {nz} cells of {dx} x {dy} x {dz} m.", { n: (modelResolution ** 3).toLocaleString(), nx: r[0], ny: r[1], nz: r[2], dx: c[0], dy: c[1], dz: c[2] }) : tr("About {n} cells, shaped to the model box: the last box got {nx} x {ny} x {nz} cells.", { n: (modelResolution ** 3).toLocaleString(), nx: r[0], ny: r[1], nz: r[2] })}</div> : null; })()}

        {/* TASKS.csv #766 — GemPy's octree level for the surface mesh (dual contouring), fixed at 4 before */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Surface detail")}</span>
          <InfoButton title={tr("Surface detail")} width={300} text={tr("How finely the surfaces are triangulated. Finer follows tight folds and fault steps more closely but runs much slower; it does not move the surface or change the block or the volumes. Use Fine on the final run, not while iterating.")} />
        </div>
        <select value={surfaceDetail} onChange={(e) => setSurfaceDetail(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }} aria-label={tr("Surface detail")}>
          <option value={4}>{tr("Standard (fastest)")}</option>
          <option value={5}>{tr("Fine — 4x the triangles, ≈ 2x the time")}</option>
          <option value={6}>{tr("Very fine — 16x the triangles, ≈ 7x the time")}</option>
        </select>
        {/* TASKS.csv #1171 — the options in metres for the box the last run used: a large box means large cells */}
        {(() => { const ext = implicitSurfaces[implicitSurfaces.length - 1]?.params?.extent; return ext?.length === 6 ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -6, marginBottom: 10, lineHeight: 1.4 }}>{tr("Mesh cells on the last model box: about {a} m (Standard), {b} m (Fine), {c} m (Very fine). Each run reports how far the mesh misses its contacts.", { a: Math.round(octreeCellM(ext, 4)), b: Math.round(octreeCellM(ext, 5)), c: Math.round(octreeCellM(ext, 6)) })}</div> : null; })()}
            </>) },
            { key: "trend", label: tr("Trend"), question: tr("Structural trends") /* the label the run messages name (Model settings › Structural trends) */, body: (<>
        <TrendHelper structuralTrends={structuralTrends} setStructuralTrends={setStructuralTrends} sceneRef={sceneRef} camState={camState} explicitClickRef={explicitClickRef} setExplicitPickFor={setExplicitPickFor} worldPointFromHits={worldPointFromHits} structurePicks={structurePicksWithHoleAttitude} surfaceStructures={surfaceStructures} mapLayers={mapLayers} surfaces={implicitSurfaces.map((x) => ({ id: x.id, name: x.name }))} surfacePoints={(id) => { const geo = implicitMeshesRef.current[id]?.geometry; if (!geo) return []; const { vertices } = sceneVertsToWorldFlat(geo, originRef.current); const pts = []; for (let i = 0; i < vertices.length; i += 3) pts.push({ x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] }); return pts; }} units={tiedUnits(litho_units, lithoGroups)} unitTopPoints={(code) => (topsOfUnit(code)?.tops || []).map((t) => sheetPositionAt(t.hole_id, t.md)).filter(Boolean)} sampleElements={shellSymbols} samplePoints={trendSamplePoints} drillingPoints={trendDrillingPoints} small={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }} inputStyle={smallSel} btnStyle={pBtn} /> {/* TASKS.csv #3910 (redesign P8) — the trend helper: candidates from the data, the disc preview, "I know my trend" */}
        <Suspense fallback={null}>
          <TrendsPanel structuralTrends={structuralTrends} setStructuralTrends={setStructuralTrends}
            structurePicks={structurePicksWithHoleAttitude}
            units={tiedUnits(litho_units, lithoGroups)} unitTopPoints={(code) => (topsOfUnit(code)?.tops || []).map((t) => sheetPositionAt(t.hole_id, t.md)).filter(Boolean)} /* #2428 */
            sampleElements={shellSymbols} samplePoints={trendSamplePoints} /* #3593 — a trend from the grades */ drillingPoints={trendDrillingPoints} /* #3769 */
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
            </>) },
          ]}
          fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="settings">
        {/* TASKS.csv #52 (c) — named intercept sets. Sits with the Domain selector because it is the
            same kind of control: both narrow WHICH picks feed every tool below, one spatially and one
            by hand. */}
        <div className="ge-section-label" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Intercept set")}</span>
          <InfoButton title={tr("Intercept set")} width={280} text={tr("Restricts every tool below to a hand-picked set of intercepts, so a unit that repeats in the pile is modelled as separate surfaces, not one. Build sets in \"Boundary intercepts\" on the Home tab. Structural orientation picks are not covered.")} />
        </div>
        <select aria-label={tr("Intercept set")} value={activeInterceptSetId} onChange={(e) => setActiveInterceptSetId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 4 }}>
          <option value="">{tr("All intercepts")}</option>
          {(interceptSets || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({(x.ids || []).length})</option>)}
        </select>
        {/* TASKS.csv #88 — boundary constraint: #89 above only restricts which control points feed a
            run, this additionally clips the OUTPUT mesh to the domain, since GemPy still fits/
            extrapolates across the whole extent regardless. */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: modelDomainId ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: modelDomainId ? "pointer" : "default" }}>
          <input type="checkbox" checked={clipToDomainBoundary} disabled={!modelDomainId} onChange={(e) => setClipToDomainBoundary(e.target.checked)} />{tr("Clip result to domain boundary")}</label>
        {/* TASKS.csv #358; #2470 — with no terrain, at the collar surface */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: terrain || (collars || []).length >= 3 ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: terrain || (collars || []).length >= 3 ? "pointer" : "default" }} title={terrain ? tr("Removes the parts of modelled surfaces that lie above the terrain surface.") : tr("No terrain loaded: cuts the surfaces and block at the ground interpolated between the collars (not for underground collars). Load one in Maps > Terrain for the real ground.")}>
          <input type="checkbox" checked={clipToTopo && (!!terrain || (collars || []).length >= 3)} disabled={!terrain && (collars || []).length < 3} onChange={(e) => setClipToTopo(e.target.checked)} />{terrain ? tr("Cut surfaces at topography") : tr("Cut surfaces at the collar surface")}</label>
        {/* TASKS.csv #1335 */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Fits the model box to the contacts being modelled and ends each surface just past them, not a box round every hole. Faults still cross the box.")}>
          <input type="checkbox" checked={limitToContacts} onChange={(e) => setLimitToContacts(e.target.checked)} />{tr("Stop surfaces near their own contacts")}</label>
        {limitToContacts && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, marginLeft: 22 }}>
            {tr("Extend past them by")}<NumberInput min={10} max={20000} step={50} allowEmpty value={contactReachM || null} placeholder={tr("auto")} onChange={(v) => setContactReachM(v ?? 0)} aria-label={tr("How far a surface runs past its own contacts (m)")} style={{ ...smallSel, width: 64 }} />m
          </label>
        )}
        {/* TASKS.csv #361 — which structure types are contact orientations (litho + alteration tools). */}
        {structureTypes.length > 0 && (<>
          <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{tr("Contact orientations")}</span>
            <InfoButton title={tr("Contact orientations")} width={300} text={tr("Which structure-pick types give the dip and dip direction of the contacts. Faults, veins, joints and foliation are not contacts and usually tilt the surface the wrong way. With none chosen, the orientation is estimated from the contact points (the run says so).")} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {structureTypes.map((t) => {
              const on = orientTypes.includes(t);
              return (
                <button data-btn-own="" key={t} aria-pressed={on} onClick={() => setOrientTypesSel(on ? orientTypes.filter((x) => x !== t) : [...orientTypes, t])}
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
        {/* TASKS.csv #274 — GemPy's potential-field range: the parameter that actually controls how
            tight or smooth a fitted surface is. It was never set and never reported, so the same job
            re-run could look different with nothing in the UI to point at. Auto = don't send it (GemPy's
            own default, byte-identical to every run before this control existed); the effective value is
            reported in the run notice and stamped into the surface's export provenance either way. */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Surface stiffness (advanced)")}</span>
          <InfoButton title={tr("Surface stiffness")} width={280} text={tr("Scales GemPy's smoothness. Lower follows your control points more tightly (more risk of over-fitting sparse data); higher gives stiffer, smoother surfaces. Leave on Auto unless a surface is visibly too wobbly or too flat.")} />
        </div>
        <select aria-label={tr("Surface stiffness")} value={rangeMultiplier} onChange={(e) => setRangeMultiplier(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }}>
          <option value={0}>{tr("Auto — GemPy's own default")}</option>
          <option value={0.5}>{tr("0.5x — tighter, follows the points more closely")}</option>
          <option value={0.75}>{tr("0.75x — slightly tighter")}</option>
          <option value={1.5}>{tr("1.5x — slightly smoother")}</option>
          <option value={2}>{tr("2x — smoother, stiffer surfaces")}</option>
        </select>

        {/* TASKS.csv #765 — structure picks averaged per hole: faster and less pick-scatter in the surface */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Contact orientations from picks")}</span>
          <InfoButton title={tr("Average picks per hole")} width={300} text={tr("Averages each hole's picks in depth windows and sends GemPy a few representative orientations: much faster, and the scatter between neighbouring picks no longer bends the surface. A window never mixes picks more than 30 degrees apart. Untick to send every pick.")} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <input type="checkbox" checked={thinPicks} onChange={(e) => setThinPicks(e.target.checked)} />{tr("Average picks per hole, in windows of")}<NumberInput min={5} max={500} step={5} value={thinWindowM} disabled={!thinPicks} onChange={(v) => setThinWindowM(v)} style={{ ...smallSel, width: 56 }} aria-label={tr("Averaging window along the hole (m)")} /> m
        </label>

        {/* TASKS.csv #1170 — blank = automatic (twice the contacts' spacing in plan); the run notice says which distance it used */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          {tr("Only picks within")}<NumberInput min={10} max={20000} step={50} allowEmpty value={orientationReachM || null} placeholder={tr("auto")} onChange={(v) => setOrientationReachM(v ?? 0)} aria-label={tr("Only picks within this distance of the unit's contacts (m)")} style={{ ...smallSel, width: 64 }} />{tr("m of the unit's contacts")}
        </label>

        {/* TASKS.csv #761 — automatic local smoothing of clustered contacts (off by default) */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Clustered contacts")}</span>
          <InfoButton title={tr("Smooth clustered contacts")} width={300} text={tr("GemPy passes exactly through every contact, so a crowd of noisy picks (holes from one pad, digitised lines) kinks the surface. On: dense clusters are fitted loosely, isolated points exactly. Off by default: if the clustered picks are accurate, smoothing loses real detail.")} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <input type="checkbox" checked={smoothClusters} onChange={(e) => setSmoothClusters(e.target.checked)} />{tr("Smooth clustered contacts")}</label>

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Search ellipsoid")}<InfoButton title={tr("Search ellipsoid")} width={300} text={tr("Drops any control point with fewer than the minimum neighbour count within this ellipsoid, oriented by its own Azimuth and Dip here, so isolated points don't feed a run. It does not steer GemPy's interpolation, and the structural trends below do not orient it.")} />
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={searchEllipsoid.enabled} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, enabled: e.target.checked }))} />{" "}{tr("On")}</label>
        </div>
        {searchEllipsoid.enabled && (
          <div style={{ opacity: searchEllipsoid.enabled ? 1 : 0.5, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>{tr("Azimuth°")}<NumberInput value={searchEllipsoid.azimuth} onChange={(v) => setSearchEllipsoid((p) => ({ ...p, azimuth: v }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Dip°")}<NumberInput value={searchEllipsoid.dip} onChange={(v) => setSearchEllipsoid((p) => ({ ...p, dip: v }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>{tr("Major (m)")}<NumberInput min={1} value={searchEllipsoid.major} onChange={(v) => setSearchEllipsoid((p) => ({ ...p, major: v }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Semi-major (m)")}<NumberInput min={1} value={searchEllipsoid.semiMajor} onChange={(v) => setSearchEllipsoid((p) => ({ ...p, semiMajor: v }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Minor (m)")}<NumberInput min={1} value={searchEllipsoid.minor} onChange={(v) => setSearchEllipsoid((p) => ({ ...p, minor: v }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <label style={miniField}>{tr("Min. neighbours required")}<NumberInput min={0} step={1} value={searchEllipsoid.minSamples} onChange={(v) => setSearchEllipsoid((p) => ({ ...p, minSamples: Math.round(v) }))} style={{ ...smallSel, width: 70 }} />
            </label>
          </div>
        )}
          </MoreFold>} />
        </>)}
  </>);
}
