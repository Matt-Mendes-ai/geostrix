// TASKS.csv #3939 — the empty cards' picture, pictures first (Matt's worked example, 'Review data/Text and Help batch/example_help_diagram_collars.svg'):
// a file dropped on the tab -> an arrow -> what it becomes there, and below it the columns the file needs.
// TASKS.csv #3956 (a user: "it's got the meat and bones but not the pizazz"; Matt picked style A of 'mock3956_picture_styles.png') — the pictures are a small geology
// block: an oblique block with relief shading on top and strata on its cut faces, and each card shows what its file becomes on or in it (holes with coloured intervals,
// draped map units, survey stations, a draped grid, the ground's relief, assays beside a ternary plot); the file is a spreadsheet dropping in, the drop box is lifted,
// the columns are pills. Green (the Basic path's colour) is what you do. Colours are tokens only (shadows too: --shadow-*); every word is HTML at a text-size token
// (it follows the Text size setting and never drops under the 10 px step), so the SVG holds no text. The box is dir="ltr"; each label keeps its own direction.
//   <DropDiagram picture="holes" | "points" | "plot" | "grid" | "map" | "terrain" drop={tr(…)} viewLabel={tr(…)} caption={tr(…)} cells={[tr("Hole ID"), "x", …]}
//                label={tr(…) — read aloud} tooltip={tr(…)} />
import React, { useId } from "react";

const V = (c) => `var(--color-${c})`;
const paint = (fill, fo = 1, stroke = null, sw = 1) => ({ style: { fill: fill ? V(fill) : "none", fillOpacity: fo, stroke: stroke ? V(stroke) : "none", strokeWidth: sw } });
const Grad = ({ id, a, oa, b, ob, x2 = 0, y2 = 1 }) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}><stop offset="0" style={{ stopColor: V(a), stopOpacity: oa }} /><stop offset="1" style={{ stopColor: V(b), stopOpacity: ob }} /></linearGradient>
);

const doBox = { border: "1.5px dashed var(--color-tier-basic)", background: "linear-gradient(160deg, var(--color-bg) 0%, var(--color-tier-basic-bg) 70%)", color: "var(--color-tier-basic)",
  borderRadius: 14, fontWeight: 700, boxShadow: "var(--shadow-lift)" };
const cellStyle = { border: "1px solid var(--color-tier-basic)", background: "linear-gradient(180deg, var(--color-bg) 0%, var(--color-tier-basic-bg) 100%)", color: "var(--color-tier-basic)",
  borderRadius: 999, fontWeight: 700, boxShadow: "var(--shadow-chip)", padding: "4px 2px", textAlign: "center", fontSize: "var(--font-size-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// the block: the top face is a parallelogram; content for it is drawn in a 100 x 100 square (u to the front-left corner, v to the back) and mapped onto it
const TOP = "M18 46 L116 22 L206 46 L108 70 Z", LEFT = "M18 46 L108 70 L108 112 L18 88 Z", RIGHT = "M108 70 L206 46 L206 88 L108 112 Z";
const ON_TOP = "matrix(0.9 0.24 0.98 -0.24 18 46)";
const bandsOn = (x0, y0, x1, y1, list) => list.map(([t, c, o], k) => { const t1 = list[k + 1]?.[0] ?? 1; return <path key={k} d={`M${x0} ${y0 + 42 * t} L${x1} ${y1 + 42 * t} L${x1} ${y1 + 42 * t1} L${x0} ${y0 + 42 * t1} Z`} {...paint(c, o)} />; });
const CONTOURS = [[34, 62, 20, 15], [72, 30, 17, 12]];
function Block({ id, top = null, after = null, strata = true }) {
  return (<>
    <defs>
      <Grad id={`${id}t`} a="bg" oa={1} b="text-muted" ob={0.38} x2={0.3} y2={1} />
      <Grad id={`${id}l`} a="text-muted" oa={0.14} b="text-muted" ob={0.36} />
      <Grad id={`${id}r`} a="text-muted" oa={0.26} b="text-muted" ob={0.5} />
      {/* a lit mound: light on the side the light comes from, shading away, fading out at its foot */}
      <radialGradient id={`${id}h`} cx="0.5" cy="0.5" r="0.5" fx="0.3" fy="0.7"><stop offset="0" style={{ stopColor: V("bg"), stopOpacity: 0.95 }} /><stop offset="0.55" style={{ stopColor: V("text-muted"), stopOpacity: 0.18 }} /><stop offset="1" style={{ stopColor: V("text-muted"), stopOpacity: 0 }} /></radialGradient>
      <clipPath id={`${id}c`}><rect x="0" y="0" width="100" height="100" /></clipPath>
    </defs>
    <ellipse cx="112" cy="115" rx="96" ry="6" {...paint("text-muted", 0.16)} />
    <path d={LEFT} style={{ fill: `url(#${id}l)` }} />
    {strata && bandsOn(18, 46, 108, 70, [[0, "accent", 0.5], [0.33, "tier-basic", 0.34], [0.62, "text-muted", 0.43]])}
    <path d={RIGHT} style={{ fill: `url(#${id}r)` }} />
    {strata && bandsOn(108, 70, 206, 46, [[0, "accent", 0.4], [0.38, "tier-basic", 0.28], [0.7, "text-muted", 0.37]])}
    <path d={TOP} style={{ fill: `url(#${id}t)` }} />
    <g transform={ON_TOP}><g clipPath={`url(#${id}c)`}>
      <ellipse cx="34" cy="62" rx="30" ry="24" style={{ fill: `url(#${id}h)` }} /><ellipse cx="72" cy="30" rx="26" ry="20" style={{ fill: `url(#${id}h)` }} />
      {CONTOURS.map(([cx, cy, rx, ry], k) => <ellipse key={k} cx={cx} cy={cy} rx={rx} ry={ry} style={{ fill: "none", stroke: V("text-muted"), strokeWidth: 0.6, strokeOpacity: 0.35 }} />)}
      {top}
    </g></g>
    <path d={TOP} {...paint(null, 1, "text-muted", 1)} /><path d={LEFT} {...paint(null, 1, "text-muted", 0.8)} /><path d={RIGHT} {...paint(null, 1, "text-muted", 0.8)} />
    {after}
  </>);
}

// holes on the front face, with coloured intervals, and their collars on top
const HOLE_SEGS = [["accent", 0.25], ["danger-solid", 0.15], ["tier-basic", 0.3], ["accent-dark", 0.3]];
const holesOnFace = (spots) => spots.map(([x, y, L], k) => {
  let yy = y; const len = 44 * L;
  return (<g key={k}>{HOLE_SEGS.map(([c, f], j) => { const y2 = yy + len * f, el = <line key={j} x1={x} y1={yy} x2={x + 3} y2={y2} style={{ stroke: V(c), strokeWidth: 4, strokeLinecap: "round" }} />; yy = y2; return el; })}
    <ellipse cx={x} cy={y - 1} rx="3.2" ry="1.8" {...paint("tier-basic", 1)} /></g>);
});
const COLLARS = [[132, 38], [160, 44], [176, 36]];
const collarsOnTop = COLLARS.map(([x, y], k) => <g key={k}><ellipse cx={x} cy={y} rx="3" ry="1.7" {...paint("tier-basic", 1)} /><line x1={x} y1={y} x2={x + 1} y2={y - 7} style={{ stroke: V("tier-basic"), strokeWidth: 1.4 }} /></g>);

const PICTURES = {
  // drill holes going in, with coloured intervals
  holes: (id) => <Block id={id} after={<>{holesOnFace([[40, 52, 0.9], [66, 58, 0.7], [90, 64, 0.85]])}{collarsOnTop}</>} />,
  // a geology map draped on the top, with a strike-and-dip symbol
  map: (id) => <Block id={id} top={<>
    <path d="M0 0 L0 100 L38 100 Q52 70 30 48 Q46 22 30 0 Z" {...paint("accent", 0.7)} />
    <path d="M30 0 Q46 22 30 48 Q52 70 38 100 L72 100 Q86 60 70 34 Q80 14 66 0 Z" {...paint("tier-basic", 0.62)} />
    <path d="M66 0 Q80 14 70 34 Q86 60 72 100 L100 100 L100 0 Z" {...paint("info", 0.55)} />
    <path d="M30 0 Q46 22 30 48 Q52 70 38 100 M66 0 Q80 14 70 34 Q86 60 72 100" {...paint(null, 1, "text", 0.6)} />
  </>} after={<path d="M126 52 l14 -4 M133 50 l-2 5" {...paint(null, 1, "text", 1.6)} strokeLinecap="round" />} />,
  // TASKS.csv #3952 (side 2's Macrostrat card), in style A — regional map units draped on the block, the fetch area drawn over them
  units: (id) => <Block id={id} top={<>
    <path d="M0 0 L36 0 L30 22 L0 30 Z" {...paint("accent", 0.6)} />
    <path d="M36 0 L70 0 L62 26 L42 34 L30 22 Z" {...paint("tier-basic", 0.52)} />
    <path d="M70 0 L100 0 L100 36 L76 44 L62 26 Z" {...paint("info", 0.5)} />
    <path d="M0 30 L30 22 L42 34 L48 100 L0 100 Z" {...paint("danger-solid", 0.32)} />
    <path d="M42 34 L62 26 L76 44 L100 36 L100 100 L48 100 Z" {...paint("text-muted", 0.32)} />
    <rect x="30" y="16" width="44" height="40" fill="none" style={{ stroke: V("text"), strokeWidth: 1.6, strokeDasharray: "4 3" }} />
  </>} />,
  // a survey's stations on the ground, coloured by value
  points: (id) => <Block id={id} top={[18, 38, 58, 78].map((v, r) => [...Array(9)].map((_, i) => {
    const u = 8 + i * 10.5, val = Math.exp(-(((i - 5) / 2.2) ** 2) - (((r - 1.5) / 1.3) ** 2));
    return <circle key={`${r}-${i}`} cx={u} cy={v} r="3.2" {...paint(val > 0.55 ? "danger-solid" : val > 0.25 ? "accent" : "info", 0.95, "bg", 0.6)} />;
  }))} />,
  // assays: holes with grade intervals, and a ternary plot beside the block
  plot: (id) => <Block id={id} after={<>
    {holesOnFace([[40, 52, 0.9], [72, 60, 0.75]])}
    <ellipse cx="196" cy="40" rx="20" ry="2.5" {...paint("text-muted", 0.14)} />
    <rect x="172" y="0" width="50" height="37" rx="7" {...paint("bg", 1, "border-light", 1)} />
    <path d="M178 31 L216 31 L197 5 Z" {...paint("tier-basic-bg", 1, "text-muted", 1)} />
    {[[194, 24], [198, 22], [197, 18], [202, 26], [191, 27], [200, 14], [196, 28], [204, 28]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="1.8" {...paint("tier-basic", 0.95)} />)}
  </>} />,
  // a grid (imagery, a raster, a gridded survey) draped on the ground
  grid: (id) => <Block id={id} top={[...Array(8)].map((_, r) => [...Array(8)].map((_, c) => {
    const val = Math.exp(-(((c - 3) / 2.2) ** 2) - (((r - 4) / 2.6) ** 2));
    return <rect key={`${r}-${c}`} x={c * 12.5} y={r * 12.5} width="12.4" height="12.4" {...paint(val > 0.5 ? "accent" : "info", 0.3 + 0.6 * val)} />;
  }))} />,
  // the ground itself: relief, and the file dropping onto it (the Start dialog's first step)
  terrain: (id) => <Block id={id} top={<>
    <ellipse cx="30" cy="40" rx="24" ry="20" {...paint("tier-basic", 0.28)} /><ellipse cx="70" cy="68" rx="22" ry="18" {...paint("accent", 0.3)} />
  </>} after={<path d="M112 0 V14 M106 8 L112 14 L118 8" {...paint(null, 1, "tier-basic", 2.2)} strokeLinecap="round" strokeLinejoin="round" />} />,
};

// the file: a spreadsheet page with a folded corner, a green header row and a grid, dropping in
function FileIcon({ id }) {
  return (
    <svg viewBox="0 0 64 70" width="52" aria-hidden="true" style={{ display: "block" }}>
      <defs><Grad id={`${id}p`} a="bg" oa={1} b="bg-subtle" ob={1} /></defs>
      <ellipse cx="32" cy="66" rx="20" ry="3" {...paint("text-muted", 0.18)} />
      <g transform="rotate(-8 32 34)">
        <path d="M14 6 H40 L50 16 V58 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 V9 a3 3 0 0 1 3 -3 Z" style={{ fill: `url(#${id}p)`, stroke: V("tier-basic"), strokeWidth: 1.6 }} />
        <path d="M40 6 V13 a3 3 0 0 0 3 3 H50" {...paint("tier-basic-bg", 1, "tier-basic", 1.4)} />
        <rect x="18" y="20" width="28" height="7" rx="1.5" {...paint("tier-basic", 0.85)} />
        {[31, 37, 43, 49].map((y) => <line key={y} x1="18" y1={y} x2="46" y2={y} {...paint(null, 1, "border-light", 1)} />)}
        {[27.5, 37].map((x) => <line key={x} x1={x} y1="20" x2={x} y2="53" {...paint(null, 1, "border-light", 1)} />)}
      </g>
      <path d="M54 8 q8 6 6 16" {...paint(null, 1, "tier-basic", 1.6)} strokeLinecap="round" />
      <path d="M57 21 l3 4 l3 -4" {...paint(null, 1, "tier-basic", 1.6)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const useSvgId = () => `dd${useId().replace(/[^A-Za-z0-9]/g, "")}`; // unique per picture: two cards can be on screen at once

// the picture alone, for a drop area that is already the drop box (the Start dialog)
export function DropPicture({ picture = "holes", style }) {
  const id = useSvgId(), Pic = PICTURES[picture] || PICTURES.holes;
  return <svg viewBox="0 0 224 122" width="100%" aria-hidden="true" data-drop-picture={picture} style={{ display: "block", maxHeight: 96, ...style }}>{Pic(id)}</svg>;
}

export default function DropDiagram({ picture = "holes", drop, viewLabel, caption, cells = [], label, tooltip, ...rest }) {
  const id = useSvgId(), Pic = PICTURES[picture] || PICTURES.holes;
  return (
    <figure role="img" aria-label={label} title={tooltip} dir="ltr" {...rest} style={{ margin: "0 0 10px", direction: "ltr" }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <div style={{ ...doBox, flex: "0 0 31%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "8px 8px 10px", gap: 2, fontSize: "var(--font-size-base)", lineHeight: 1.25 }}>
          <FileIcon id={`${id}f`} />
          <div dir="auto">{drop}</div>
        </div>
        <svg viewBox="0 0 24 16" width={22} height={16} aria-hidden="true" style={{ flex: "0 0 auto", alignSelf: "center" }}>
          <path d="M2 8 H20 M15 3 L20 8 L15 13" fill="none" style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1, minWidth: 0, borderRadius: 12, background: "radial-gradient(ellipse at 50% 45%, var(--color-selected-bg) 0%, transparent 70%)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {viewLabel && <div dir="auto" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", paddingInlineStart: 6 }}>{viewLabel}</div>}
          <svg viewBox="0 0 224 122" width="100%" aria-hidden="true" data-drop-picture={picture} style={{ display: "block", maxHeight: 124 }}>{Pic(id)}</svg>
        </div>
      </div>
      {caption && <div dir="auto" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "10px 0 5px" }}>{caption}</div>}
      {cells.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 6 }}>
          {cells.map((c, i) => <div key={i} dir="auto" title={c} style={cellStyle}>{c}</div>)}
        </div>
      )}
    </figure>
  );
}
