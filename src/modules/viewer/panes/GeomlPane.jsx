// TASKS.csv #4070 — the geoML models pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "geoml"` test inside
// is ModellingPanes' own, kept as it was.
import { Sparkles } from "../../../components/icons.js";
import { Suspense } from "react";

export default function GeomlPane({ PredictivePanel, assayElements, assays, clipToTopo, collars, desurveyMethod, layers, leftOutNote, lithoGroups, modellingCodes, paneHeader, setNotices, survey, terrain, toolPane, trendFor, visibleHoles }) {
  return (<>
{toolPane === "geoml" && (<>
        {/* TASKS.csv #750 — the former Predictive tab, as a 3D Modelling tool */}
        {paneHeader("geoML models", Sparkles, "model", true /* #4070 */)}
        <Suspense fallback={null}>
          <PredictivePanel visibleHoles={visibleHoles} collars={collars} survey={survey} litho={layers.litho || []} lithoGroups={lithoGroups} modellingCodes={modellingCodes} /* #4019 */ assays={assays} assayElements={assayElements} terrain={terrain} desurveyMethod={desurveyMethod} trend={trendFor("geoml")}
            setNotices={setNotices} clipToTopo={clipToTopo} /* TASKS.csv #4017 — the Grade shell's setting */ />
        </Suspense>
        {leftOutNote}
        </>)}
  </>);
}
