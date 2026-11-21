// TASKS.csv #3939 — the 3D View's empty card, pictures first (Matt's worked example, 'Review data/Text and Help batch/example_help_diagram_collars.svg'):
// a collar file dropped on the view becomes drill hole traces, and the four columns the file needs. Redrawn in the app's style: green (the Basic
// path's colour) is what you do, greys are the view. The words are HTML in the app's text-size tokens (they follow the Text size setting and
// never drop below the 10 px step), so only the traces and the arrow are SVG. The box is dir="ltr": the file goes into the view left to right in
// every language, as the Help diagrams' spatial pictures do; each label keeps its own direction.
import React from "react";
import { t as tr } from "../../lib/i18n.js";

const doBox = { border: "1px dashed var(--color-tier-basic)", background: "var(--color-tier-basic-bg)", color: "var(--color-tier-basic)", borderRadius: 8, fontWeight: 600 };
const cell = { ...doBox, borderStyle: "solid", borderRadius: 6, padding: "4px 0", textAlign: "center", fontSize: "var(--font-size-base)" };

export default function CollarDropDiagram() {
  return (
    <figure role="img" aria-label={tr("A collar file dropped on the 3D view becomes drill hole traces. The file needs four columns: hole ID, x, y and z.")} title={tr("Drag your collar file here to start.")} data-collar-diagram="" dir="ltr" style={{ margin: "0 0 10px", direction: "ltr" }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <div dir="auto" style={{ ...doBox, flex: "0 0 34%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "10px 8px", fontSize: "var(--font-size-base)", lineHeight: 1.3 }}>{tr("Drop your collar file here")}</div>
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true" style={{ flex: "0 0 auto", alignSelf: "center" }}>
          <path d="M2 8 H20 M15 3 L20 8 L15 13" fill="none" style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1, border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", borderRadius: 8, padding: "4px 8px 6px", minWidth: 0 }}>
          <div dir="auto" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Ground")}</div>
          <svg viewBox="0 0 200 52" width="100%" aria-hidden="true" style={{ display: "block", maxHeight: 76 }}>
            <line x1={0} y1={4} x2={200} y2={4} style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {[[26, 33, 50], [80, 70, 50], [132, 141, 46], [178, 171, 50]].map(([x, x2, y2]) => (
              <g key={x}>
                <line x1={x} y1={4} x2={x2} y2={y2} style={{ stroke: "var(--color-tier-basic)" }} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <circle cx={x} cy={4} r={3} style={{ fill: "var(--color-tier-basic)" }} />
              </g>
            ))}
          </svg>
        </div>
      </div>
      <div dir="auto" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "8px 0 4px" }}>{tr("Your file needs these four columns")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <div dir="auto" style={cell}>{tr("Hole ID")}</div>
        {["x", "y", "z"].map((c) => <div key={c} style={cell}>{c}</div>)}
      </div>
    </figure>
  );
}
