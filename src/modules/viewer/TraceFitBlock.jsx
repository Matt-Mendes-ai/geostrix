// TASKS.csv #4103 — what a line traced over the relief gave, in one line (Main: "Dip 55° → 120° ± 3°, RMS 4 m, 38 points (terrain)"), and when the dip is poorly constrained ONE sentence and the
// button that swaps in the map / default dip. The surface choice (plane, order 2 / 3), its residuals and the order caution wait behind a small Details, which opens by itself once an order 2 / 3
// surface is asked for. Shared by the Faults builder (a "Lines you chose" item) and the Vein / dyke pane ("Use a line…"). `fit` is traceFit.tracedEvidence's fit; `sel` the choices made.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { smallSel } from "../../lib/sidebarStyles.js";
import MoreFold from "../../components/MoreFold.jsx";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text)" };
const points = (n) => (n === 1 ? tr("{n} point", { n }) : tr("{n} points", { n }));
const r1 = (v) => Math.round(v * 10) / 10;

const sourceWord = (src) => (src === "line" ? tr("line altitudes") : src === "mixed" ? tr("line altitudes, terrain") : tr("terrain"));
// the most telling problem first: no plane at all, then the ground itself, then a dip known only roughly
const PROBLEM_ORDER = ["straight", "level", "little-relief"];
const problemWord = (code, f) => (code === "straight" ? tr("Near-straight trace: any plane fits, so the dip is unknown.")
  : code === "level" ? tr("Level ground: the plane is the ground, not a fault.")
  : tr("Little relief: the dip is known only to ± {err}°.", { err: Math.round(f.plane?.dipErrorDeg ?? 0) }));

// why a chosen line gave no fit (traceFit.tracedEvidence's `why`): one sentence
export const traceFailureWord = (why, name) => (why === "few" ? tr("{name}: fewer than three points to fit.", { name })
  : why === "degrees" ? tr("{name}: the line is in degrees: set the project's CRS and import it again.", { name })
  : tr("{name}: no height: no altitudes on the line and no terrain.", { name }));

export default function TraceFitBlock({ id, name, fit: f, sel = {}, hasZ = false, setSel, onRemove }) {
  const pl = f.plane || {}, surf = f.surface, order = sel.order || 1;
  const problem = PROBLEM_ORDER.find((c) => (pl.problems || []).includes(c));
  const dip = Math.round(f.dip), dd = Math.round(f.dipDir);
  return (
    <div data-trace-fit={id} style={{ ...note, paddingLeft: 12, marginBottom: 4 }}>
      {f.usedMapDip
        ? <div>{f.mapSource === "map" ? tr("Dip {dip}° → {dipDir}°, from the line's attributes.", { dip, dipDir: dd }) : tr("Dip {dip}° → {dipDir}°, the default (not measured).", { dip, dipDir: dd })}</div>
        : <div>{tr("Dip {dip}° → {dipDir}° ± {err}°, RMS {rms} m, {points} ({source}).", { dip, dipDir: dd, err: Math.round(pl.dipErrorDeg ?? 0), rms: r1(pl.rms ?? 0), points: points(f.points), source: sourceWord(f.source) })}</div>}
      {problem && <div style={warn}>{problemWord(problem, f)}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        {pl.ok && problem && !sel.mapDip && <button type="button" className="gs-btn gs-btn--sm" onClick={() => setSel({ mapDip: true })}>{tr("Use the map or default dip")}</button>}
        {pl.ok && sel.mapDip && <button type="button" className="gs-btn gs-btn--sm" onClick={() => setSel({ mapDip: false })}>{tr("Use the fitted dip")}</button>}
        {hasZ && <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tr("Heights")}
          <select value={sel.heights || "auto"} onChange={(e) => setSel({ heights: e.target.value })} style={smallSel} aria-label={tr("Heights of {name}", { name })}>
            <option value="auto">{tr("The line's altitudes")}</option>
            <option value="terrain">{tr("The terrain")}</option>
          </select></label>}
        <button type="button" className="gs-btn gs-btn--sm" onClick={onRemove}>{tr("Remove the line")}</button>
      </div>
      <MoreFold key={order > 1 ? "open" : "closed"} open={order > 1} data-more-surface="" style={{ marginTop: 4, marginBottom: 0 }} summary={tr("Details")}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tr("Surface")}
          <select value={order} onChange={(e) => setSel({ order: Number(e.target.value) })} style={smallSel} aria-label={tr("Surface of {name}", { name })}>
            <option value={1}>{tr("Plane")}</option>
            <option value={2}>{tr("Order 2 surface")}</option>
            <option value={3}>{tr("Order 3 surface")}</option>
          </select></label>
        {f.dropped > 0 && <div>{tr("Points off the terrain, left out: {n}.", { n: f.dropped })}</div>}
        {order > 1 && !surf && <div style={warn}>{tr("Too few points for an order {n} surface: the plane is used.", { n: order })}</div>}
        {surf && <div>{tr("Residuals: {rms} m typical, {worst} m worst, {terms} coefficients from {points}.", { rms: r1(surf.rms), worst: r1(surf.worst), terms: surf.terms, points: points(surf.n) })}</div>}
        {surf?.caution.includes("overfit") && <div style={warn}>{tr("Few points for this order: the surface may follow noise rather than the fault.")}</div>}
        {surf?.caution.includes("line") && <div style={warn}>{tr("The points lie along one line, so the surface across it is not fixed by them.")}</div>}
        {surf?.caution.includes("extrapolates") && <div style={warn}>{tr("A higher order bends where there are no points: do not trust it beyond the line.")}</div>}
      </MoreFold>
    </div>
  );
}
