import React from "react";
import { missedInterceptsCsv } from "../lib/geomlIntercepts.js";
import { saveFile, safeFileName } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js";

// TASKS.csv #1318 — the logged intercepts a finished geoML model does not reach, by hole and depth
const cell = { padding: "1px 6px", textAlign: "right", whiteSpace: "nowrap" };
export default function GeomlMissedIntercepts({ result, label }) {
  if (!result?.missed?.length) return null;
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer" }}>{tr("Missed intercepts: {m} of {n}", { m: result.missed.length, n: result.logged })}</summary>
      <div style={{ maxHeight: 220, overflow: "auto", marginTop: 4 }}>
        <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-xs)" }}>
          <thead><tr>
            <th style={{ ...cell, textAlign: "left" }}>{tr("Hole")}</th><th style={cell}>{tr("From (m)")}</th><th style={cell}>{tr("To (m)")}</th><th style={cell}>{tr("Length (m)")}</th><th style={cell} title={tr("The highest probability of the unit anywhere in the intercept. The model shows the unit from 50%.")}>{tr("Highest %")}</th>
          </tr></thead>
          <tbody>
            {result.missed.map((m) => (
              <tr key={`${m.hole_id}|${m.from}`}>
                <td style={{ ...cell, textAlign: "left" }}>{m.hole_id}</td><td style={cell}>{+m.from.toFixed(2)}</td><td style={cell}>{+m.to.toFixed(2)}</td><td style={cell}>{+(m.to - m.from).toFixed(2)}</td><td style={cell}>{Math.round(m.best * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" style={{ marginTop: 4 }} onClick={() => saveFile({ suggestedName: `${safeFileName(`missed intercepts ${label}`)}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: missedInterceptsCsv(result.missed) })}>{tr("Save the list as CSV")}</button>
    </details>
  );
}
