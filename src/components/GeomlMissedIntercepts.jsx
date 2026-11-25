import React from "react";
import { missedInterceptsCsv, missReason } from "../lib/geomlIntercepts.js";
import { roughTime } from "../lib/geomlPlan.js"; // TASKS.csv #4019 — a fix's time, as the panel says a run's
import { saveFile, safeFileName } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js";

// TASKS.csv #1318 — the logged intercepts a finished geoML model does not reach, by hole and depth
// TASKS.csv #4019 (Matt: "why are so many intercepts missed?") — and why, row by row: shorter than the run's block, near the 50 % line, or far from
// the model (lib/geomlIntercepts.js missReason); result.blockM is the run's block
const cell = { padding: "1px 3px", textAlign: "right" }; // the sidebar is narrow: headers wrap, no sideways scroll
const whyText = (k) => (k === "thin" ? tr("thinner than a block") : k === "near" ? tr("near the 50 % line") : tr("far from the model"));
export default function GeomlMissedIntercepts({ result, label }) {
  if (!result?.missed?.length) return null;
  const blockM = result.blockM;
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer" }}>{tr("Missed intercepts: {m} of {n}", { m: result.missed.length, n: result.logged })}</summary>
      <div style={{ maxHeight: 220, overflow: "auto", marginTop: 4 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-xs)" }}>
          <thead><tr>
            <th style={{ ...cell, textAlign: "left" }}>{tr("Hole")}</th><th style={cell}>{tr("From (m)")}</th><th style={cell}>{tr("To (m)")}</th><th style={cell}>{tr("Length (m)")}</th><th style={cell} title={tr("The highest probability of the unit anywhere in the intercept. The model shows the unit from 50%.")}>{tr("Highest %")}</th>
            <th style={{ ...cell, textAlign: "left" }} title={blockM ? tr("Thinner than a block: under {b} m. Near the 50 % line: 30-50 %. Far: under 30 %.", { b: blockM }) : undefined}>{tr("Why")}</th>
          </tr></thead>
          <tbody>
            {result.missed.map((m) => (
              <tr key={`${m.hole_id}|${m.from}`}>
                <td style={{ ...cell, textAlign: "left" }}>{m.hole_id}</td><td style={cell}>{+m.from.toFixed(2)}</td><td style={cell}>{+m.to.toFixed(2)}</td><td style={cell}>{+(m.to - m.from).toFixed(2)}</td><td style={cell}>{Math.round(m.best * 100)}</td>
                <td style={{ ...cell, textAlign: "left" }}>{whyText(missReason(m, blockM))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="gs-btn gs-btn--sm" style={{ marginTop: 4 }} onClick={() => saveFile({ suggestedName: `${safeFileName(`missed intercepts ${label}`)}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: missedInterceptsCsv(result.missed, blockM) })}>{tr("Save the list as CSV")}</button>
    </details>
  );
}

// TASKS.csv #4019 — after a run: a weak fit said plainly with the causes this run shows, and the fixes one click away (they change the panel's
// settings; Model runs it). advice: lib/geomlIntercepts.js runAdvice; onFix({ key, ... })
const warn = { fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "5px 7px", marginTop: 4, lineHeight: 1.4 };
export function GeomlRunAdvice({ advice, mix, blockM, onFix }) {
  if (!advice || (!advice.weak && !advice.causes.length)) return null;
  const c = advice.counts, causes = advice.causes.map((k) => (
    k === "mixed" ? mixText(mix)
      : k === "thin" ? tr("{n} missed intercept(s) are thinner than the {b} m blocks.", { n: c.thin, b: blockM })
        : k === "near" ? tr("{n} came within 30 % to 50 %: the model saw the unit there, just under its line.", { n: c.near })
          : k === "fast" ? tr("A Fast run: coarse blocks and fewer iterations.")
            : tr("Its shape may be more than this model follows (folds, changes in thickness).")));
  return (
    <div role="status" style={warn}>
      {advice.weak && <div style={{ fontWeight: 600 }}>{tr("A weak fit to the logs.")}</div>}
      {causes.map((t, i) => <div key={i}>{t}</div>)}
      <div>
        {advice.fixes.map((f) => (
          <button key={f.key} type="button" className="gs-btn gs-btn--sm" style={{ marginTop: 4, marginInlineEnd: 4 }} onClick={() => onFix?.(f)}>
            {f.key === "oneUnit" ? tr("Model {u} alone", { u: f.unit })
              : f.key === "smaller" ? (f.secs ? tr("Blocks of {b} m (up to {t})", /* roughTime says "about" */ { b: f.blockM, t: roughTime(f.secs) }) : tr("Blocks of {b} m", { b: f.blockM }))
                : f.key === "standard" ? tr("Standard quality")
                  : tr("Score on held-back holes")}
          </button>
        ))}
      </div>
    </div>
  );
}
// the codes of one run that differ, and how (lib/geomlIntercepts.js unitMix)
export function mixText(mix) {
  if (!mix?.mixed) return "";
  const parts = [];
  if (mix.groups) parts.push(tr("in different litho groups ({g})", { g: mix.groups.join(", ") }));
  if (mix.roles) parts.push(tr("with different roles in Modelling codes ({r})", { r: mix.roles.map((r) => tr(r)).join(", ") }));
  if (mix.shapes) parts.push(tr("whose intercepts differ in length ({a}: median {am} m; {b}: {bm} m)", { a: mix.shapes[0].code, am: +mix.shapes[0].medianM.toFixed(1), b: mix.shapes[1].code, bm: +mix.shapes[1].medianM.toFixed(1) }));
  return tr("These codes look like different units, {how}: one unit (or one package) per run models best.", { how: parts.join("; ") });
}
