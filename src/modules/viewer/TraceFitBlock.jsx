// TASKS.csv #4103 — what a line traced over the relief gave, in words: the fitted plane (or the dip used instead), where the heights came from, the warnings (a near-straight trace, little
// relief, level ground), and the choices: the fitted dip or the map / default one, the line's altitudes or the terrain's, a plane or an order 2 / 3 surface with its residuals and cautions.
// Shared by the Faults builder (a "Lines you chose" item) and the Vein / dyke pane ("Use a line…"). `fit` is traceFit.tracedEvidence's fit; `sel` the choices made; setSel(patch) changes them.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { smallSel } from "../../lib/sidebarStyles.js";
import MoreFold from "../../components/MoreFold.jsx";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text)" };
const points = (n) => (n === 1 ? tr("{n} point", { n }) : tr("{n} points", { n }));
const r1 = (v) => Math.round(v * 10) / 10;

const heightsWord = (src) => (src === "line" ? tr("Heights: the line's altitudes.") : src === "mixed" ? tr("Heights: the line's altitudes, else the terrain's.") : tr("Heights: the terrain's."));
const problemWord = (code, f) => (code === "straight" ? tr("A near-straight trace: any plane fits it, so its dip is unknown.")
  : code === "level" ? tr("On level ground: the plane is the ground, not a fault.")
  : tr("Little relief along the trace: the dip is known to ± {err}° only.", { err: Math.round(f.plane?.dipErrorDeg ?? 0) }));

export default function TraceFitBlock({ id, name, fit: f, sel = {}, hasZ = false, setSel, onRemove }) {
  const pl = f.plane || {}, surf = f.surface, order = sel.order || 1;
  return (
    <div data-trace-fit={id} style={{ ...note, paddingLeft: 12, marginBottom: 4 }}>
      {f.usedMapDip
        ? <div>{f.mapSource === "map" ? tr("Dip {dip}° towards {dipDir}°, from the line's attributes.", { dip: Math.round(f.dip), dipDir: Math.round(f.dipDir) }) : tr("Dip {dip}° towards {dipDir}°: the default, not measured.", { dip: Math.round(f.dip), dipDir: Math.round(f.dipDir) })}</div>
        : <div>{tr("Fitted: strike {strike}°, dip {dip}° towards {dipDir}° (± {err}°), misfit {rms} m, {points}.", { strike: Math.round(f.strike), dip: Math.round(f.dip), dipDir: Math.round(f.dipDir), err: Math.round(pl.dipErrorDeg ?? 0), rms: r1(pl.rms ?? 0), points: points(f.points) })}</div>}
      <div>{heightsWord(f.source)}{f.dropped > 0 ? ` ${tr("Points off the terrain, left out: {n}.", { n: f.dropped })}` : ""}</div>
      {(pl.problems || []).map((c) => <div key={c} style={warn}>{problemWord(c, f)}</div>)}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        {pl.ok && (pl.problems || []).length > 0 && !sel.mapDip && <button type="button" className="gs-btn gs-btn--sm" onClick={() => setSel({ mapDip: true })}>{tr("Use the map or default dip")}</button>}
        {pl.ok && sel.mapDip && <button type="button" className="gs-btn gs-btn--sm" onClick={() => setSel({ mapDip: false })}>{tr("Use the fitted dip")}</button>}
        {hasZ && <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tr("Heights")}
          <select value={sel.heights || "auto"} onChange={(e) => setSel({ heights: e.target.value })} style={smallSel} aria-label={tr("Heights of {name}", { name })}>
            <option value="auto">{tr("The line's altitudes")}</option>
            <option value="terrain">{tr("The terrain")}</option>
          </select></label>}
        <button type="button" className="gs-btn gs-btn--sm" onClick={onRemove}>{tr("Remove the line")}</button>
      </div>
      {/* the surface choice and its cautions wait in a fold (the words are kept, out of the way), which opens by itself once an order 2 / 3 surface is asked for */}
      <MoreFold key={order > 1 ? "open" : "closed"} open={order > 1} data-more-surface="" style={{ marginTop: 4, marginBottom: 0 }}
        summary={`${tr("Surface")}: ${order === 1 ? tr("Plane") : order === 2 ? tr("Order 2 surface") : tr("Order 3 surface")}`}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tr("Surface")}
          <select value={order} onChange={(e) => setSel({ order: Number(e.target.value) })} style={smallSel} aria-label={tr("Surface of {name}", { name })}>
            <option value={1}>{tr("Plane")}</option>
            <option value={2}>{tr("Order 2 surface")}</option>
            <option value={3}>{tr("Order 3 surface")}</option>
          </select></label>
        {order > 1 && !surf && <div style={warn}>{tr("Too few points for an order {n} surface: the plane is used.", { n: order })}</div>}
        {surf && <div>{tr("Residuals: {rms} m typical, {worst} m worst, {terms} coefficients from {points}.", { rms: r1(surf.rms), worst: r1(surf.worst), terms: surf.terms, points: points(surf.n) })}</div>}
        {surf?.caution.includes("overfit") && <div style={warn}>{tr("Few points for this order: the surface may follow noise rather than the fault.")}</div>}
        {surf?.caution.includes("line") && <div style={warn}>{tr("The points lie along one line, so the surface across it is not fixed by them.")}</div>}
        {surf?.caution.includes("extrapolates") && <div style={warn}>{tr("A higher order bends where there are no points: do not trust it beyond the line.")}</div>}
      </MoreFold>
    </div>
  );
}
