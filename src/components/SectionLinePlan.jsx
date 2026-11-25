import React, { useEffect, useRef, useState } from "react";
import { planFrame } from "../lib/sectionGeoref.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #3924 — the small plan the section georeferencer asks "Where is this section on the map?" on: the collars, the saved cross-sections
// (click one to use it), the figures already placed (dashed) and the chosen line with its left and right ends. In drawing mode two clicks draw
// the line: the first is the figure's left end. With `extent` ({ from, to } m along the line) it previews where the figure will stand.
// Colours are CSS variables in style props, so the plan follows the theme; the coordinates are physical (the SVG keeps dir="ltr" from app.css).
export default function SectionLinePlan({ collars = [], sections = [], images = [], line = null, pickedId = null, drawing = false, onPick, onDrawn, extent = null, size = 320 }) {
  const svgRef = useRef(null);
  const [first, setFirst] = useState(null);
  const [hover, setHover] = useState(null);
  useEffect(() => { if (!drawing) { setFirst(null); setHover(null); } }, [drawing]);
  const f = planFrame({ collars, sections, images, line });
  if (!f) return <div style={empty}>{tr("No holes or saved sections yet: type the ends.")}</div>;
  const k = size / (f.x1 - f.x0);
  const sx = (x) => (x - f.x0) * k, sy = (y) => (f.y1 - y) * k;
  const toWorld = (e) => {
    const r = svgRef.current.getBoundingClientRect(), s = size / r.width;
    return { x: f.x0 + ((e.clientX - r.left) * s) / k, y: f.y1 - ((e.clientY - r.top) * s) / k };
  };
  const onClick = (e) => {
    if (!drawing) return;
    const p = toWorld(e);
    if (!first) { setFirst(p); return; }
    setFirst(null); setHover(null);
    onDrawn?.(first, p);
  };
  const ok = line && !line.error;
  const at = (d) => ({ x: line.a.x + d * line.ux, y: line.a.y + d * line.uy });
  // an end's label stays inside the plan: anchored at its start near the left edge, at its end near the right edge
  const endLabel = (x, y, text) => <text x={Math.min(size - 2, Math.max(2, x))} y={y + 14 > size - 2 ? y - 8 : y + 14} fontSize={10} textAnchor={x < 40 ? "start" : x > size - 40 ? "end" : "middle"} style={{ fill: "var(--color-accent-dark)" }}>{text}</text>;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: "block", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, cursor: drawing ? "crosshair" : "default" }}
      role="img" aria-label={tr("Plan of the drillholes, the saved sections and the chosen section line")} onClick={onClick} onMouseMove={(e) => { if (drawing && first) setHover(toWorld(e)); }}>
      {collars.map((c, i) => Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)) && <circle key={`c${i}`} cx={sx(Number(c.x))} cy={sy(Number(c.y))} r={2.2} style={{ fill: "var(--color-text-muted)" }} />)}
      {images.map((im) => { const c = im.corners; if (!Array.isArray(c) || c.length !== 4) return null; return (
        <line key={im.id} x1={sx(c[0][0])} y1={sy(c[0][1])} x2={sx(c[1][0])} y2={sy(c[1][1])} strokeDasharray="5 3" strokeWidth={2} style={{ stroke: "var(--color-info)" }}><title>{tr("Placed figure: {name}", { name: im.name })}</title></line>); })}
      {sections.map((s) => { const picked = s.id === pickedId; return (
        <g key={s.id} style={{ cursor: drawing ? "crosshair" : "pointer" }} onClick={(e) => { if (drawing) return; e.stopPropagation(); onPick?.(s.id); }}>
          <title>{tr("Saved section: {name}", { name: s.name })}</title>
          <line x1={sx(s.ax)} y1={sy(s.ay)} x2={sx(s.bx)} y2={sy(s.by)} strokeWidth={12} style={{ stroke: "transparent" }} />
          <line x1={sx(s.ax)} y1={sy(s.ay)} x2={sx(s.bx)} y2={sy(s.by)} strokeWidth={picked ? 0 : 1.6} style={{ stroke: "var(--color-text-muted)" }} />
          <text x={(sx(s.ax) + sx(s.bx)) / 2} y={(sy(s.ay) + sy(s.by)) / 2 - 4} fontSize={10} textAnchor="middle" style={{ fill: "var(--color-text-muted)" }}>{s.name}</text>
        </g>); })}
      {ok && <g pointerEvents="none">
        <line x1={sx(line.a.x)} y1={sy(line.a.y)} x2={sx(line.b.x)} y2={sy(line.b.y)} strokeWidth={3} style={{ stroke: "var(--color-accent)" }} />
        {extent && Number.isFinite(extent.from) && Number.isFinite(extent.to) && (() => { const p = at(extent.from), q = at(extent.to); return <line x1={sx(p.x)} y1={sy(p.y)} x2={sx(q.x)} y2={sy(q.y)} strokeWidth={7} strokeLinecap="round" style={{ stroke: "var(--color-success-border)" }}><title>{tr("Where the figure will stand")}</title></line>; })()}
        <circle cx={sx(line.a.x)} cy={sy(line.a.y)} r={4} style={{ fill: "var(--color-accent)" }} />
        <circle cx={sx(line.b.x)} cy={sy(line.b.y)} r={4} style={{ fill: "var(--color-bg)", stroke: "var(--color-accent)" }} strokeWidth={2} />
        {endLabel(sx(line.a.x), sy(line.a.y), tr("left end"))}
        {endLabel(sx(line.b.x), sy(line.b.y), tr("right end"))}
      </g>}
      {drawing && first && <g pointerEvents="none">
        <circle cx={sx(first.x)} cy={sy(first.y)} r={4} style={{ fill: "var(--color-accent)" }} />
        {hover && <line x1={sx(first.x)} y1={sy(first.y)} x2={sx(hover.x)} y2={sy(hover.y)} strokeWidth={2} strokeDasharray="4 3" style={{ stroke: "var(--color-accent)" }} />}
      </g>}
      <text x={size - 12} y={16} fontSize={11} fontWeight={600} textAnchor="middle" style={{ fill: "var(--color-text-muted)" }}>N</text>
      <line x1={size - 12} y1={20} x2={size - 12} y2={34} strokeWidth={1.5} style={{ stroke: "var(--color-text-muted)" }} />
    </svg>
  );
}

const empty = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", border: "1px dashed var(--color-border-light)", borderRadius: 6, padding: 12, maxWidth: 320 };
