// TASKS.csv #3978 (batch B of #3967's plan; Matt approved the mock of N1-N4, 'Review data/Text and Help batch/mock3978_help_pictures.png') — the Help
// cards' own pictures, in style A (#3956: the oblique geology block of components/DropDiagram.jsx, or a flat map tile where an oblique face would fold
// the angles together). Tokens only; no word in the SVG: each picture's legend is HTML (HelpPicture in src/help/CardPage.jsx), its labels tr() keys.
// Loaded with the Help pane, never at startup.
//   support   N1: a modelled body firm between the holes, extrapolated beyond them, held by one hole where only one cuts it
//   depth     N2: stations, a section that is data above the depth of investigation and smoothing below, another model that fits as well
//   lands     N3: a layer in the right coordinate system lands on the holes; in the wrong zone, far away
//   norths    N4: grid, true and magnetic north on a map, with the angles between them
//   cutoff    N5: a grade histogram cut at a cutoff, and the blocks above it
//   composite N6: samples of uneven length, equal composites (a short end piece, a gap with no sample), an intercept with internal dilution
//   save      N12: a file, a clock and an undo arrow (TASKS.csv #3979)
//   control   N13: a QC control chart, one standard outside its limits (TASKS.csv #3979)
import React from "react";
import { Block, V, paint, holesOnFace, collarsOnTop } from "../../components/DropDiagram.jsx";

const L = (x, t) => [x, 46 + ((x - 18) * 24) / 90 + 42 * t]; // a point on the block's front-left face: x across (18..108), t down (0..1)
const Rf = (x, t) => [x, 70 - ((x - 108) * 24) / 98 + 42 * t]; // on the front-right face (x 108..206)
const poly = (pts) => "M" + pts.map((p) => p.map((v) => +v.toFixed(1)).join(" ")).join(" L") + " Z";
const lens = (face, x0, x1, tc, th, n = 14) => {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, s = Math.sin((Math.PI * i) / n); top.push(face(x, tc - th * s)); bot.unshift(face(x, tc + th * s)); }
  return poly([...top, ...bot]);
};
const LEFT_FACE = "M18 46 L108 70 L108 112 L18 88 Z", RIGHT_FACE = "M108 70 L206 46 L206 88 L108 112 Z";
const Svg = ({ children }) => <svg viewBox="0 0 224 122" width="100%" aria-hidden="true" style={{ display: "block" }}>{children}</svg>;
// a flat tile (N4, N5, N6): rounded, lit from the top left
const Tile = ({ id, x, y, w, h }) => (<>
  <defs><radialGradient id={`${id}m`} cx="0.35" cy="0.3" r="0.9"><stop offset="0" style={{ stopColor: V("bg"), stopOpacity: 1 }} /><stop offset="1" style={{ stopColor: V("text-muted"), stopOpacity: 0.26 }} /></radialGradient></defs>
  <ellipse cx={x + w / 2} cy={y + h + 5} rx={w * 0.55} ry="4" {...paint("text-muted", 0.14)} />
  <rect x={x} y={y} width={w} height={h} rx="8" style={{ fill: `url(#${id}m)`, stroke: V("text-muted"), strokeWidth: 1 }} />
</>);
const arrowRight = (x, y) => <><line x1={x} y1={y} x2={x + 12} y2={y} style={{ stroke: V("text-muted"), strokeWidth: 1.6 }} /><path d={`M${x + 12} ${y - 4} L${x + 17} ${y} L${x + 12} ${y + 4} Z`} {...paint("text-muted", 1)} /></>;

function Support({ id }) {
  return (<Svg>
    <defs><pattern id={`${id}hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" {...paint("accent", 0.22)} /><line x1="0" y1="0" x2="0" y2="5" style={{ stroke: V("accent-dark"), strokeWidth: 1.4 }} /></pattern></defs>
    <Block id={id} after={<>
      <path d={lens(L, 34, 104, 0.52, 0.2)} {...paint("tier-basic", 0.78, "tier-basic", 1.2)} />
      <path d={lens(Rf, 108, 170, 0.5, 0.17)} {...paint("tier-basic", 0.14, "text-muted", 1.1)} strokeDasharray="3 2.5" />
      {holesOnFace([[40, 52, 0.9], [66, 58, 0.7], [90, 64, 0.85]])}
      <path d={lens(Rf, 176, 202, 0.42, 0.14, 10)} style={{ fill: `url(#${id}hatch)`, stroke: V("accent-dark"), strokeWidth: 1 }} />
      <line x1="189" y1="46" x2="190" y2="74" style={{ stroke: V("accent-dark"), strokeWidth: 3, strokeLinecap: "round" }} />
      <ellipse cx="189" cy="45" rx="3" ry="1.6" {...paint("tier-basic", 1)} />
    </>} />
  </Svg>);
}

function Depth({ id }) {
  const doi = [L(18, 0.58), L(40, 0.62), L(63, 0.6), L(86, 0.64), L(108, 0.6)];
  return (<Svg>
    <defs><clipPath id={`${id}lf`}><path d={LEFT_FACE} /></clipPath><clipPath id={`${id}rf`}><path d={RIGHT_FACE} /></clipPath></defs>
    <Block id={id} strata={false} after={<>
      <g clipPath={`url(#${id}lf)`}>
        <path d={LEFT_FACE} {...paint("tier-basic", 0.22)} />
        <ellipse cx="58" cy={L(58, 0.36)[1]} rx="20" ry="9" {...paint("danger-solid", 0.72)} />
        <ellipse cx="90" cy={L(90, 0.22)[1]} rx="12" ry="6" {...paint("info", 0.62)} />
        <ellipse cx="40" cy={L(40, 0.82)[1]} rx="22" ry="8" {...paint("danger-solid", 0.5)} />
        <path d={poly([...doi, L(108, 1), L(18, 1)])} {...paint("bg", 0.72)} />
        <path d={"M" + doi.map((p) => p.join(" ")).join(" L")} style={{ fill: "none", stroke: V("text"), strokeWidth: 1.4, strokeDasharray: "4 3" }} />
      </g>
      <g clipPath={`url(#${id}rf)`} opacity="0.55">
        <path d={RIGHT_FACE} {...paint("tier-basic", 0.18)} />
        <ellipse cx="140" cy={Rf(140, 0.42)[1]} rx="24" ry="7" {...paint("danger-solid", 0.55)} />
        <ellipse cx="178" cy={Rf(178, 0.25)[1]} rx="10" ry="6" {...paint("info", 0.5)} />
      </g>
      {[24, 37, 50, 63, 76, 89, 102].map((x) => { const [, y] = L(x, 0); return <path key={x} d={`M${x} ${y - 1} l-3 -5 h6 Z`} {...paint("text", 0.85)} />; })}
    </>} />
  </Svg>);
}

function Lands({ id }) {
  const outline = (dx, dy) => `M${122 + dx} ${40 + dy} L${150 + dx} ${29 + dy} L${190 + dx} ${33 + dy} L${186 + dx} ${48 + dy} L${150 + dx} ${53 + dy} Z`;
  return (<Svg>
    <Block id={id} after={<>
      <path d={outline(0, 0)} {...paint("tier-basic", 0.3, "tier-basic", 1.6)} />
      {collarsOnTop}
      <circle cx="200" cy="30" r="7" {...paint("tier-basic", 1)} /><path d="M196.5 30 l2.5 2.6 l4.6 -5" style={{ fill: "none", stroke: V("bg"), strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }} />
      <path d={outline(-114, -26)} style={{ fill: V("danger-solid"), fillOpacity: 0.08, stroke: V("danger-solid"), strokeWidth: 1.4, strokeDasharray: "4 3" }} />
      <path d="M78 14 Q100 6 122 22" style={{ fill: "none", stroke: V("danger-solid"), strokeWidth: 1.2, strokeDasharray: "3 3" }} /><path d="M117 20 l5 2.4 l-1.2 -5.2" style={{ fill: "none", stroke: V("danger-solid"), strokeWidth: 1.2 }} />
      <circle cx="12" cy="10" r="7" {...paint("danger-solid", 1)} /><path d="M9 7 l6 6 M15 7 l-6 6" style={{ stroke: V("bg"), strokeWidth: 1.8, strokeLinecap: "round" }} />
    </>} />
  </Svg>);
}

function Norths({ id }) {
  const o = [112, 104], end = (deg, len) => { const a = (deg * Math.PI) / 180; return [o[0] + len * Math.sin(a), o[1] - len * Math.cos(a)]; };
  const ray = (deg, len, c) => { const [x, y] = end(deg, len), a = (deg * Math.PI) / 180, h = (b) => [x - 8 * Math.sin(a + b), y + 8 * Math.cos(a + b)];
    return <><line x1={o[0]} y1={o[1]} x2={x} y2={y} style={{ stroke: V(c), strokeWidth: 2.6, strokeLinecap: "round" }} /><path d={`M${x} ${y} L${h(0.42).join(" ")} L${h(-0.42).join(" ")} Z`} {...paint(c, 1)} /></>; };
  const arc = (d0, d1, r, c) => { const [x0, y0] = end(d0, r), [x1, y1] = end(d1, r); return <path d={`M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`} style={{ fill: "none", stroke: V(c), strokeWidth: 1.4 }} />; };
  return (<Svg>
    <Tile id={id} x={52} y={4} w={120} h={108} />
    <path d="M58 70 Q84 52 108 64 T166 54 L166 104 Q140 96 112 102 T58 100 Z" {...paint("tier-basic", 0.16)} /><path d="M58 36 Q90 22 120 32 T166 26" style={{ fill: "none", stroke: V("text-muted"), strokeWidth: 0.7, strokeOpacity: 0.5 }} />
    {[72, 92, 112, 132, 152].map((x) => <line key={x} x1={x} y1="6" x2={x} y2="110" style={{ stroke: V("text-muted"), strokeWidth: 0.7, strokeOpacity: 0.45 }} />)}
    {[24, 44, 64, 84].map((y) => <line key={y} x1="54" y1={y} x2="170" y2={y} style={{ stroke: V("text-muted"), strokeWidth: 0.7, strokeOpacity: 0.35 }} />)}
    {arc(0, 10, 46, "info")}{arc(10, 27, 62, "danger-solid")}
    {ray(0, 92, "text")}{ray(10, 90, "info")}{ray(27, 86, "danger-solid")}
    <circle cx={o[0]} cy={o[1]} r="3" {...paint("text", 1)} />
  </Svg>);
}

// N5 — a histogram of grades with the cutoff across it; the blocks at or above it lit, the rest pale
const HIST = [16, 30, 44, 40, 31, 23, 16, 11, 8, 5, 3];
const CELLS = [[0.1, 0.3, 0.5, 0.2, 0.1], [0.2, 0.7, 0.9, 0.6, 0.2], [0.1, 0.6, 0.8, 0.7, 0.3], [0.1, 0.2, 0.4, 0.3, 0.1]];
function Cutoff({ id }) {
  const cut = 6, x0 = 20, bw = 7.2, base = 100, cx = x0 + cut * bw - 1;
  return (<Svg>
    <Tile id={`${id}a`} x={10} y={8} w={98} h={100} />
    {HIST.map((h, i) => <rect key={i} x={x0 + i * bw} y={base - h * 1.7} width={bw - 1.4} height={h * 1.7} rx="1" {...paint(i >= cut ? "accent" : "text-muted", i >= cut ? 0.9 : 0.32)} />)}
    <line x1="16" y1={base} x2="104" y2={base} style={{ stroke: V("text-muted"), strokeWidth: 1 }} />
    <line x1={cx} y1="16" x2={cx} y2={base + 4} style={{ stroke: V("text"), strokeWidth: 1.6, strokeDasharray: "4 3" }} />
    <path d={`M${cx - 4} 12 h8 l-4 6 Z`} {...paint("text", 1)} />
    {arrowRight(112, 58)}
    <Tile id={`${id}b`} x={134} y={18} w={82} h={72} />
    {CELLS.map((row, r) => row.map((v, c) => <rect key={`${r}-${c}`} x={140 + c * 14.4} y={24 + r * 15} width="13" height="13.6" rx="2" {...paint(v >= 0.5 ? "accent" : "text-muted", v >= 0.5 ? 0.88 : 0.12)} />))}
    <path d="M154.4 39 H197.6 V69 H183.2 V84 H168.8 V69 H154.4 Z" style={{ fill: "none", stroke: V("accent-dark"), strokeWidth: 1.6 }} />
  </Svg>);
}

// N6 — one hole three times: its samples (uneven lengths, a gap with no sample), the same metres as equal composites (a short end piece), and an
// intercept: the run at or above the cut-off, with the low sample inside it folded in as internal dilution
const SAMPLES = [[12, 22, 0.12], [22, 30, 0.55], [30, 50, 0.9], [50, 57, 0.18], [57, 72, 0.85], [72, 80, 0.1], [80, 88, null], [88, 106, 0.45]];
const COMPS = [[12, 32, 0.45], [32, 52, 0.85], [52, 72, 0.62], [72, 92, 0.2], [92, 106, 0.45]];
function Composite({ id }) {
  const col = (x, segs, faint = false) => segs.map(([a, b, g], k) => g == null
    ? <rect key={k} x={x - 7} y={a} width="14" height={b - a} style={{ fill: `url(#${id}gap)`, stroke: V("text-muted"), strokeWidth: 0.8 }} />
    : <rect key={k} x={x - 7} y={a} width="14" height={b - a - 0.6} rx="1.5" {...paint("accent", faint ? 0.15 + g * 0.35 : 0.12 + g * 0.85)} />);
  return (<Svg>
    <defs><pattern id={`${id}gap`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" {...paint("bg", 1)} /><line x1="0" y1="0" x2="0" y2="4" style={{ stroke: V("text-muted"), strokeWidth: 1.2 }} /></pattern></defs>
    <Tile id={id} x={8} y={4} w={208} h={108} />
    {col(44, SAMPLES)}
    {arrowRight(64, 58)}
    {col(112, COMPS)}
    <rect x="104" y="92" width="16" height="14" rx="2" style={{ fill: "none", stroke: V("text"), strokeWidth: 1.2, strokeDasharray: "3 2" }} />
    {arrowRight(132, 58)}
    {col(178, SAMPLES, true)}
    <path d="M192 22 h6 v50 h-6" style={{ fill: "none", stroke: V("tier-basic"), strokeWidth: 2.2, strokeLinejoin: "round" }} />
    <rect x="171" y="50" width="14" height="7" style={{ fill: "none", stroke: V("tier-basic"), strokeWidth: 1.2, strokeDasharray: "2 1.5" }} />
    {col(178, SAMPLES.filter(([, , g]) => g != null && g >= 0.5))}
  </Svg>);
}

// N12 — Save, autosave, undo: three icons on one tile (a file, a clock, an undo arrow), each coloured as its legend swatch (TASKS.csv #3979)
function SaveIcons({ id }) {
  const ico = (cx, kind) => {
    const cy = 58, ink = { fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" };
    if (kind === "file") return (<g>
      <path d={`M${cx - 18} ${cy - 26} H${cx + 6} L${cx + 18} ${cy - 14} V${cy + 26} H${cx - 18} Z`} {...paint("bg", 1, "text", 2.4)} />
      <path d={`M${cx + 6} ${cy - 26} V${cy - 14} H${cx + 18}`} style={{ ...ink, stroke: V("text"), strokeWidth: 2 }} />
      <line x1={cx - 10} y1={cy + 2} x2={cx + 10} y2={cy + 2} style={{ stroke: V("text-muted"), strokeWidth: 2.4, strokeLinecap: "round" }} />
      <line x1={cx - 10} y1={cy + 10} x2={cx + 10} y2={cy + 10} style={{ stroke: V("text-muted"), strokeWidth: 2.4, strokeLinecap: "round" }} />
      <line x1={cx - 10} y1={cy + 18} x2={cx + 2} y2={cy + 18} style={{ stroke: V("text-muted"), strokeWidth: 2.4, strokeLinecap: "round" }} />
    </g>);
    if (kind === "clock") return (<g>
      <circle cx={cx} cy={cy} r="26" {...paint("bg", 1, "info", 3)} />
      <path d={`M${cx} ${cy - 15} V${cy} L${cx + 11} ${cy + 7}`} style={{ ...ink, stroke: V("info") }} />
    </g>);
    return (<g>
      <path d={`M${cx - 20} ${cy - 4} H${cx + 6} A15 15 0 0 1 ${cx + 6} ${cy + 26} H${cx - 6}`} style={{ ...ink, stroke: V("accent"), strokeWidth: 4 }} />
      <path d={`M${cx - 12} ${cy - 16} L${cx - 24} ${cy - 4} L${cx - 12} ${cy + 8} Z`} {...paint("accent", 1)} />
    </g>);
  };
  return (<Svg>
    <Tile id={id} x={8} y={4} w={208} h={108} />
    {ico(50, "file")}
    {ico(112, "clock")}
    {ico(176, "undo")}
  </Svg>);
}

// N13 — a QC control chart: the mean and the ±2 and ±3 SD lines, a run of standards inside them and one outside (TASKS.csv #3979)
const RUN = [58, 52, 62, 66, 50, 60, 70, 56, 16, 54, 60];
function Control({ id }) {
  const x0 = 26, step = 17;
  const pts = RUN.map((y, i) => [x0 + i * step, y]);
  return (<Svg>
    <Tile id={id} x={8} y={4} w={208} h={108} />
    <line x1="16" y1="58" x2="208" y2="58" style={{ stroke: V("text"), strokeWidth: 1.4 }} />
    {[38, 78].map((y) => <line key={y} x1="16" y1={y} x2="208" y2={y} style={{ stroke: V("text"), strokeWidth: 1.2, strokeDasharray: "4 3" }} />)}
    {[26, 90].map((y) => <line key={y} x1="16" y1={y} x2="208" y2={y} style={{ stroke: V("text-muted"), strokeWidth: 1.2, strokeDasharray: "2 3" }} />)}
    <path d={"M" + pts.map((p) => p.join(" ")).join(" L")} style={{ fill: "none", stroke: V("tier-basic"), strokeWidth: 1.4 }} />
    {pts.map(([x, y], i) => y < 22
      ? <circle key={i} cx={x} cy={y} r="5" {...paint("danger-solid", 1, "bg", 1)} />
      : <circle key={i} cx={x} cy={y} r="3.4" {...paint("tier-basic", 1)} />)}
  </Svg>);
}

// legend swatches (HTML, in CardPage): what each kind looks like
export const SWATCH = {
  data: { background: "var(--color-tier-basic)", opacity: 0.8 },
  extrapolated: { background: "var(--color-bg)", border: "1.5px dashed var(--color-text-muted)" },
  oneHole: { background: "repeating-linear-gradient(45deg, var(--color-accent-dark) 0 1.5px, var(--color-warn-bg) 1.5px 5px)" },
  ink: { background: "var(--color-text)" }, info: { background: "var(--color-info)" }, danger: { background: "var(--color-danger-solid)" },
  line: { background: "none", borderTop: "2px dashed var(--color-text)", height: 0, marginTop: 6 },
  pale: { background: "var(--color-bg)", border: "1px solid var(--color-border)" }, ghost: { background: "var(--color-danger-solid)", opacity: 0.35 },
  ok: { background: "var(--color-tier-basic)", borderRadius: 999 }, bad: { background: "none", border: "1.5px dashed var(--color-danger-solid)" },
  above: { background: "var(--color-accent)" }, below: { background: "var(--color-text-muted)", opacity: 0.3 },
  grade: { background: "linear-gradient(90deg, var(--color-bg-subtle), var(--color-accent))" }, gap: { background: "repeating-linear-gradient(45deg, var(--color-text-muted) 0 1.2px, var(--color-bg) 1.2px 4px)" },
  endPiece: { background: "none", border: "1.5px dashed var(--color-text)" }, intercept: { background: "none", borderInlineEnd: "3px solid var(--color-tier-basic)", borderTop: "2px solid var(--color-tier-basic)", borderBottom: "2px solid var(--color-tier-basic)" },
};

// id -> { Pic, legend: [[swatch, English label (a tr key)]] }
export const HELP_PICTURES = {
  support: { Pic: Support, legend: [["data", "Between the holes: data"], ["extrapolated", "Beyond them: extrapolated"], ["oneHole", "Held by one hole"]] },
  depth: { Pic: Depth, legend: [["ink", "Stations"], ["line", "Depth of investigation"], ["pale", "Below it: not data"], ["ghost", "Another model that fits"]] },
  lands: { Pic: Lands, legend: [["ok", "Lands on your holes"], ["bad", "A zone off: far from them"]] },
  norths: { Pic: Norths, legend: [["ink", "Grid north"], ["info", "True north"], ["danger", "Magnetic north"]] },
  cutoff: { Pic: Cutoff, legend: [["above", "At or above the cutoff"], ["below", "Below it"], ["line", "The cutoff"]] },
  composite: { Pic: Composite, legend: [["grade", "Samples: uneven lengths"], ["above", "Equal composites"], ["gap", "No sample"], ["endPiece", "Short end piece"], ["intercept", "Intercept, with internal dilution"]] },
  save: { Pic: SaveIcons, legend: [["ink", "Save: your project file"], ["info", "Autosave: a crash copy"], ["above", "Undo: the last edit"]] },
  control: { Pic: Control, legend: [["ok", "Within its limits"], ["danger", "Outside its limits"], ["line", "Mean, ±2 and ±3 SD"]] },
};
