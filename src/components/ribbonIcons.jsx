// TASKS.csv #3958 (Matt approved the "middle ground" of 'Review data/Text and Help batch/mock3958_ribbon_icons_middle.png') — the ribbon's own icons for the tools that
// carry it: filled, two-tone glyphs in the tool family's ribbon colour (currentColor: the colour RibbonButton passes, as it does to a line icon) with white details;
// the small geology block of #3956 only where the block IS the tool (Model, 3D slice, Level plan, Terrain, Geology). Every other ribbon icon stays a line icon, drawn
// two-tone by RibbonButton (twoTone below). Same props as a lucide icon (size, color). No words; colours: currentColor and tokens.
// Startup is near its budget (Main, 2026-11-21): the icons are compact shape lists drawn by one renderer, no per-icon gradient (the block keeps its one token gradient).
//   a shape: ["p", d, style] a path | ["r", "x y w h rx", style] | ["c", "cx cy r", style] | ["g", transform, [shapes]]
//   a style: codes joined by "|": f / f.45 the family colour (default 0.9) | w / w.6 white (--color-bg) | k:token:.65 a token fill | s:colour:width[:opacity] a stroke
//            (colour: cur or a token) | r round caps and joins
import React, { useId } from "react";

const V = (c) => `var(--color-${c})`;
function st(code = "") {
  const o = { fill: "none" };
  for (const c of code.split("|")) {
    const [h, ...v] = c.split(":");
    if (h[0] === "f") { o.fill = "currentColor"; o.fillOpacity = +(h.slice(1) || 0.9); }
    else if (h[0] === "w") { o.fill = V("bg"); if (h.length > 1) o.fillOpacity = +h.slice(1); }
    else if (h === "k") { o.fill = V(v[0]); o.fillOpacity = +(v[1] ?? 1); }
    else if (h === "s") { o.stroke = v[0] === "cur" ? "currentColor" : V(v[0]); o.strokeWidth = +v[1]; if (v[2]) o.strokeOpacity = +v[2]; }
    else if (h === "r") { o.strokeLinecap = "round"; o.strokeLinejoin = "round"; }
  }
  return o;
}
const draw = (list, pre = "") => list.map(([t, a, s], k) => {
  const key = pre + k;
  if (t === "g") return <g key={key} transform={a}>{draw(s, key)}</g>;
  const n = a.split(" ");
  if (t === "r") return <rect key={key} x={n[0]} y={n[1]} width={n[2]} height={n[3]} rx={n[4]} style={st(s)} />;
  if (t === "c") return <circle key={key} cx={n[0]} cy={n[1]} r={n[2]} style={st(s)} />;
  return <path key={key} d={a} style={st(s)} />;
});

// the mini geology block (#3956's, at icon size): a shaded top (its one token gradient), two cut faces with a band each; `top` on the top face, `after` over it
const TOP = "M3 10 L12 6 L21 10 L12 14 Z";
const BLOCK_FACES = [["p", "M3 10 L12 14 L12 21 L3 17 Z", "k:text-muted:.3"], ["p", "M3 13.2 L12 17.2 L12 19 L3 15 Z", "k:accent:.65"], ["p", "M12 14 L21 10 L21 17 L12 21 Z", "k:text-muted:.48"], ["p", "M12 17.2 L21 13.2 L21 15 L12 19 Z", "k:tier-basic:.5"]];
function Block({ top = [], after = [] }) {
  const id = `ri${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <g transform="translate(12 13.5) scale(1.18) translate(-12 -13.5)">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" style={{ stopColor: V("bg") }} /><stop offset="1" style={{ stopColor: V("text-muted"), stopOpacity: 0.45 }} /></linearGradient></defs>
      {draw(BLOCK_FACES, "f")}<path d={TOP} style={{ fill: `url(#${id})` }} />{draw(top, "t")}
      <path d={`${TOP} M3 10 V17 L12 21 L21 17 V10 M12 14 V21`} style={{ ...st("s:text-muted:0.8"), strokeLinejoin: "round" }} />
      {draw(after, "a")}
    </g>
  );
}

const STAR = (x, y) => `M${x} ${y} l1.1 2.3 2.5 .3 -1.8 1.7 .5 2.5 -2.3 -1.3 -2.3 1.3 .5 -2.5 -1.8 -1.7 2.5 -.3 Z`;
const ICONS = {
  AddData: [["p", "M4 3 H13 L18 8 V20 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 V5 a2 2 0 0 1 2 -2 Z", "f.2|s:cur:1.3"], ["r", "6.5 9 9 2.6 0.8", "f"], ["r", "6.5 13 9 1.3 0", "f.45"], ["r", "6.5 15.6 9 1.3 0", "f.45"],
    ["c", "18 17 5.2", "f|s:bg:1.2"], ["p", "M18 14.2 V19.6 M15.7 17.4 L18 19.7 L20.3 17.4", "s:bg:1.6|r"]],
  Grid: [["r", "3 3 18 18 3.5", "f"], ...[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ["r", `${5 + c * 5.1} ${5 + r * 5.1} 4.3 4.3 1`, (r + c) % 2 ? "w.95" : "w.6"]))],
  Figure: [["r", "3 2.5 18 19 2.5", "f.18|s:cur:1.3"], ["r", "5 4.5 14 3.4 1", "f"], ["r", "5 9.6 8.5 9.6 1.2", "f.68"], ["p", "M6.2 17.6 L8.4 13.8 L10 16 L11.2 14.6 L12.6 17.6 Z", "w"],
    ["r", "15 9.6 4 2 0.6", "f.6"], ["r", "15 12.8 4 2 0.6", "f.45"], ["r", "15 16 4 2 0.6", "f.3"]],
  Themes: [["r", "2.5 6 13 15 2.2", "f.25"], ["p", "M8 2.5 H19 a1.8 1.8 0 0 1 1.8 1.8 V21 L13.5 16.6 L6.2 21 V4.3 A1.8 1.8 0 0 1 8 2.5 Z", "f|s:bg:1"], ["p", STAR(13.5, 6.6), "w"]],
  DrawSection: [["p", "M2.5 21 V13 Q6 9.5 9 12 T15.5 10.5 T21.5 9 V21 Z", "f.28"], ["p", "M2.5 21 V16.5 Q6 14 9 16 T15.5 15 T21.5 14 V21 Z", "f"], ["p", "M2.5 13 Q6 9.5 9 12 T15.5 10.5 T21.5 9", "s:cur:1.6|r"],
    ["g", "rotate(40 16 6)", [["r", "13.5 0.5 4 10 1", "f|s:bg:0.9"], ["p", "M13.5 10.5 L15.5 14 L17.5 10.5 Z", "f.5|s:cur:0.8"]]]],
  Fence: [...[0, 1, 2].flatMap((k) => { const x = 2.5 + k * 6.6, y = 4 + k * 1.2; return [["p", `M${x} ${y + 2} L${x + 5.4} ${y} L${x + 5.4} ${y + 14} L${x} ${y + 16} Z`, `f${0.5 + k * 0.2}|s:bg:0.9`], ["p", `M${x} ${y + 9} Q${x + 2.7} ${y + 6.5} ${x + 5.4} ${y + 7.5}`, "s:bg:1:0.85"]]; }),
    ["p", "M2 22 L22 18.6", "s:cur:1.2:0.6"]],
  // TASKS.csv #4048 — a scanned or drawn section (a framed picture of the ground) standing on its line (the base line, its two ends marked)
  SectionImage: [["r", "3 2.5 18 15 2.2", "f.2|s:cur:1.3"], ["p", "M3 14.6 Q7 8.8 10 11.8 T15 9.8 T21 8.4 V17.5 H3 Z", "f.85"], ["c", "7.5 6.6 1.5", "w"], ["p", "M2.5 21.3 H21.5", "s:cur:1.4:0.7|r"], ["c", "4 21.3 1.7", "f|s:bg:0.9"], ["c", "20 21.3 1.7", "f|s:bg:0.9"]],
  Identify: [["c", "12 12 9.5", "f|s:bg:1:0.5"], ["r", "10.6 10.4 2.8 7.4 1.2", "w"], ["c", "12 7.2 1.75", "w"]],
  Measure: [["g", "rotate(-38 12 12)", [["r", "1.5 8 21 8 2", "f"], ...[4.5, 7.5, 10.5, 13.5, 16.5, 19.5].map((x, k) => ["r", `${x - 0.6} 8 1.2 ${k % 2 ? 2.6 : 4} 0.5`, "w"])]]],
  BestIntercepts: [["r", "8 2 5 20 2.5", "k:text-muted:.22"], ["r", "8.6 3 3.8 5 1", "k:accent:.95"], ["r", "8.6 8 3.8 4 1", "k:danger-solid:.95"], ["r", "8.6 12 3.8 6 1", "k:tier-basic:.95"], ["r", "8.6 18 3.8 3 1", "k:accent-dark:.95"],
    ["r", "7 7.6 7 4.8 1.2", "s:cur:1.6"], ["p", STAR(18.5, 4), "f.95"]],
  Satellite: [["g", "rotate(-35 12 12)", [["r", "9 8.5 6 7 1.5", "f"], ["r", "1.5 9.6 6.4 4.8 0.8", "f.35|s:cur:1.1"], ["r", "16.1 9.6 6.4 4.8 0.8", "f.35|s:cur:1.1"], ["p", "M4.7 9.6 V14.4 M19.3 9.6 V14.4", "s:cur:0.8"], ["c", "12 7 1.4", "f"]]],
    ["p", "M4 20.5 q4 -3 8 0", "s:cur:1.4:0.55|r"]],
  Snapshot: [["r", "2 6.5 20 14 3.2", "f"], ["p", "M8 6.5 L9.5 3.5 H14.5 L16 6.5 Z", "f"], ["c", "12 13.5 5", "w"], ["c", "12 13.5 3", "f.55"], ["c", "11 12.5 1", "w"], ["c", "18.5 9.3 0.9", "w"]],
};
const BLOCKS = {
  Model: { top: [["p", "M5 10.4 Q8.5 5 12 7.4 Q15.5 4.8 19 10.2 L12 13.3 Z", "f.85"], ["p", "M5 10.4 Q8.5 5 12 7.4 Q15.5 4.8 19 10.2", "s:bg:0.8:0.8"]] },
  Slice3d: { after: [["p", "M7.5 5 L16.5 9 L16.5 21.5 L7.5 17.5 Z", "f.45|s:cur:1"]] },
  LevelPlan: { after: [["p", "M2 13.5 L12 9 L22 13.5 L12 18 Z", "f.5|s:cur:1"]] },
  Terrain: { top: [["p", "M5.5 10.6 L9.5 4.5 L12.5 8.6 L14.8 6 L19 10 L12 13.2 Z", "f.75"], ["p", "M8.3 6.3 L9.5 4.5 L10.8 6.3 L9.6 6.9 Z", "w"]] },
  Geology: { top: [["p", "M3 10 L12 6 L10 10.4 L7.5 11.9 Z", "k:accent:.85"], ["p", "M12 6 L16.5 8 L13.6 12.2 L10 10.4 Z", "k:tier-basic:.8"], ["p", "M16.5 8 L21 10 L12 14 L13.6 12.2 Z", "k:info:.75"], ["p", "M14.5 9.6 l2.6 -0.9 M15.8 9.2 l-0.3 1", "s:text:0.9"]] },
};

// an icon component with a lucide icon's props; .drawn tells RibbonButton not to wash it again
function icon(shapes, block) {
  const C = ({ size = 22, color, strokeWidth: _sw, ...rest }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...rest} style={{ color, display: "block", flexShrink: 0 }}>{block ? <Block {...block} /> : draw(shapes)}</svg>
  );
  C.drawn = true;
  return C;
}
export const AddDataIcon = icon(ICONS.AddData), GridIcon = icon(ICONS.Grid), FigureIcon = icon(ICONS.Figure), ThemesIcon = icon(ICONS.Themes), DrawSectionIcon = icon(ICONS.DrawSection),
  FenceIcon = icon(ICONS.Fence), SectionImageIcon = icon(ICONS.SectionImage), IdentifyIcon = icon(ICONS.Identify), MeasureIcon = icon(ICONS.Measure), BestInterceptsIcon = icon(ICONS.BestIntercepts), SatelliteIcon = icon(ICONS.Satellite),
  SnapshotIcon = icon(ICONS.Snapshot), ModelIcon = icon(null, BLOCKS.Model), Slice3dIcon = icon(null, BLOCKS.Slice3d), LevelPlanIcon = icon(null, BLOCKS.LevelPlan),
  TerrainIcon = icon(null, BLOCKS.Terrain), GeologyIcon = icon(null, BLOCKS.Geology);

// the two-tone look for a line icon: its closed shapes take a soft wash of the same colour (lucide passes fill to its shapes)
export const twoTone = (Icon) => (Icon && !Icon.drawn ? { fill: "currentColor", fillOpacity: 0.16 } : {});
