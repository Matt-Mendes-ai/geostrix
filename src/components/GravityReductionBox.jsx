// TASKS.csv #1985 — gravity reductions of a point survey in the Python engine (python-sidecar/app/geophys/pfields.py "gravred"):
// observed gravity less the normal gravity at each station (Boule, WGS84, closed form at the station's height) is the free-air
// anomaly; less the Bouguer plate (2 pi G rho h) or less the gravity of the loaded terrain (Harmonica's prism layer: every terrain
// node a prism from sea level to the ground) it is the Bouguer anomaly. The results are new point surveys beside the readings.
import React, { useMemo, useRef, useState } from "react";
import { runPfieldsJob } from "../lib/desktop.js";
import { getProj4Def, reprojectXY } from "../lib/reproject.js";
import { terrainGrid, looksAbsoluteGravity } from "../lib/gravityReduction.js";
import { surveyKey, replaceSurveyPoints } from "../lib/geophysSurveys.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, marginTop: 4 };
const lbl = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: "var(--font-size-sm)", marginTop: 5 };

export default function GravityReductionBox({ survey, rows, epsg, terrain, setLayers, updateGeophysSurvey, numInput, pBtn }) {
  const pts = useMemo(() => rows.filter((r) => surveyKey(r) === survey && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)), [rows, survey]);
  const withZ = useMemo(() => pts.filter((r) => Number.isFinite(r.z)), [pts]);
  const median = useMemo(() => { const v = pts.map((r) => r.value).sort((a, b) => a - b); return v[v.length >> 1]; }, [pts]);
  const looksAbsolute = looksAbsoluteGravity(median);
  const [input, setInput] = useState(looksAbsolute ? "observed" : "freeair");
  const [correction, setCorrection] = useState(terrain ? "topo" : "plate");
  const [density, setDensity] = useState("2670");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const abort = useRef(null);
  const run = async () => {
    setMsg(null);
    if (!withZ.length) { setMsg({ ok: false, text: tr("The readings have no elevation: a gravity reduction needs each station's height.") }); return; }
    if (input === "observed" && !(await getProj4Def(epsg)) ) { setMsg({ ok: false, text: tr("The project's coordinate system (EPSG:{code}) is not one GeoStrix can convert to latitude, which the normal gravity needs.", { code: epsg }) }); return; }
    if (correction === "topo" && !terrain) { setMsg({ ok: false, text: tr("A topographic correction needs a terrain (Maps > Terrain).") }); return; }
    const ll = withZ.map((r) => (input === "observed" ? reprojectXY(r.x, r.y, epsg, 4326) : { x: 0, y: 0 }));
    const req = {
      op: "gravred", input, correction, density: Number(density) || 2670,
      lon: ll.map((q) => q?.x ?? 0), lat: ll.map((q) => q?.y ?? 0), height: withZ.map((r) => r.z), g: withZ.map((r) => r.value),
      ...(correction === "topo" ? { terrain: terrainGrid(terrain), easting: withZ.map((r) => r.x), northing: withZ.map((r) => r.y) } : {}),
    };
    abort.current = new AbortController();
    setBusy(tr("Starting the Python engine…"));
    const t0 = Date.now();
    const res = await runPfieldsJob(req, { signal: abort.current.signal, onProgress: (p) => setBusy(p.message || tr("Working…")) });
    setBusy(null);
    if (!res.ok) { setMsg({ ok: !!res.cancelled, text: res.cancelled ? tr("Cancelled.") : tr("The gravity reduction failed: {message}", { message: res.error }) }); return; }
    const d = res.data, dens = Number(density) || 2670;
    const out = [];
    const faName = `${survey} — ${tr("free-air anomaly")}`;
    const bName = correction === "topo" ? `${survey} — ${tr("Bouguer anomaly (ρ {d}, terrain)", { d: dens })}` : `${survey} — ${tr("Bouguer anomaly (ρ {d}, plate)", { d: dens })}`;
    const mk = (vals, name) => withZ.map((r, i) => ({ x: r.x, y: r.y, z: r.z, value: +Number(vals[i]).toFixed(3), _src: name, ...(r.line != null ? { line: r.line } : {}) }));
    if (input === "observed") out.push(...mk(d.freeAir, faName));
    if (d.bouguer) out.push(...mk(d.bouguer, bName));
    if (!out.length) { setMsg({ ok: false, text: tr("Nothing to add: the readings are already a free-air anomaly and no Bouguer correction was asked for.") }); return; }
    setLayers((l) => ({ ...l, geophys_pts: replaceSurveyPoints(l.geophys_pts, out).rows }));
    if (input === "observed") updateGeophysSurvey(faName, { method: "grav_fa", units: "mGal" });
    if (d.bouguer) updateGeophysSurvey(bName, { method: "grav", units: "mGal" });
    const stat = (a) => { const s = a.slice().sort((x, y) => x - y); return `${s[Math.floor(0.02 * (s.length - 1))].toFixed(1)} … ${s[Math.floor(0.98 * (s.length - 1))].toFixed(1)}`; };
    setMsg({ ok: true, text: [
      tr("{n} station(s) reduced in {s} s.", { n: withZ.length.toLocaleString(), s: Math.round((Date.now() - t0) / 1000) }),
      input === "observed" ? tr("Free-air anomaly (observed less WGS84 normal gravity at each station's height): {r} mGal (2-98 %), the survey \"{name}\".", { r: stat(d.freeAir), name: faName }) : "",
      d.bouguer ? tr("Bouguer anomaly, density {d} kg/m³, {how}: {r} mGal (2-98 %), the survey \"{name}\".", { d: dens, how: correction === "topo" ? tr("less the gravity of the terrain's prisms") : tr("less the Bouguer plate"), r: stat(d.bouguer), name: bName }) : "",
      correction === "topo" && Number.isFinite(d.nearestEdgeM) ? tr("The terrain reaches {near} km past the nearest station ({med} km for half of them): masses beyond it are not in the correction, so widen the terrain if that is close.", { near: (d.nearestEdgeM / 1000).toFixed(1), med: (d.medianEdgeM / 1000).toFixed(1) }) : "",
      pts.length > withZ.length ? tr("{n} reading(s) with no elevation were left out.", { n: (pts.length - withZ.length).toLocaleString() }) : "",
      tr("Heights are the readings' elevations (above sea level): with heights above the ellipsoid the free-air result is the gravity disturbance instead."),
    ].filter(Boolean).join(" ") });
  };
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 7, marginTop: 6 }} aria-label={tr("Gravity reductions")}>
      <label style={lbl}>{tr("The readings are")}
        <select value={input} onChange={(e) => setInput(e.target.value)} style={{ ...numInput, width: "auto" }} aria-label={tr("The readings are")}>
          <option value="observed">{tr("observed gravity (absolute, mGal)")}</option>
          <option value="freeair">{tr("a free-air anomaly (mGal)")}</option>
        </select></label>
      {input === "observed" && !looksAbsolute && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("These values (median {m}) do not look like absolute gravity, which is about 978,000-983,000 mGal.", { m: Math.round(median).toLocaleString() })}</div>}
      <label style={lbl}>{tr("Bouguer correction")}
        <select value={correction} onChange={(e) => setCorrection(e.target.value)} style={{ ...numInput, width: "auto" }} aria-label={tr("Bouguer correction")}>
          <option value="none">{tr("none (free air only)")}</option>
          <option value="plate">{tr("Bouguer plate")}</option>
          <option value="topo" disabled={!terrain}>{tr("the terrain's prisms (complete)")}</option>
        </select></label>
      {correction !== "none" && <label style={lbl}>{tr("Density (kg/m³)")}<input type="number" min="1000" max="4000" step="10" value={density} onChange={(e) => setDensity(e.target.value)} style={{ ...numInput, width: 70 }} aria-label={tr("Density (kg/m³)")} /></label>}
      <div style={note}>{tr("2,670 kg/m³ is the conventional crustal density; use the rocks' own where they are known. The terrain's prisms run from sea level to the ground over the terrain's extent, rock above sea level and water against rock below.")}</div>
      {!busy ? <button type="button" onClick={run} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Reduce")}</button>
        : <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}><span style={{ ...note, marginTop: 0, flex: 1 }}>{busy}</span><button type="button" onClick={() => abort.current?.abort()} style={{ ...pBtn, width: "auto", marginTop: 0, marginBottom: 0 }}>{tr("Cancel")}</button></div>}
      {msg && <div role="status" style={{ ...note, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{msg.text}</div>}
    </div>
  );
}
