// TASKS.csv #640 — "interpolate the IP lines and merge them into a 3D voxel" (Matt, 2026-10-17). The inverted
// lines already in the project (their 3D block models) are merged into one block model between the lines;
// the method and its limits are in lib/sectionMerge.js's header. Runs in the estimation worker.
import React, { useMemo, useRef, useState } from "react";
import { Play } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { sectionModelsByMethod, sectionSamples, suggestMergeRadius, mergeRequest, unstretchCells, betweenLines, percentile } from "../lib/sectionMerge.js";
import { runEstimation } from "../lib/estimationClient.js";
import { logStops, sequentialStops } from "../lib/inversion.js";
import { version as APP_VERSION } from "../../package.json";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const KINDS = { ip: { label: "Chargeability", unit: "mV/V", property: "Chargeability (mV/V)", line: "IP" }, dc: { label: "Resistivity", unit: "ohm·m", property: "Resistivity (ohm·m)", line: "DC" } };
const num = (v) => (v === "" || v == null ? NaN : Number(v));

export default function DcipMergePanel({ pBtn, numInput }) {
  const { voxelModels, addVoxelModelToTab, getProjectToken } = useStore();
  const byMethod = useMemo(() => sectionModelsByMethod(voxelModels), [voxelModels]);
  const kinds = Object.keys(KINDS).filter((k) => byMethod[k].length >= 2);
  const [kindPick, setKind] = useState("ip");
  const kind = kinds.includes(kindPick) ? kindPick : kinds[0];
  const [radius, setRadius] = useState("");
  const [cell, setCell] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const abortRef = useRef(null);
  const samples = useMemo(() => (kind ? sectionSamples(byMethod[kind]) : null), [kind, byMethod]);
  const suggested = useMemo(() => (samples ? suggestMergeRadius(samples.points) : null), [samples]);
  // the lines' own cell size along the line (a line block is that long, and as thick as the cell across it)
  const lineCell = useMemo(() => {
    const c = kind && byMethod[kind][0]?.cells[0];
    const sizes = c ? [c.dx, c.dy].filter((v) => v > 0) : [];
    return sizes.length ? Math.round(Math.min(...sizes) * 10) / 10 : 25;
  }, [kind, byMethod]);

  if (!kinds.length) return null;
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { width: 104, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 78, flex: "0 1 78px", minWidth: 0 };

  const run = async () => {
    const K = KINDS[kind], models = byMethod[kind];
    const R = num(radius) > 0 ? num(radius) : suggested;
    const c = num(cell) > 0 ? num(cell) : lineCell;
    if (!(R > 0)) { setMsg({ ok: false, text: tr("Enter a search radius (m).") }); return; }
    if (!samples.points.length || !samples.dz) { setMsg({ ok: false, text: tr("The lines have no cells above their support cutoff.") }); return; }
    const token = getProjectToken();
    const req = mergeRequest(samples.points, { radius: R, cell: c, dz: samples.dz });
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setMsg(null); setBusy(0);
    const t0 = performance.now();
    try {
      const est = await runEstimation("block", req.points, req.opts, { onProgress: (f) => setBusy(f), signal: ctrl.signal });
      const cells = betweenLines(unstretchCells(est.cells, req.stretch, kind), samples.points, R);
      if (!cells.length) { setMsg({ ok: false, text: tr("No blocks: no two lines are within {R} m of each other — try a larger radius.", { R }) }); return; }
      const vals = cells.map((k) => k.value);
      const lo = percentile(vals, 0), hi = percentile(vals, 1), p75 = percentile(vals, 0.75), p98 = percentile(vals, 0.98);
      const names = models.map((m) => (m.name || "").replace(/^.*— (IP|DC) line /, "")).join(", ");
      const where = addVoxelModelToTab(token, {
        name: `${K.property} — ${K.line} lines merged (${models.length})`, property: K.property, method: `${kind}-merged`, merged: true, source: "simpeg",
        cells, colorMode: "continuous", stops: kind === "dc" ? logStops(lo, hi) : sequentialStops(0, p98), threshold: kind === "dc" ? lo : p75, opacity: 0.85,
        params: {
          tool: "Merge of inverted 2D DC/IP lines (inverse-distance, between lines)", lines: names, lineCount: models.length,
          samples: samples.points.length, method: kind === "dc" ? "IDW (power 2) on log10 resistivity" : "IDW (power 2)",
          searchRadiusM: R, searchRadiusSource: num(radius) > 0 ? "entered by user" : "suggested from the line spacing", verticalSearchM: +(R / req.stretch).toFixed(1),
          blockM: { dx: req.cell, dy: req.cell, dz: samples.dz }, blocks: cells.length,
          rule: "A block is kept only within the search radius of at least two lines and where the lines see at its depth (support cutoff), and its value uses samples from at least two lines (up to 8 per line, #664); nothing is extrapolated beyond the outer lines.",
          interpretation: "An interpolation between 2.5D sections, each of which assumes the ground does not change across its line: between lines it is a guide, not a 3D inversion.",
          generatedAt: new Date().toISOString(), app: APP_VERSION, seconds: Math.round((performance.now() - t0) / 1000),
        },
      });
      setMsg({ ok: true, text: tr("{cells} blocks of {cell} m from {models} lines ({names}), search {R} m across and {v} m vertically.{v2}{v3}", { cells: cells.length.toLocaleString(), cell: req.cell, models: models.length, names, R, v: Math.round(R / req.stretch), v2: kind === "ip" ? tr(" Showing ≥ {p75} mV/V (the top quarter) — use the model's threshold to change it.", { p75: p75.toFixed(1) }) : "", v3: where === "tab" ? tr(" Added to the project it was started in.") : where === "gone" ? tr(" That project was closed — nothing was added.") : "" }) });
    } catch (e) {
      setMsg(e.cancelled ? { ok: true, text: "Cancelled." } : { ok: false, text: e.message });
    } finally { setBusy(null); abortRef.current = null; }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="ge-section-label">{tr("Merge lines into 3D")}</div>
      <div style={small}>{tr("Interpolates the inverted lines in this project into one block model between them (inverse distance, a flat search at each depth). Only where at least two lines are within the radius and the lines see; a guide between 2.5D sections, not a 3D inversion.")}</div>
      {kinds.length > 1 && (
        <div style={row}><span style={lbl}>{tr("Property")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Property to merge")}>
            {kinds.map((k) => <option key={k} value={k}>{tr("{kind} ({n} lines)", { kind: tr(KINDS[k].label), n: byMethod[k].length })}</option>)}
          </select>
        </div>
      )}
      {kinds.length === 1 && <div style={{ ...small, marginTop: 5 }}>{tr("{kind}: {n} inverted lines.", { kind: tr(KINDS[kind].label), n: byMethod[kind].length })}</div>}
      <div style={row} title={tr("How far across from a line a block still takes its values. The suggestion reaches the next line, so every block between two lines uses both.")}><span style={lbl}>{tr("Search radius (m)")}</span>
        <input type="number" min={1} value={radius} placeholder={suggested ? String(suggested) : "m"} onChange={(e) => setRadius(e.target.value)} style={inp} aria-label={tr("Merge search radius")} />
      </div>
      <div style={row} title={tr("Block size in plan; the vertical size is the lines' own cell height.")}><span style={lbl}>{tr("Block size (m)")}</span>
        <input type="number" min={1} value={cell} placeholder={String(lineCell)} onChange={(e) => setCell(e.target.value)} style={inp} aria-label={tr("Merge block size")} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={run} disabled={busy != null} style={{ ...pBtn, flex: 1, opacity: busy != null ? 0.5 : 1 }}><Play size={14} /> {busy != null ? tr("Merging… {v}%", { v: Math.round(busy * 100) }) : tr("Merge {label} lines", { label: KINDS[kind].label.toLowerCase() })}</button>
        {busy != null && <button onClick={() => abortRef.current?.abort()} style={{ ...pBtn, width: "auto" }}>{tr("Cancel")}</button>}
      </div>
      {msg && <div role="status" style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
    </div>
  );
}
