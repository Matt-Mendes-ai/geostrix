// TASKS.csv #4070 — the Modelling codes pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "mcodes"` test inside
// is ModellingPanes' own, kept as it was.
import { Waypoints } from "../../../components/icons.js";
import { t as tr } from "../../../lib/i18n.js";
import { Suspense } from "react";

export default function CodesPane({ emptyPaneHint, litho_units, mcodesPane, paneHeader, toolPane }) {
  return (<>
{toolPane === "mcodes" && (<>
        {paneHeader("Modelling codes", Waypoints, "model")}
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the StrixViewer tab (Add layer › Lithology), or load the sample project."))}{/* TASKS.csv #3606 — said first, as Implicit surface does */}
        <Suspense fallback={null}>        {mcodesPane(null)}</Suspense>
        </>)}
  </>);
}
