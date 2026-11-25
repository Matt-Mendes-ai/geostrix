// TASKS.csv #4070 — the Section correlation pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "correlation"` test inside
// is ModellingPanes' own, kept as it was.
// TASKS.csv #4070 (Matt's layout C, 2026-11-24: steps, like the Guide) — its three tools are the steps, one shown at a time: 1 Fence (the panel diagram), 2 Intervals (connect intervals
// of one unit, number alternating flows, match sheet swarms: Modelling codes' correlate part), 3 Map contacts (a mapped contact projected underground, or fed to the implicit run).
// The step bar is the chooser; each tool keeps its own button, so there is no pane-wide primary.
import { GitCompare, Layers3 } from "../../../components/icons.js";
import { t as tr } from "../../../lib/i18n.js";
import StepPane from "../../../components/StepPane.jsx";
import { Suspense } from "react";

export default function CorrelationPane({ SurfaceGeologyProjection, collars, emptyPaneHint, litho_units, mapConstraint, mapLayers, mcodesPane, paneHeader, projectMapContact, setFenceOpen, setMapConstraint, surfaceStructures, terrain, toolPane }) {
  return (<>
{toolPane === "correlation" && (<>
        {paneHeader("Section correlation", GitCompare, "model", true /* #4070 */)}
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the StrixViewer tab (Add layer › Lithology), or load the sample project."))}{/* TASKS.csv #3606 — said first, as Implicit surface does */}
        <StepPane id="correlation" label={tr("Section correlation")}
          steps={[
            { key: "fence", label: tr("Fence"), question: tr("Which panel?"), body: (
              <button
                onClick={() => setFenceOpen(true)}
                disabled={!collars.length}
                className="gs-btn gs-btn--block" style={{ marginBottom: 8, opacity: collars.length ? 1 : 0.5, cursor: collars.length ? "pointer" : "default" }}
                title={collars.length ? tr("Fence / panel diagram — correlate lithology hole to hole on a vertical panel along the drill line, with each hole's offset from the section") : tr("No holes with collars yet: import collars first.") /* #1844 */}
              ><Layers3 size={14} />{" "}{tr("Fence / panel diagram…")}</button>) },
            { key: "intervals", label: tr("Intervals"), question: tr("Connect intervals of one unit."), body: <Suspense fallback={null}>{mcodesPane("correlate")}</Suspense> /* #2054 — the correlation tools themselves, beside the fence */ },
            { key: "contacts", label: tr("Map contacts"), question: tr("Take a mapped contact underground."),
              body: (<Suspense fallback={null}>{/* TASKS.csv #318 — mapped surface contacts projected underground (dip projection), or fed to the implicit model run just below as extra interface points + orientations. */}
                <SurfaceGeologyProjection
                  mapLayers={mapLayers} surfaceStructures={surfaceStructures} terrain={terrain}
                  onProject={projectMapContact} mapConstraint={mapConstraint} setMapConstraint={setMapConstraint}
                /></Suspense>) },
          ]} />
        </>)}
  </>);
}
