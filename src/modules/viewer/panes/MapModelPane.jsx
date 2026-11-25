// TASKS.csv #4070 — the Model from map pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "mapmodel"` test inside
// is ModellingPanes' own, kept as it was.
import { Mountain } from "../../../components/icons.js";
import { t as tr } from "../../../lib/i18n.js";
import { errorNotice } from "../../../lib/notices.js";
import { pBtn, smallSel } from "../../../lib/sidebarStyles.js";
import { Suspense } from "react";

export default function MapModelPane({ MapModelPanel, collars, desurveyMethod, implicitBusy, implicitGroupRef, implicitMeshesRef, layers, leftOutNote, mapLayers, originRef, paneHeader, runMapModel, setImplicitSurfaces, setNotices, surfaceStructures, survey, terrain, toolPane }) {
  return (<>
{toolPane === "mapmodel" && (<>
        {paneHeader("Model from map", Mountain, "model", true /* #4070 */)}
        <Suspense fallback={null}>
          <MapModelPanel mapLayers={mapLayers} surfaceStructures={surfaceStructures} terrain={terrain} busy={implicitBusy} onRun={runMapModel} pBtn={pBtn} smallSel={smallSel} holeCount={collars.length} lithoRows={layers.litho} /* #1718 */
            onBuildBodies={(p) => import("../intrusionRun.js").then((m) => m.buildIntrusionBodies(p, { implicitGroupRef, implicitMeshesRef, originRef, setImplicitSurfaces, setNotices, terrain, collars, survey, desurveyMethod /* #2663 */ })).catch((e) => setNotices((q) => [...q, errorNotice(tr("Intrusion bodies could not be built: {v}", { v: e?.message || String(e) }))]))} /* #992 — a failed load or throw is said, not swallowed */ /* #821, loaded on use */ />
        {leftOutNote}
        </Suspense>
        </>)}
  </>);
}
