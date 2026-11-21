// TASKS.csv #3899 (Text and Help batch, T4; plan_fable 3.3) — the Help pages' diagrams: a picture where a page would otherwise take a paragraph.
// Loaded with the Help pane (never at startup). Never exported, so colours are the page's CSS variables and sizes its font tokens (they follow
// the Text size setting); labels are tr() keys of three words or fewer. A page names its diagram and gives it an alt sentence ({ diagram: { id,
// alt } }), set as the figure's label and read by the search. The workflow and the Basic / Advanced cards are HTML, so they follow the reading
// direction (Arabic reads them right to left); the spatial ones are SVG in a dir="ltr" box and never mirror. No screenshots.
import React from "react";
import { t as tr } from "../../lib/i18n.js";

const card = { border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)", padding: "6px 8px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", lineHeight: 1.3 };
const num = { fontWeight: 700, color: "var(--color-accent-dark)", marginInlineEnd: 4 };
const svgText = (size = "sm") => ({ fontSize: `var(--font-size-${size})`, fill: "var(--color-text)" });
const muted = (size = "xs") => ({ fontSize: `var(--font-size-${size})`, fill: "var(--color-text-muted)" });
const ltr = { direction: "ltr" };

// D1 — the usual order of work, as numbered cards
function Workflow() {
  const steps = [tr("Add data"), tr("Check it"), tr("Look in 3D"), tr("Sections and logs"), tr("Lay out a page"), tr("Export")];
  return (
    <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((s, i) => <li key={i} style={card}><span style={num}>{i + 1}</span>{s}</li>)}
    </ol>
  );
}

// D2 — which file goes where: the table on the left, where it lands on the right
function FilesWhere() {
  const rows = [["collars.csv", tr("Collars")], ["survey.csv", tr("Survey")], ["litho.csv", tr("A log layer")], ["assays.csv", tr("Geochem assays")], ["sg.csv", tr("Density layer")]];
  const H = 30 * rows.length + 8;
  return (
    <div dir="ltr" style={ltr}>
      <svg viewBox={`0 0 300 ${H}`} width="100%" aria-hidden="true">
        {rows.map(([file, where], i) => { const y = 8 + i * 30; return (
          <g key={file}>
            <rect x={2} y={y} width={104} height={22} rx={4} style={{ fill: "var(--color-bg-subtle)", stroke: "var(--color-border)" }} />
            <text x={54} y={y + 15} textAnchor="middle" style={svgText("xs")}>{file}</text>
            <line x1={110} y1={y + 11} x2={158} y2={y + 11} style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1.4} />
            <path d={`M158 ${y + 7} L166 ${y + 11} L158 ${y + 15} Z`} style={{ fill: "var(--color-text-muted)" }} />
            <rect x={170} y={y} width={128} height={22} rx={4} style={{ fill: i === 3 ? "var(--color-tier-advanced-bg)" : "var(--color-tier-basic-bg)", stroke: "var(--color-border)" }} />
            <text x={234} y={y + 15} textAnchor="middle" style={svgText("xs")}>{where}</text>
          </g>); })}
      </svg>
    </div>
  );
}

// D3 — a section, a fence and a strip log, in plan: one line through holes, several parallel lines, one hole down its length
function SectionFenceLog() {
  const holes = [[30, 40], [55, 62], [78, 34], [96, 70], [60, 90]];
  const dots = (dx) => holes.map(([x, y], i) => <circle key={i} cx={x + dx} cy={y} r={3} style={{ fill: "var(--color-text)" }} />);
  return (
    <div dir="ltr" style={ltr}>
      <svg viewBox="0 0 330 150" width="100%" aria-hidden="true">
        <rect x={4} y={14} width={104} height={100} rx={4} style={{ fill: "var(--color-bg-subtle)", stroke: "var(--color-border)" }} />
        {dots(0)}
        <line x1={14} y1={48} x2={104} y2={60} style={{ stroke: "var(--color-accent)" }} strokeWidth={2.5} />
        <rect x={113} y={14} width={104} height={100} rx={4} style={{ fill: "var(--color-bg-subtle)", stroke: "var(--color-border)" }} />
        {dots(109)}
        {[34, 58, 82].map((y) => <line key={y} x1={122} y1={y} x2={212} y2={y + 10} style={{ stroke: "var(--color-accent)" }} strokeWidth={2} />)}
        <rect x={222} y={14} width={104} height={100} rx={4} style={{ fill: "var(--color-bg-subtle)", stroke: "var(--color-border)" }} />
        {[["#d9b44a", 22], ["#7aa95c", 30], ["#c0504d", 18], ["#7aa95c", 22]].reduce((acc, [c, h]) => { const y = acc.y; acc.out.push(<rect key={y} x={264} y={y} width={20} height={h} style={{ fill: c, stroke: "var(--color-border)" }} />); acc.y += h; return acc; }, { y: 20, out: [] }).out}
        <text x={56} y={130} textAnchor="middle" style={svgText()}>{tr("Section")}</text>
        <text x={56} y={145} textAnchor="middle" style={muted()}>{tr("one line")}</text>
        <text x={165} y={130} textAnchor="middle" style={svgText()}>{tr("Fence")}</text>
        <text x={165} y={145} textAnchor="middle" style={muted()}>{tr("several lines")}</text>
        <text x={274} y={130} textAnchor="middle" style={svgText()}>{tr("Strip log")}</text>
        <text x={274} y={145} textAnchor="middle" style={muted()}>{tr("one hole")}</text>
      </svg>
    </div>
  );
}

// D5 — Basic and Advanced: the two groups of tabs, with what each group is for
function BasicAdvanced() {
  const group = (tier, title, tabs, note) => (
    <div style={{ ...card, background: tier === "basic" ? "var(--color-tier-basic-bg)" : "var(--color-tier-advanced-bg)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>{tabs.map((t) => <span key={t} style={{ border: "1px solid var(--color-border)", borderRadius: 4, padding: "1px 6px", background: "var(--color-bg)", fontSize: "var(--font-size-xs)" }}>{tr(t)}</span>)}</div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{note}</div>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {group("basic", tr("Basic"), ["StrixViewer", "Maps", "Layout"], tr("Everyday work"))}
      {group("advanced", tr("Advanced"), ["Geological Mapping", "3D Modelling", "Geochem", "Geophysics", "Targeting"], tr("Specialist tools"))}
    </div>
  );
}

// D6 — a Layout sheet: where the usual elements sit on a landscape page
function LayoutSheet() {
  const box = (x, y, w, h, label, accent = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} style={{ fill: accent ? "var(--color-selected-bg)" : "var(--color-bg)", stroke: "var(--color-border)" }} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" style={svgText("xs")}>{label}</text>
    </g>
  );
  return (
    <div dir="ltr" style={ltr}>
      <svg viewBox="0 0 300 200" width="100%" aria-hidden="true">
        <rect x={2} y={2} width={296} height={196} rx={4} style={{ fill: "var(--color-bg-subtle)", stroke: "var(--color-text-muted)" }} />
        {box(12, 12, 190, 140, tr("A view"), true)}
        {box(210, 12, 78, 80, tr("Legend"))}
        {box(210, 98, 78, 24, tr("North arrow"))}
        {box(210, 128, 78, 24, tr("Scale bar"))}
        {box(12, 160, 276, 30, tr("Title block"))}
      </svg>
    </div>
  );
}

// D4 — build a model (TASKS.csv #3887, the First steps guide): the logs down two holes, the one question a guided tool asks, the model it builds
function BuildModel() {
  const units = ["#d9b44a", "#7aa95c", "#c0504d"];
  const hole = (x, off) => [[0, 30 + off], [30 + off, 40], [70 + off, 30 - off]].map(([y0, h], i) => <rect key={`${x}-${i}`} x={x} y={14 + y0} width={12} height={h} style={{ fill: units[i], stroke: "var(--color-border)" }} />);
  const arrow = (x1, x2, y) => (
    <g>
      <line x1={x1} y1={y} x2={x2 - 8} y2={y} style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1.4} />
      <path d={`M${x2 - 8} ${y - 4} L${x2} ${y} L${x2 - 8} ${y + 4} Z`} style={{ fill: "var(--color-text-muted)" }} />
    </g>
  );
  return (
    <div dir="ltr" style={ltr}>
      <svg viewBox="0 0 300 150" width="100%" aria-hidden="true">
        {hole(22, 0)}{hole(52, 10)}
        {arrow(72, 104, 64)}
        <rect x={106} y={42} width={88} height={44} rx={6} style={{ fill: "var(--color-tier-basic-bg)", stroke: "var(--color-border)" }} />
        <text x={150} y={68} textAnchor="middle" style={svgText("xs")}>?</text>
        {arrow(196, 226, 64)}
        <rect x={230} y={14} width={62} height={30} style={{ fill: units[0], stroke: "var(--color-border)" }} />
        <rect x={230} y={44} width={62} height={44} style={{ fill: units[1], stroke: "var(--color-border)" }} />
        <rect x={230} y={88} width={62} height={26} style={{ fill: units[2], stroke: "var(--color-border)" }} />
        <text x={43} y={134} textAnchor="middle" style={svgText()}>{tr("Your logs")}</text>
        <text x={150} y={134} textAnchor="middle" style={svgText()}>{tr("One question")}</text>
        <text x={261} y={134} textAnchor="middle" style={svgText()}>{tr("A model")}</text>
      </svg>
    </div>
  );
}

export const DIAGRAMS = { workflow: Workflow, filesWhere: FilesWhere, sectionFenceLog: SectionFenceLog, buildModel: BuildModel, basicAdvanced: BasicAdvanced, layoutSheet: LayoutSheet };
