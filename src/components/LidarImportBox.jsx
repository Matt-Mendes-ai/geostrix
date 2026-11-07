// TASKS.csv #1994 — what a lidar file holds (read from its header, no points yet) and what to make of it: a terrain from the
// ground-classified points, a thinned cloud in the 3D View, or both.
import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { t as tr } from "../lib/i18n.js";
import { crsName } from "../lib/reproject.js";
import { copcLevelsWithin, COPC_POINT_BUDGET } from "../lib/lidar.js";

export const CLOUD_TARGETS = [25000, 50000, 100000, 200000];

export default function LidarImportBox({ pending, projectEpsg, busy, onImport, onCancel, btn }) {
  const { file, info } = pending, h = info.header;
  const [wantTerrain, setWantTerrain] = useState(true);
  const [wantCloud, setWantCloud] = useState(true);
  const [target, setTarget] = useState(100000);
  const [cloudClasses, setCloudClasses] = useState("all");
  const [colourBy, setColourBy] = useState("elevation");
  const lv = info.kind === "COPC" ? copcLevelsWithin(info.nodes, COPC_POINT_BUDGET) : null;
  const n = (v) => Number(v).toLocaleString();
  const fileEpsg = info.crs.epsg;
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 6 };
  const sel = { fontSize: "var(--font-size-sm)", flex: 1 };
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 8, marginTop: 8, fontSize: "var(--font-size-sm)", lineHeight: 1.45 }} aria-label={tr("Lidar point cloud import")}>
      <div style={{ fontWeight: 600, marginBottom: 4, wordBreak: "break-all" }}>{file.name}</div>
      <div style={{ color: "var(--color-text-secondary)" }}>
        {tr("{kind} {version}, point format {fmt}: {n} points, {mb} MB.", { kind: info.kind, version: h.version, fmt: h.pointFormat, n: n(h.pointCount), mb: (file.size / 1e6).toFixed(file.size < 1e6 ? 2 : 1) })}{" "}
        {fileEpsg
          ? tr("Coordinate system: {name} (EPSG:{code}).", { name: info.crs.name || crsName(fileEpsg) || "?", code: fileEpsg })
          : tr("The file names no coordinate system: its coordinates are taken as the project's (EPSG:{code}).", { code: projectEpsg })}{" "}
        {fileEpsg && projectEpsg && Number(fileEpsg) !== Number(projectEpsg) ? tr("The points are reprojected into the project's EPSG:{code}.", { code: projectEpsg }) : ""}
      </div>
      {lv && <div style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>{tr("A COPC file: the first {d} of its {levels} octree levels are read ({read} of {all} points), an even thinning over the whole area.", { d: lv.maxDepth + 1, levels: lv.levels, read: n(lv.points), all: n(lv.allPoints) })}</div>}
      {info.kind === "LAZ" && h.pointCount > 2e7 && <div style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>{tr("Every point of a LAZ file has to be decoded: about {s} s for this one on a recent desktop (a COPC copy of it would be read a level at a time).", { s: Math.round(h.pointCount / 1.2e6) })}</div>}
      <label style={row}><input type="checkbox" checked={wantTerrain} onChange={(e) => setWantTerrain(e.target.checked)} />{tr("Terrain from the ground points (class 2)")}</label>
      <label style={row}><input type="checkbox" checked={wantCloud} onChange={(e) => setWantCloud(e.target.checked)} />{tr("Point cloud in the 3D View")}</label>
      {wantCloud && (
        <div style={{ paddingLeft: 20 }}>
          <div style={row}>{tr("Points drawn")}
            <select value={target} onChange={(e) => setTarget(Number(e.target.value))} style={sel} aria-label={tr("Points drawn")}>
              {CLOUD_TARGETS.map((v) => <option key={v} value={v}>{tr("up to {n}", { n: n(v) })}</option>)}
            </select>
          </div>
          <div style={row}>{tr("Which points")}
            <select value={cloudClasses} onChange={(e) => setCloudClasses(e.target.value)} style={sel} aria-label={tr("Which points")}>
              <option value="all">{tr("All (noise left out)")}</option>
              <option value="ground">{tr("Ground only")}</option>
              <option value="nonground">{tr("All but the ground (vegetation, buildings…)")}</option>
            </select>
          </div>
          <div style={row}>{tr("Colour by")}
            <select value={colourBy} onChange={(e) => setColourBy(e.target.value)} style={sel} aria-label={tr("Colour by")}>
              <option value="elevation">{tr("Elevation")}</option>
              <option value="intensity">{tr("Intensity")}</option>
              <option value="class">{tr("Classification code")}</option>
            </select>
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginTop: 4 }}>{tr("Each point is drawn as a symbol, like a survey reading: more points take longer to draw, and are saved with the project.")}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" style={{ ...btn, flex: 1, marginTop: 0 }} disabled={busy || (!wantTerrain && !wantCloud)} onClick={() => onImport({ wantTerrain, wantCloud, target, cloudClasses, colourBy })}>
          {busy ? <Loader2 size={14} className="spin" /> : null} {busy ? tr("Reading…") : tr("Import")}
        </button>
        <button type="button" style={{ ...btn, marginTop: 0 }} disabled={busy} onClick={onCancel}>{tr("Cancel")}</button>
      </div>
    </div>
  );
}
