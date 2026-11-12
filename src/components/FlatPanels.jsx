// TASKS.csv #2650 — Stope outlines' answer to its own flat-body warning (#2438): the body judged by grade-thickness in square panels
// (lib/flatPanels.js). The model, grade cut-off and density are the pane's; the panel side and the GT cut-off are typed here, with no default.
import React, { useMemo, useState } from "react";
import { blockModelGrid, gridPanels } from "../lib/flatPanels.js";
import { gradeUnitText } from "../lib/pitShell.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginTop: 4 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const sig = (v) => String(Number(Number(v).toPrecision(3)));

export default function FlatPanels({ model, cutoff, density, unit, element, inputStyle }) {
  const [panelText, setPanelText] = useState(""), [gtText, setGtText] = useState("");
  const panelM = Number(panelText), gtCut = Number(gtText);
  const grid = useMemo(() => (model ? blockModelGrid(model.cells, cutoff) : null), [model, cutoff]);
  const res = useMemo(() => (grid && panelM > 0 && gtText !== "" && gtCut >= 0 ? gridPanels(grid, { panelM, gtCut, density }) : null), [grid, panelM, gtText, gtCut, density]);
  const u = `${gradeUnitText(unit, element)}${element ? ` ${element}` : ""}`.trim();
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
      <div style={{ ...note, marginTop: 0 }}>{tr("Panels for a flat body: each column's thickness at or above the cut-off, and its grade × thickness; a panel counts when its mean grade × thickness reaches the cut-off below.")}</div>
      <label style={row}>{tr("Panel side (m)")}<input type="number" min={0} step="any" value={panelText} onChange={(e) => setPanelText(e.target.value)} style={inputStyle} aria-label={tr("Panel side (m)")} /></label>
      <label style={row}>{tr("Grade × thickness cut-off ({u}·m)", { u })}<input type="number" min={0} step="any" value={gtText} onChange={(e) => setGtText(e.target.value)} style={inputStyle} aria-label={tr("Grade × thickness cut-off")} /></label>
      {res && <div style={{ ...note, color: "var(--color-text-secondary)" }}>{res.totals.orePanels
        ? tr("{n} of {m} panels reach it: {a} ha, {t} t at {g} {u} over a mean {h} m.", { n: res.totals.orePanels, m: res.totals.panels, a: sig(res.totals.area / 10000), t: big(res.totals.tonnes), g: sig(res.totals.grade), u, h: sig(res.totals.thick) })
        : tr("None of the {m} panels reaches it.", { m: res.totals.panels })}</div>}
      {res && <div style={note}>{tr("From the block model: the panels are squares on the model's plan, not a mine design. For panels from the drillholes' own grade × thickness: 3D Modelling › Grade estimation › Grade × thickness in plan, its Panel side.")}</div>}
    </div>
  );
}
