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

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const pl = (n, one, many) => (n === 1 ? one : many); // a singular / plural pair, each its own key
const head = { fontSize: "var(--font-size-sm)", fontWeight: 600, margin: "10px 0 4px" };
const picks = (n) => pl(n, tr("{n} fault pick", { n }), tr("{n} fault picks", { n }));
const surfaces = (n) => pl(n, tr("{n} fault surface", { n }), tr("{n} fault surfaces", { n }));

// the tools, grouped; open(ctx) opens the tool (none: it is reached where the row says), has(inv) the evidence it works from ("" for none)
export function faultTools() {
  return [
    { group: tr("Build a fault surface"), rows: [
      { id: "guided", name: tr("Guided: a fault from your picks"), what: tr("Step by step: one fault surface through the fault picks in core."), open: () => requestModuleAction("guided-open", { tool: "faults" }), has: (v) => picks(v.picks) },
      { id: "structural", name: tr("Structures"), what: tr("A fault or shear surface for each named structure, from oriented picks (GemPy)."), open: () => requestModuleAction("open-pane", { pane: "structural" }), has: (v) => picks(v.picks) },
      { id: "mapmodel", name: tr("Model from map: mapped faults"), what: tr("The map's fault lines, each with a dip, in a model from the map; Pick the 6 chooses the main ones."), open: () => requestModuleAction("open-pane", { pane: "mapmodel" }), has: (v) => pl(v.mapped, tr("{n} mapped fault line", { n: v.mapped }), tr("{n} mapped fault lines", { n: v.mapped })) },
    ] },
    { group: tr("Use faults in a model"), rows: [
      { id: "stack", name: tr("Strat. stack: faults that offset it"), what: tr("Up to six faults cut the modelled units, and the units are offset across them."), open: () => requestModuleAction("open-pane", { pane: "stack" }), has: (v) => tr("{n} chosen", { n: v.inStack }) },
      { id: "explicit", name: tr("Explicit surface: fault block"), what: tr("Ends a surface at a fault surface, on the side you choose."), open: () => requestModuleAction("open-pane", { pane: "explicit" }), has: (v) => surfaces(v.surfaces) },
      { id: "domains", name: tr("Domains: fault surface"), what: tr("Splits the model into fault blocks: choose the fault surface in the Domains list, below the panes."), has: (v) => surfaces(v.surfaces) },
    ] },
    { group: tr("Draw and check fault evidence"), rows: [
      { id: "interpret", name: tr("Interpretation lines: draw a fault"), what: tr("A fault trace on the terrain or at a level, with its dip and dip direction."), open: () => requestModuleAction("interpret-lines", {}), has: (v) => tr("{n} drawn", { n: v.drawn }) },
      { id: "section", name: tr("Section window: Draw fault"), what: tr("Fault strings drawn on a section (open a section from the Sections list, then Draw fault); the builder above now uses them."), has: (v) => pl(v.sectionStrings, tr("{n} fault string", { n: v.sectionStrings }), tr("{n} fault strings", { n: v.sectionStrings })) },
      { id: "stereonet", name: tr("Stereonet"), what: tr("The poles of the fault picks and outcrop faults: one cluster suggests one fault, a scatter several."), open: (c) => c.setStereonetOpen?.(true), has: (v) => picks(v.picks + v.outcrop) },
      { id: "tadpole", name: tr("Downhole plot"), what: tr("Where each hole's structure picks sit, by depth, beside its lithology."), open: (c) => c.setTadpoleOpen?.(true), has: () => "" },
      { id: "coreorient", name: tr("Core orientation"), what: tr("A true dip and dip direction for picks in non-oriented core."), open: (c) => c.setCoreOrientOpen?.(true), has: () => "" },
    ] },
  ];
}

export default function FaultsPanel(props) {
  const { pBtn, faultCandidates, mapLayers, sections, implicitSurfaces, surfaceStructures, stackFaults } = props;
  const { layers = {}, activeTabId } = useStore() || {}; // every logged interval layer (the pane's own `layers` are the units being modelled)
  const inv = useMemo(() => faultInventory({ faultCandidates, mapLayers, sections, implicitSurfaces, surfaceStructures, stackFaults, layers }), [faultCandidates, mapLayers, sections, implicitSurfaces, surfaceStructures, stackFaults, layers]);
  const small = { ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 8px", flex: "0 0 auto" };
  const tools = faultTools();
  return (
    <div data-faults-pane="" style={{ fontSize: "var(--font-size-sm)" }}>
      <div style={note}>{tr("Every fault tool in GeoStrix, in one place. Each opens where it lives; nothing is moved.")}</div>
      <div data-fault-evidence="" style={{ ...note, marginTop: 6 }}>
        {tr("Fault evidence in this project — oriented picks: {picks} · logged intervals: {logged} · outcrop measurements: {outcrop} · mapped lines: {mapped} · drawn lines: {drawn} · section strings: {strings}", { picks: inv.picks, logged: inv.logged, outcrop: inv.outcrop, mapped: inv.mapped, drawn: inv.drawn, strings: inv.sectionStrings })}
      </div>
      <FaultBuilder key={activeTabId} {...props} />{/* every kind of evidence at once; its choices are this project tab's (the pane outlives a tab switch) */}
      {tools.map((g) => (
        <div key={g.group} role="group" aria-label={g.group}>
          <div style={head}>{g.group}</div>
          {g.rows.map((r) => {
            const has = r.has(inv);
            return (
              <div key={r.id} data-fault-tool={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{r.name}{has && <span style={{ ...note, marginLeft: 6 }}>{has}</span>}</div>
                  <div style={note}>{r.what}</div>
                </div>
                {r.open && <button type="button" style={small} onClick={() => r.open(props)} title={r.what}>{tr("Open")}</button>}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ ...note, marginTop: 8 }}>{tr("A fault surface from a few points is a guess, and beyond its evidence it is extrapolated, not observed.")}</div>
    </div>
  );
}
