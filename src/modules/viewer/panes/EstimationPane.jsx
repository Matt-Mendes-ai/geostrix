// TASKS.csv #4070 — the Grade estimation pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "gradeEst"` test inside
// is ModellingPanes' own, kept as it was.
import BlockCalculatorLauncher from "../../../components/BlockCalculatorLauncher.jsx";
import GradeTonnageLauncher from "../../../components/GradeTonnageLauncher.jsx";
import { Activity, Calculator, FileBarChart2 } from "../../../components/icons.js";
import MoreFold from "../../../components/MoreFold.jsx";
import StepPane from "../../../components/StepPane.jsx";
import { t as tr } from "../../../lib/i18n.js";
import { lazy, Suspense } from "react";

const GradeThicknessModal = lazy(() => import("../../../components/GradeThicknessModal.jsx")); // TASKS.csv #2419

export default function EstimationPane({ assayElements, assays, collars, gtOpen, layers, modelArea, paneHeader, setGradeEstOpen, setGtOpen, setVariogramOpen, survey, toolPane, visibleHoles }) {
  return (<>
{toolPane === "gradeEst" && (<>
        {paneHeader("Grade estimation", Calculator, "model", true /* #4070 */)}
        <StepPane id="estimation" label={tr("Grade estimation")}
          steps={[
            { key: "estimate", label: tr("Estimate"), question: tr("Fill a block model from the assays?"), hint: tr("Fills a block model from composited assays by nearest neighbour, inverse distance, moving least squares or ordinary kriging: a separate workflow from the implicit surface tools."), body: (<>
        {gtOpen && <Suspense fallback={null}><GradeThicknessModal assays={assays} assayElements={assayElements} collars={collars} survey={survey} layers={layers} inArea={modelArea === "checked" ? (id) => visibleHoles?.[id] !== false : null} /* #3016 */ onClose={() => setGtOpen(false)} /></Suspense>}
            </>) },
          ]}
          action={{ label: tr("Estimate grade into block model…"), onClick: () => setGradeEstOpen(true), disabled: !assayElements.length, icon: <FileBarChart2 size={14} /> }}
          fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="estimation">
        {/* TASKS.csv #2419 — grade × thickness per hole and its plan estimate: a thin flat body, lighter than a block model */}
        <button onClick={() => setGtOpen(true)} disabled={!assayElements.length} className="gs-btn gs-btn--block" style={{ opacity: assayElements.length ? 1 : 0.5, marginBottom: 8 }} title={tr("Per hole, thickness and grade × thickness from the intercepts; graduated on a plan, estimated in 2D and contoured at a GT cut-off you choose")}>
          <FileBarChart2 size={14} />{" "}{tr("Grade × thickness, in plan or on a long section…") /* #3089 */}</button>
        {/* TASKS.csv #147 — deliberately sits directly under the estimation button, because it is the
            diagnostic you are supposed to run BEFORE choosing a search radius or an anisotropy ratio,
            not a separate curiosity. It does NOT feed the estimator (GeoStrix still does not krige) —
            the modal itself says so up front; see VariogramModal.jsx's header. */}
        <button onClick={() => setVariogramOpen(true)} disabled={!assayElements.length} className="gs-btn gs-btn--block" style={{ opacity: assayElements.length ? 1 : 0.5, marginBottom: 16 }}>
          <Activity size={14} />{" "}{tr("Variogram / spatial continuity…")}</button>
        <GradeTonnageLauncher />{/* TASKS.csv #1577 */}
        <BlockCalculatorLauncher />{/* TASKS.csv #3164 */}
          </MoreFold>} />

        {/* TASKS.csv #176 — lithology groups: lump codes logged differently for the same real unit
            (AND + BAS, SLT + GWK...) into one modelled unit. Same terse add/remove-list style as the
            Layers "+ Group" header above and CoreOrientationCalculator's field-reference library —
            a short, infrequently-edited list, not a modal workflow. */}
        </>)}
  </>);
}
