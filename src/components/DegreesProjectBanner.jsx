// TASKS.csv #1148 — a project in latitude / longitude: x and y are degrees, elevations metres, so terrain draws as spikes and
// distances and volumes mean nothing (Matt: SRTM for Australia, EPSG:4326). Says so and moves everything to the metric CRS for
// the place in one click (the store's whole-project move, as Cartography does it). Lazy: only a project in degrees loads it.
import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { degreesCentre, crsCandidatesAt } from "../lib/projectCrs.js";
import { crsName } from "../lib/reproject.js";
import { requestProjectCrs } from "../lib/projectCrsRequest.js";
import { confirmDestructive } from "../lib/confirmDestructive.js";
import { t as tr } from "../lib/i18n.js";

export default function DegreesProjectBanner({ btnStyle }) {
  const { project, collars, surfaceSamples, terrain, mapLayers, reprojectProjectTo } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const target = useMemo(() => {
    const c = degreesCentre({ collars, surfaceSamples, terrain, mapLayers });
    return c ? crsCandidatesAt(c.lon, c.lat)[0] || null : null;
  }, [collars, surfaceSamples, terrain, mapLayers]);
  const move = async () => {
    if (!confirmDestructive(tr("Move every loaded object from {v} to {v2}?", { v: crsName(project.epsg) || `EPSG:${project.epsg}`, v2: target.name }), { recover: tr("Undo history is cleared.") })) return;
    setBusy(true); setErr(null);
    try { await reprojectProjectTo(target.code, { rotateAzimuths: true }); } // this banner goes with the degrees
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 14px", background: "var(--color-warn-bg)", borderBottom: "1px solid var(--color-warn-border)", color: "var(--color-warn-text)", fontSize: "var(--font-size-base)" }}>
      <span style={{ flex: 1, minWidth: 240 }}>
        {tr("This project is in latitude and longitude ({name}), but elevations are in metres, so terrain draws as spikes and distances and volumes come out wrong. Use a coordinate system in metres.", { name: crsName(project.epsg) || `EPSG:${project.epsg}` })}
        {err && <>{" "}{tr("The move failed: {message}", { message: err })}</>}
      </span>
      {target && <button type="button" disabled={busy} onClick={move} style={btnStyle}>{busy ? tr("Moving…") : tr("Move to {name}", { name: target.name })}</button>}
      <button type="button" disabled={busy} onClick={() => requestProjectCrs(tr("Choose a coordinate system in metres. This only relabels the project: to move loaded data, use Maps > Reproject."))} style={btnStyle}>{tr("Choose another…")}</button>
    </div>
  );
}
