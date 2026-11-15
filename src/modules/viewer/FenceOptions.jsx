// TASKS.csv #1180 — what a fence series will cover and how many sections that makes, before any is created. Mounted only while its pane is open.
import { useMemo } from "react";
import { t as tr } from "../../lib/i18n.js";
import { fenceExtentPoints, fenceLinesWithData } from "../../lib/sectionDefs.js"; // fenceLinesWithData: #2040
import { fenceTracesOf } from "../../lib/holeFilter.js"; // TASKS.csv #3561


export default function FenceOptions({ voxelModels, tracesRef, tracesSeq, visibleHoles, azimuth, width, cover, setCover, labelStyle }) {
  // tracesSeq says the ref's traces changed
  const all = tracesRef.current, traces = useMemo(() => fenceTracesOf(all, visibleHoles), [all, tracesSeq, visibleHoles]); // #3561
  const r = useMemo(() => fenceLinesWithData(fenceExtentPoints(voxelModels, traces, cover), azimuth, width, traces), [voxelModels, traces, cover, azimuth, width]);
  const n = r.lines.length;
  return (
    <>
      <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />{tr("Also cover the visible block models")}</label>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 12 }}>{tr("This makes {n} section(s).", { n })}{traces.length < (all || []).length ? " " + tr("Over the {shown} of {total} holes shown.", { shown: traces.length.toLocaleString(), total: all.length.toLocaleString() }) : ""}{r.empty > 0 ? " " + tr("{e} slab(s) with no hole or model cell are skipped.", { e: r.empty }) : ""}</div>{/* #2040 */}
    </>
  );
}
