// TASKS.csv #4006 (Matt, 2026-11-22: a user asked for a fault tool because he could not find the one GeoStrix has) — ONE place for every fault tool.
// TASKS.csv #4070 (Matt's layout C, 2026-11-24: steps, like the Guide) — the pane is now the builder as steps (FaultBuilder: Evidence, Faults, Shape -> Build,
// then the built faults as the Result). The rows that repeated seven tools of the 3D Modelling ribbon are gone: the ribbon names them in one line, and the two tools
// the ribbon has not (Guided fault, Interpretation lines) are buttons in the closed fold, with Domains and the Section window said in a line each. Nothing is moved:
// each tool stays where it was. Loaded with the pane (a lazy chunk of ModellingPanes).
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { requestModuleAction } from "../../lib/menuRequests.js";
import { useStore } from "../../lib/store.jsx";
import FaultBuilder from "./FaultBuilder.jsx"; // the builder, in this pane's chunk
import MoreFold from "../../components/MoreFold.jsx";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };

// the fault tools the 3D Modelling ribbon has: named in a line, opened there (a test pins that the ribbon still carries each)
export const RIBBON_FAULT_TOOLS = ["Strat. stack", "Explicit surface", "Structures", "Model from map", "Stereonet", "Downhole plot", "Core orient."];
// the ones the ribbon has not: a button each (open(ctx) opens the tool where it lives)
export function faultTools() {
  return [
    { id: "guided", name: tr("Guided fault"), open: () => requestModuleAction("guided-open", { tool: "faults" }) },
    { id: "interpret", name: tr("Interpretation lines"), open: () => requestModuleAction("interpret-lines", {}) },
  ];
}

export default function FaultsPanel(props) {
  const { activeTabId } = useStore() || {}; // the builder's choices are this project tab's (the pane outlives a tab switch)
  const other = (
    <MoreFold summary={tr("Other fault tools…")} data-fine-tune="faults">
      {faultTools().map((r) => (
        <div key={r.id} data-fault-tool={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderTop: "1px solid var(--color-divider)", fontSize: "var(--font-size-sm)" }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{r.name}</div>
          <button type="button" className="gs-btn gs-btn--sm" onClick={() => r.open(props)}>{tr("Open")}</button>
        </div>
      ))}
      <div data-fault-ribbon="" style={{ ...note, marginTop: 4 }}>{tr("In the ribbon: {tools}.", { tools: RIBBON_FAULT_TOOLS.map((n) => tr(n)).join(", ") })}</div>
      <div style={note}>{tr("Domains: fault blocks; choose the fault surface in the Domains list, below the panes.")}</div>
      <div style={note}>{tr("Section window: open a section, then Draw fault; the builder above uses the strings.")}</div>
    </MoreFold>
  );
  return (
    <div data-faults-pane="" style={{ fontSize: "var(--font-size-sm)" }}>
      <FaultBuilder key={activeTabId} {...props} fineTune={other} />{/* every kind of evidence at once; its choices are this project tab's (the pane outlives a tab switch) */}
      <div style={{ ...note, marginTop: 4 }}>{tr("A fault surface from a few points is a guess, and beyond its evidence it is extrapolated, not observed.")}</div>
    </div>
  );
}
