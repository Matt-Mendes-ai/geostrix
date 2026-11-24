// TASKS.csv #4051 — under an index layer made from a Sentinel-2 scene (Maps tab and the 3D View's layer list): which scene it is, by its date. The true-colour picture of
// the same scene is the layer row's own button (Maps tab).
import React from "react";
import { t as tr } from "../lib/i18n.js";
import { sceneOfRaster } from "../lib/sceneInfo.js";

export default function RasterScene({ raster, compact = false }) {
  const sc = sceneOfRaster(raster);
  if (!sc || !sc.date) return null;
  return (
    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginTop: compact ? -2 : 4, marginBottom: compact ? 6 : 0, paddingLeft: compact ? 8 : 0 }} title={sc.id}>
      {sc.sentinel ? tr("Sentinel-2 scene of {date}", { date: sc.date }) : tr("Scene of {date}", { date: sc.date })}
    </div>
  );
}
