// TASKS.csv #3888 (platform redesign P5, design.md section 4, screens 1 and 2) — "Let's begin a project!": two steps, loaded only when they show.
//  1. The ground: drop a terrain (a GeoTIFF DEM, read by the terrain importer's own parser, lib/raster.js parseDEMFiles, as Maps > Terrain reads
//     it), or "I don't have one: make one for me" (the Copernicus GLO-30 download, offered in step 2 once the collars say where the project is,
//     on a click), or skip. A table dropped here is handed on to step 2.
//  2. Your drilling: ONE drop area for every file; each drop goes to the same entry a drop on the 3D view uses ("import-dropped-files", the
//     view's import pipeline), so the column matching and the coordinate-system questions open over this dialog (they sit above it). A checklist
//     (lib/startChecklist.js) fills itself in from what the project holds.
// "I'm not using drill hole data" keeps only 'Anything else' and opens the project on Maps. "Do not show this when GeoStrix starts" is a personal
// setting (lib/startFlow.js). Offline, or the download declined, the project keeps the collar heights and says so. Nothing is fetched without a click.
import React, { useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { requestModuleAction } from "../lib/menuRequests.js";
import { startOptedOut, setStartOptOut } from "../lib/startFlow.js";
import { groundFileKind, terrainSummary, crsWords, groundStrip, startChecklist, startDestination } from "../lib/startChecklist.js";
import { crsName } from "../lib/reproject.js";
import { projectEpsgChooser } from "../lib/adoptCrs.js";
import { fetchAreaBox } from "../lib/dataExtent.js";
import { tieOf } from "../lib/localGridTie.js";
import { panel, rowBtn } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";

const Z = 55; // under every other dialog (60; the import's column matching 62): they open over this one
const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const link = { background: "none", border: "none", padding: 0, color: "var(--color-primary)", cursor: "pointer", font: "inherit", textDecoration: "underline" };

function DropArea({ onFiles, multiple, accept, label, busy }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div data-start-drop="" onDragOver={(e) => { stop(e); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { stop(e); setOver(false); const f = Array.from(e.dataTransfer?.files || []); if (f.length) onFiles(f); }}
      style={{ border: `2px dashed ${over ? "var(--color-primary)" : "var(--color-border)"}`, borderRadius: 8, padding: "22px 16px", textAlign: "center", background: over ? "var(--color-selected-bg)" : "var(--color-bg-subtle)" }}>
      <div style={{ marginBottom: 10 }}>{label}</div>
      <button type="button" style={rowBtn(true)} disabled={busy} onClick={() => input.current?.click()}>{busy ? tr("Reading…") : tr("Browse…")}</button>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; if (f.length) onFiles(f); }} />
    </div>
  );
}

export default function StartDialogs({ reason = "launch", onClose, goTo, onOpenProject }) {
  const store = useStore();
  const { project, terrain, addTerrain, setEpsg, projectIsEmpty, collars } = store;
  const [step, setStep] = useState(1);
  const [noDrill, setNoDrill] = useState(false);
  const [ground, setGround] = useState(null); // "file" | "make" | "skip"
  const [note, setNote] = useState(null); // { text, warn }
  const [busy, setBusy] = useState(false);
  const [carried, setCarried] = useState([]); // tables dropped on the ground step: imported when step 2 opens
  const [optOut, setOptOut] = useState(() => startOptedOut());
  const [stripDone, setStripDone] = useState(null); // the "make the ground" strip's answer, said in one line
  const epsg = project?.epsg ?? null;

  const importFiles = (files) => { goTo?.("viewer"); requestModuleAction("import-dropped-files", { files }); }; // the 3D view's own entry (#2019)
  const next = () => { setStep(2); setNote(null); if (carried.length) { importFiles(carried); setCarried([]); } };
  const finish = () => { onClose?.(); goTo?.(startDestination({ noDrill, collars: collars?.length || 0 })); };

  // step 1: a terrain file (GeoTIFF) through the terrain importer's parser; anything else waits for step 2
  const onGroundFiles = async (files) => {
    const tifs = files.filter((f) => groundFileKind(f.name) === "terrain"), rest = files.filter((f) => groundFileKind(f.name) !== "terrain");
    if (rest.length) setCarried((c) => [...c, ...rest]);
    if (!tifs.length) { setNote({ text: tr(rest.length === 1 ? "That looks like a table or a map, not a terrain: it goes in the next step." : "Those look like tables or maps, not a terrain: they go in the next step.") }); return; }
    setBusy(true); setNote(null);
    try {
      const { parseDEMFiles } = await import("../lib/raster.js");
      const tie = tieOf(project);
      const parsed = await parseDEMFiles(tifs, tie ? null : epsg, null, { tie, chooseProjectEpsg: projectEpsgChooser({ isEmpty: projectIsEmpty, setEpsg, fileName: tifs[0].name }) });
      if (terrain && !window.confirm(tr("Replace the current terrain (\"{name}\") with \"{name2}\"? Only one terrain surface is supported at a time.", { name: terrain.name, name2: parsed.name }))) { setBusy(false); return; }
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null });
      setGround("file");
      const sum = terrainSummary(parsed), crsNow = parsed.reprojectedTo || parsed.epsgTag || epsg;
      const where = parsed.epsgTag || crsNow ? crsWords(crsNow, crsName(crsNow)) : tr("This file does not say where on Earth it is. GeoStrix will use your drill holes' coordinate system for it: check it on the Maps tab once they are in.");
      setNote({ text: [sum?.text, where, rest.length ? tr("The other files go in the next step.") : ""].filter(Boolean).join(" "), warn: !parsed.epsgTag && !crsNow });
    } catch (e) {
      setNote({ text: tr("{name}: GeoStrix could not read it as a terrain ({error}). Try another file, or make one for me.", { name: tifs[0].name, error: String(e?.message || e) }), warn: true });
    } finally { setBusy(false); }
  };

  // step 2's strip: the Copernicus GLO-30 download for the collars' area, on a click; offline or failed: the collar heights, said
  const strip = step === 2 ? groundStrip({ choice: ground, collars: collars?.length || 0, terrain: !!terrain, epsg: tieOf(project) ? null : epsg }) : null;
  const makeGround = async () => {
    const offline = () => setStripDone({ text: tr("No internet connection: using the collar heights for now. Add a terrain later with Add data."), warn: true });
    if (typeof navigator !== "undefined" && navigator.onLine === false) { offline(); return; }
    setBusy(true);
    try {
      const box = fetchAreaBox(collars, store.surfaceSamples || []);
      const { toLonLat } = await import("../lib/reproject.js");
      const ll = await Promise.all([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => toLonLat(x, y, epsg)));
      if (ll.some((p) => !p)) throw new Error(tr("the project's coordinate system could not be turned into latitude and longitude"));
      const ext = ll.reduce((b, p) => [Math.min(b[0], p.lon), Math.min(b[1], p.lat), Math.max(b[2], p.lon), Math.max(b[3], p.lat)], [Infinity, Infinity, -Infinity, -Infinity]);
      const { fetchCopernicusTerrain } = await import("../lib/copernicusDem.js");
      const parsed = await fetchCopernicusTerrain({ lonMin: ext[0], latMin: ext[1], lonMax: ext[2], latMax: ext[3], targetEpsg: epsg, gridMax: 200 });
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null, source: parsed.source || null });
      setStripDone({ text: [terrainSummary(parsed)?.text, tr("Copernicus GLO-30 shows the ground as it was in 2011-2015: ground mined since then reads lower than in older terrain, and older collars can sit above it.")].filter(Boolean).join(" ") });
    } catch (e) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) offline();
      else setStripDone({ text: tr("The ground could not be downloaded ({error}): using the collar heights for now. Add a terrain later with Add data.", { error: String(e?.message || e) }), warn: true });
    } finally { setBusy(false); }
  };

  const rows = step === 2 ? startChecklist(store, { noDrill }) : [];
  const title = step === 1 ? tr("Step 1 of 2: the ground.") : noDrill ? tr("Step 2 of 2: your data.") : tr("Step 2 of 2: your drilling.");
  const noteLine = (n) => n && <div role="status" style={{ ...small, marginTop: 8, color: n.warn ? "var(--color-warn-text)" : "var(--color-text)" }}>{n.text}</div>;

  return (
    <div data-start-dialog={step} style={{ position: "fixed", inset: 0, zIndex: Z, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,10,14,0.45)" }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ge-start-title" style={{ ...panel({ width: "min(560px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)" }), overflow: "auto", padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h2 id="ge-start-title" style={{ margin: 0, fontSize: "var(--font-size-xl)" }}>{tr("Let's begin a project!")}</h2>
          <button type="button" style={link} onClick={onClose}>{tr("Close")}</button>
        </div>
        <div style={{ ...small, margin: "4px 0 12px" }}>{title}</div>

        {step === 1 && (<>
          <DropArea busy={busy} accept=".tif,.tiff,.csv,.txt,.xlsx,.xls,.zip,.gpkg,.shp" onFiles={onGroundFiles}
            label={tr("Drop your terrain file here (a DEM). It is the shape of the ground your project sits on.")} />
          {noteLine(note)}
          <div style={{ marginTop: 12 }}>
            <button type="button" style={rowBtn(ground === "make")} aria-pressed={ground === "make"} onClick={() => { setGround("make"); setNote({ text: tr("OK. GeoStrix will make it once it knows where your project is, in the next step.") }); }}>
              {tr("I don't have one: make one for me.")}
            </button>
          </div>
          <div style={{ ...small, marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button type="button" style={link} onClick={() => { setGround("skip"); next(); }}>{tr("Skip the ground for now")}</button>
            <button type="button" style={link} onClick={() => { onClose?.(); goTo?.("viewer"); }}>{tr("Try it with an example")}</button>
            {onOpenProject && <button type="button" style={link} onClick={() => { onClose?.(); onOpenProject(); }}>{tr("Open a project I saved")}</button>}
          </div>
          <label style={{ display: "block", marginTop: 12 }}><input type="checkbox" checked={noDrill} onChange={(e) => setNoDrill(e.target.checked)} /> {tr("I'm not using drill hole data.")}</label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" style={rowBtn(true)} data-start-next="" onClick={next}>{tr("Next")}</button>
          </div>
        </>)}

        {step === 2 && (<>
          <DropArea busy={false} multiple onFiles={importFiles}
            label={noDrill ? tr("Drop your maps, samples, pictures or geophysics here, all at once. GeoStrix works out which is which.") : tr("Drop all your files here at once. GeoStrix works out which is which.")} />
          <div style={{ ...small, marginTop: 6 }}>{tr("If GeoStrix is unsure about a file, it asks about its columns or its coordinate system in a window over this one.")}</div>
          <ul data-start-checklist="" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {rows.map((r) => (
              <li key={r.key} data-row={r.key} data-done={r.done ? "1" : "0"} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <span aria-hidden="true" style={{ width: 16, color: r.done ? "var(--color-success-text)" : "var(--color-text-faint)" }}>{r.done ? "✓" : "○"}</span>
                <span style={{ flex: 1 }}><b>{r.label}</b> <span style={small}>({r.what})</span>{r.detail && <div style={small}>{r.detail}</div>}</span>
              </li>
            ))}
          </ul>
          {strip && strip.state !== "ready" && !stripDone && <div style={{ ...small, marginTop: 10 }}>{strip.text}</div>}
          {strip?.state === "ready" && !stripDone && (
            <div data-start-ground="" style={{ marginTop: 12, padding: 10, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              <div>{tr("Make the ground for this area? GeoStrix downloads it from the Copernicus 30 m elevation model (copernicus-dem-30m.s3.amazonaws.com). Only the corner coordinates of the area are sent.")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" style={rowBtn(true)} disabled={busy} onClick={makeGround}>{busy ? tr("Downloading…") : tr("Download")}</button>
                <button type="button" style={rowBtn(false)} disabled={busy} onClick={() => setStripDone({ text: tr("Using the collar heights: the holes start where your collar file says. Add a terrain later with Add data.") })}>{tr("Use the collar heights instead (rough)")}</button>
                <button type="button" style={rowBtn(false)} disabled={busy} onClick={() => setStripDone({ text: tr("No ground for now. Add a terrain later with Add data.") })}>{tr("No ground")}</button>
              </div>
            </div>
          )}
          {noteLine(stripDone)}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button type="button" style={rowBtn(false)} onClick={() => setStep(1)}>{tr("Back")}</button>
            <button type="button" style={rowBtn(true)} data-start-done="" onClick={finish}>{tr("Done: show my project")}</button>
          </div>
        </>)}

        {reason !== "button" && (
          <label style={{ ...small, display: "block", marginTop: 14 }}>
            <input type="checkbox" checked={optOut} onChange={(e) => { setOptOut(e.target.checked); setStartOptOut(e.target.checked); }} /> {tr("Do not show this when GeoStrix starts")}
          </label>
        )}
      </div>
    </div>
  );
}
