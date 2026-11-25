// TASKS.csv #4006 (Matt, 2026-11-22: a user asked for a fault tool because he could not find the one GeoStrix has) — ONE place for every fault tool.
// The 3D Modelling ribbon's Faults button opens this pane: each fault tool of the app is a row here, saying what it does and what fault
// evidence the project holds for it, with a button that opens that tool where it lives (its own pane, the guided card, a window). Nothing is
// moved: each tool stays where it was, and is now also found from here. Loaded with the pane (a lazy chunk of ModellingPanes).
import React, { useMemo } from "react";
import { t as tr } from "../../lib/i18n.js";
import { requestModuleAction } from "../../lib/menuRequests.js";
import { faultInventory } from "../../lib/faultInventory.js";
import { useStore } from "../../lib/store.jsx";
import FaultBuilder from "./FaultBuilder.jsx"; // the builder, in this pane's chunk
import MoreFold from "../../components/MoreFold.jsx"; // what each tool does, behind More (Matt: less text first)

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const pl = (n, one, many) => (n === 1 ? one : many); // a singular / plural pair, each its own key
const head = { fontSize: "var(--font-size-sm)", fontWeight: 600, margin: "10px 0 4px" };
const picks = (n) => pl(n, tr("{n} fault pick", { n }), tr("{n} fault picks", { n }));
const surfaces = (n) => pl(n, tr("{n} fault surface", { n }), tr("{n} fault surfaces", { n }));

// the tools, grouped; open(ctx) opens the tool (none: it is reached where the More fold says), has(inv) the evidence it works from ("" for none).
// One line each in view (#4006 follow-up, Matt: less text); what each does is behind the pane's More.
export function faultTools() {
  return [
    { group: tr("Build a fault surface"), rows: [
      { id: "guided", name: tr("Guided fault"), open: () => requestModuleAction("guided-open", { tool: "faults" }), has: (v) => picks(v.picks) },
      { id: "structural", name: tr("Structures"), open: () => requestModuleAction("open-pane", { pane: "structural" }), has: (v) => picks(v.picks) },
      { id: "mapmodel", name: tr("Model from map"), open: () => requestModuleAction("open-pane", { pane: "mapmodel" }), has: (v) => pl(v.mapped, tr("{n} mapped fault line", { n: v.mapped }), tr("{n} mapped fault lines", { n: v.mapped })) },
    ] },
    { group: tr("Use faults in a model"), rows: [
      { id: "stack", name: tr("Strat. stack"), open: () => requestModuleAction("open-pane", { pane: "stack" }), has: (v) => tr("{n} chosen", { n: v.inStack }) },
      { id: "explicit", name: tr("Explicit surface"), open: () => requestModuleAction("open-pane", { pane: "explicit" }), has: (v) => surfaces(v.surfaces) },
      { id: "domains", name: tr("Domains"), has: (v) => surfaces(v.surfaces) },
    ] },
    { group: tr("Draw and check fault evidence"), rows: [
      { id: "interpret", name: tr("Interpretation lines"), open: () => requestModuleAction("interpret-lines", {}), has: (v) => tr("{n} drawn", { n: v.drawn }) },
      { id: "section", name: tr("Section window"), has: (v) => pl(v.sectionStrings, tr("{n} fault string", { n: v.sectionStrings }), tr("{n} fault strings", { n: v.sectionStrings })) },
      { id: "stereonet", name: tr("Stereonet"), open: (c) => c.setStereonetOpen?.(true), has: (v) => picks(v.picks + v.outcrop) },
      { id: "tadpole", name: tr("Downhole plot"), open: (c) => c.setTadpoleOpen?.(true), has: () => "" },
      { id: "coreorient", name: tr("Core orientation"), open: (c) => c.setCoreOrientOpen?.(true), has: () => "" },
    ] },
  ];
}

export default function FaultsPanel(props) {
  const { faultCandidates, mapLayers, sections, implicitSurfaces, surfaceStructures, stackFaults } = props;
  const { layers = {}, activeTabId } = useStore() || {}; // every logged interval layer (the pane's own `layers` are the units being modelled)
  const inv = useMemo(() => faultInventory({ faultCandidates, mapLayers, sections, implicitSurfaces, surfaceStructures, stackFaults, layers }), [faultCandidates, mapLayers, sections, implicitSurfaces, surfaceStructures, stackFaults, layers]);
  const tools = faultTools();
  return (
    <div data-faults-pane="" style={{ fontSize: "var(--font-size-sm)" }}>
      <div data-fault-evidence="" style={note}>
        {tr("Evidence: picks {picks} · logged {logged} · outcrop {outcrop} · mapped {mapped} · drawn {drawn} · section {strings}", { picks: inv.picks, logged: inv.logged, outcrop: inv.outcrop, mapped: inv.mapped, drawn: inv.drawn, strings: inv.sectionStrings })}
      </div>
      <FaultBuilder key={activeTabId} {...props} />{/* every kind of evidence at once; its choices are this project tab's (the pane outlives a tab switch) */}
      {tools.map((g) => (
        <div key={g.group} role="group" aria-label={g.group}>
          <div style={head}>{g.group}</div>
          {g.rows.map((r) => {
            const has = r.has(inv);
            return (
              <div key={r.id} data-fault-tool={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{r.name}{has && <span style={{ ...note, marginLeft: 6 }}>{has}</span>}</div>
                {r.open && <button type="button" className="gs-btn gs-btn--sm" onClick={() => r.open(props)}>{tr("Open")}</button>}
              </div>
            );
          })}
        </div>
      ))}
      <MoreFold style={{ ...note, marginTop: 6 }}>
        <div>{tr("Each tool opens where it lives; nothing is moved.")}</div>
        <div>{tr("Guided fault: one surface through the core's fault picks, step by step.")}</div>
        <div>{tr("Structures: a fault or shear surface for each named structure (GemPy).")}</div>
        <div>{tr("Model from map: the map's fault lines, each with a dip; Pick the 6 chooses the main ones.")}</div>
        <div>{tr("Strat. stack: up to six faults offset the modelled units.")}</div>
        <div>{tr("Explicit surface: a surface ends at a fault, on the side you choose.")}</div>
        <div>{tr("Domains: fault blocks; choose the fault surface in the Domains list, below the panes.")}</div>
        <div>{tr("Interpretation lines: a fault trace on the terrain or at a level, with its dip.")}</div>
        <div>{tr("Section window: open a section, then Draw fault; the builder above uses the strings.")}</div>
        <div>{tr("Stereonet: one cluster of poles suggests one fault, a scatter several.")}</div>
        <div>{tr("Downhole plot: each hole's structure picks by depth, beside its lithology.")}</div>
        <div>{tr("Core orientation: a true dip and dip direction for picks in non-oriented core.")}</div>
      </MoreFold>
      <div style={{ ...note, marginTop: 4 }}>{tr("A fault surface from a few points is a guess, and beyond its evidence it is extrapolated, not observed.")}</div>
    </div>
  );
}
