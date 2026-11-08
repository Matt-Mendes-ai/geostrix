// TASKS.csv #1180 — what a fence series will cover and how many sections that makes, before any is created. Mounted only while its pane is open.
import { useMemo } from "react";
import { t as tr } from "../../lib/i18n.js";
import { fenceExtentPoints, fenceLinesWithData } from "../../lib/sectionDefs.js"; // fenceLinesWithData: #2040

export default function FenceOptions({ voxelModels, tracesRef, tracesSeq, azimuth, width, cover, setCover, labelStyle }) {
  // tracesSeq says the ref's traces changed
  const r = useMemo(() => fenceLinesWithData(fenceExtentPoints(voxelModels, tracesRef.current, cover), azimuth, width, tracesRef.current), [voxelModels, tracesSeq, cover, azimuth, width]);
  const n = r.lines.length;
  return (
    <>
      <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />{tr("Also cover the visible block models")}</label>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 12 }}>{tr("This makes {n} section(s).", { n })}{r.empty > 0 ? " " + tr("{e} slab(s) with no hole or model cell are skipped.", { e: r.empty }) : ""}</div>{/* #2040 */}
    </>
  );
}
