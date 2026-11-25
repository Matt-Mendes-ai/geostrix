// TASKS.csv #4070 — the Explicit surface pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "explicit"` test inside
// is ModellingPanes' own, kept as it was.
import { PenTool } from "../../../components/icons.js";
import { pBtn, smallSel } from "../../../lib/sidebarStyles.js";
import { Suspense } from "react";

export default function ExplicitPane({ ExplicitSurfacePanel, askPrompt, explicitPickFor, explicitScene, explicitSnap, explicitSurfaces, explicitTrend, implicitMeshesRef, implicitSurfaces, lithoGroups, litho_units, mapLayers, modellingCodeList, paneHeader, removeImplicitSurface, sectionImages, sections, setDigitizeImageId, setExplicitLogged, setExplicitPickFor, setExplicitSnap, setExplicitSurfaces, surfaceStructures, terrain, toolPane, topsOfUnit, tracesSeq }) {
  return (<>
{toolPane === "explicit" && (<>
        {paneHeader("Explicit surface", PenTool, "model")}
        <Suspense fallback={null}>
          <ExplicitSurfacePanel surfaces={implicitSurfaces} /* #861 */ tracesSeq={tracesSeq} /* #888 */ trend={explicitTrend} /* #881 */ topsOfUnit={topsOfUnit} /* #871 */ defs={explicitSurfaces || []} setDefs={setExplicitLogged} /* #878 */ sections={sections} terrain={terrain} mapLayers={mapLayers} surfaceStructures={surfaceStructures} /* #817 */ sectionImages={sectionImages} onDigitizeImage={setDigitizeImageId} /* #824 */ unitChoices={[...modellingCodeList.map((c) => c.name), ...lithoGroups.map((g) => g.name)]} loggedUnits={litho_units} /* #1547 */ /* #831 */ pickFor={explicitPickFor} setPickFor={setExplicitPickFor} snap={explicitSnap} setSnap={setExplicitSnap}
            scene={explicitScene} /* #901 — memoized below the props */
            onRemove={(d) => { if (d.surfaceId && implicitMeshesRef.current[d.surfaceId]) removeImplicitSurface(d.surfaceId); setExplicitSurfaces((p) => p.filter((x) => x.id !== d.id)); }}
            askPrompt={askPrompt} pBtn={pBtn} smallSel={smallSel} numInput={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
        </Suspense>
        </>)}
  </>);
}
