// TASKS.csv #3939 — the empty cards' picture, pictures first (Matt's worked example, 'Review data/Text and Help batch/example_help_diagram_collars.svg'):
// a file dropped on the tab -> an arrow -> what it becomes there, and below it the columns the file needs. Redrawn in the app's style: green (the
// Basic path's colour) is what you do, greys are the view. Every word is HTML at a text-size token (it follows the Text size setting and never drops
// under the 10 px step), so only the small pictures and the arrow are SVG. The box is dir="ltr" (the file goes into the view left to right in every
// language, as the Help diagrams' spatial pictures do); each label keeps its own direction.
//   <DropDiagram picture="holes" | "points" | "plot" | "grid" | "map" drop={tr(…)} viewLabel={tr(…)} caption={tr(…)} cells={[tr("Hole ID"), "x", …]}
//                label={tr(…) — read aloud} tooltip={tr(…)} />
import React from "react";

const doBox = { border: "1px dashed var(--color-tier-basic)", background: "var(--color-tier-basic-bg)", color: "var(--color-tier-basic)", borderRadius: 8, fontWeight: 600 };
const cellStyle = { ...doBox, borderStyle: "solid", borderRadius: 6, padding: "4px 2px", textAlign: "center", fontSize: "var(--font-size-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const stroke = (c, w = 1) => ({ style: { stroke: `var(--color-${c})` }, strokeWidth: w, vectorEffect: "non-scaling-stroke" });
const fill = (c, o = 1) => ({ style: { fill: `var(--color-${c})`, fillOpacity: o } });
const both = (f, o, c, w = 1) => ({ style: { fill: `var(--color-${f})`, fillOpacity: o, stroke: `var(--color-${c})` }, strokeWidth: w, vectorEffect: "non-scaling-stroke" });

const PICTURES = {
  // drill hole traces hanging from collars on a ground line
  holes: () => (<>
    <line x1={0} y1={4} x2={200} y2={4} {...stroke("text-muted")} />
    {[[26, 33, 50], [80, 70, 50], [132, 141, 46], [178, 171, 50]].map(([x, x2, y2]) => (
      <g key={x}><line x1={x} y1={4} x2={x2} y2={y2} {...stroke("tier-basic", 2)} strokeLinecap="round" /><circle cx={x} cy={4} r={3} {...fill("tier-basic")} /></g>
    ))}
  </>),
  // a point survey: stations along lines, coloured by value
  points: () => (<>
    {[8, 22, 36].map((y, r) => [...Array(12)].map((_, i) => {
      const v = Math.exp(-(((i - 7) / 3) ** 2) - (((r - 1) / 1.4) ** 2));
      return <circle key={`${r}-${i}`} cx={12 + i * 16} cy={y + 6} r={3.4} {...fill(v > 0.55 ? "danger-solid" : v > 0.25 ? "accent" : "info", 0.9)} />;
    }))}
  </>),
  // a ternary diagram with samples
  plot: () => (<>
    <path d="M44 50 L156 50 L100 2 Z" fill="none" {...stroke("text-muted")} />
    {[[88, 40], [96, 36], [104, 30], [112, 26], [100, 42], [108, 38], [94, 44], [118, 34], [84, 46], [102, 22]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.8} {...fill("tier-basic")} />)}
  </>),
  // a gridded raster draped as cells
  grid: () => (<>
    {[...Array(4)].map((_, r) => [...Array(12)].map((_, c) => {
      const v = Math.exp(-(((c - 4) / 2.5) ** 2) - (((r - 1.5) / 1.6) ** 2));
      return <rect key={`${r}-${c}`} x={4 + c * 16} y={2 + r * 12} width={15} height={11} {...fill(v > 0.5 ? "accent" : "info", 0.25 + 0.6 * v)} />;
    }))}
  </>),
  // a terrain profile with the file dropping onto it (the Start dialog's first step)
  terrain: () => (<>
    <path d="M0 44 L0 34 L26 28 L48 32 L72 20 L96 24 L120 12 L146 22 L170 18 L200 26 L200 44 Z" {...both("text-muted", 0.18, "text-muted")} />
    <path d="M100 0 V10 M95 5 L100 10 L105 5" fill="none" {...stroke("tier-basic", 2)} strokeLinecap="round" strokeLinejoin="round" />
  </>),
  // map polygons with a contact line and a strike symbol
  map: () => (<>
    <path d="M4 4 L90 4 L76 26 L96 48 L4 48 Z" {...both("tier-basic", 0.25, "tier-basic")} />
    <path d="M90 4 L196 4 L196 48 L96 48 L76 26 Z" {...both("accent", 0.25, "accent-dark")} />
    <path d="M140 18 L160 30 M150 24 L146 30" fill="none" {...stroke("text", 1.5)} />
  </>),
  // TASKS.csv #3952 — regional map units with the fetch area drawn over them (the Macrostrat card)
  units: () => (<>
    <path d="M0 0 L70 0 L58 22 L0 30 Z" {...both("accent", 0.35, "accent-dark")} />
    <path d="M70 0 L140 0 L122 26 L84 34 L58 22 Z" {...both("tier-basic", 0.3, "tier-basic")} />
    <path d="M140 0 L200 0 L200 36 L150 44 L122 26 Z" {...both("info", 0.3, "info")} />
    <path d="M0 30 L58 22 L84 34 L96 52 L0 52 Z" {...both("danger-solid", 0.2, "danger-solid")} />
    <path d="M84 34 L122 26 L150 44 L200 36 L200 52 L96 52 Z" {...both("text-muted", 0.2, "text-muted")} />
    <rect x={64} y={10} width={74} height={32} fill="none" {...stroke("text", 1.5)} strokeDasharray="4 3" />
  </>),
};

// the picture alone, for a drop area that is already the drop box (the Start dialog)
export function DropPicture({ picture = "holes", style }) {
  const Pic = PICTURES[picture] || PICTURES.holes;
  return <svg viewBox="0 0 200 52" width="100%" aria-hidden="true" data-drop-picture={picture} style={{ display: "block", maxHeight: 64, ...style }}><Pic /></svg>;
}

export default function DropDiagram({ picture = "holes", drop, viewLabel, caption, cells = [], label, tooltip, ...rest }) {
  const Pic = PICTURES[picture] || PICTURES.holes;
  return (
    <figure role="img" aria-label={label} title={tooltip} dir="ltr" {...rest} style={{ margin: "0 0 10px", direction: "ltr" }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <div dir="auto" style={{ ...doBox, flex: "0 0 34%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "10px 8px", fontSize: "var(--font-size-base)", lineHeight: 1.3 }}>{drop}</div>
        <svg viewBox="0 0 24 16" width={24} height={16} aria-hidden="true" style={{ flex: "0 0 auto", alignSelf: "center" }}>
          <path d="M2 8 H20 M15 3 L20 8 L15 13" fill="none" style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1, border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", borderRadius: 8, padding: "4px 8px 6px", minWidth: 0 }}>
          {viewLabel && <div dir="auto" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{viewLabel}</div>}
          <svg viewBox="0 0 200 52" width="100%" aria-hidden="true" style={{ display: "block", maxHeight: 76 }}><Pic /></svg>
        </div>
      </div>
      {caption && <div dir="auto" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "8px 0 4px" }}>{caption}</div>}
      {cells.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 6 }}>
          {cells.map((c, i) => <div key={i} dir="auto" title={c} style={cellStyle}>{c}</div>)}
        </div>
      )}
    </figure>
  );
}
