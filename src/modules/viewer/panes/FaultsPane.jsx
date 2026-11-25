// TASKS.csv #4070 — the Faults pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "faults"` test inside
// is ModellingPanes' own, kept as it was.
import { SquareSplitVertical } from "../../../components/icons.js";
import { pBtn } from "../../../lib/sidebarStyles.js";
import { lazy, Suspense } from "react";

const FaultsPanel = lazy(() => import("../FaultsPanel.jsx")); // TASKS.csv #4006 — every fault tool in one pane

export default function FaultsPane({ paneHeader, props, toolPane }) {
  return (<>
{toolPane === "faults" && (<>{/* TASKS.csv #4006 — every fault tool in one pane; it reads the props this component already has */}
        {paneHeader("Faults", SquareSplitVertical, "model", true /* #4070 */)}
        <Suspense fallback={null}><FaultsPanel {...props} pBtn={pBtn} /></Suspense>
        </>)}
  </>);
}
