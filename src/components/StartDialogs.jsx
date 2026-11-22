// TASKS.csv #3888 (platform redesign P5, design.md section 4, screens 1 and 2) — "Let's begin a project!": two steps, loaded only when they show.
//  1. The ground: drop a terrain (a GeoTIFF DEM, read by the terrain importer's own parser, lib/raster.js parseDEMFiles, as Maps > Terrain reads
//     it), or "I don't have one: make one for me" (the Copernicus GLO-30 download, offered in step 2 once the collars say where the project is,
//     on a click), or skip. A table dropped here is handed on to step 2.
//  2. Your drilling: ONE drop area for every file; each drop goes to the same entry a drop on the 3D view uses ("import-dropped-files", the
//     view's import pipeline), so the column matching and the coordinate-system questions open over this dialog (they sit above it). A checklist
//     (lib/startChecklist.js) fills itself in from what the project holds.
// "I'm not using drill hole data" keeps only 'Anything else' and opens the project on Maps. "Do not show this when GeoStrix starts" is a personal
// setting (lib/startFlow.js). Offline, or the download declined, the project keeps the collar heights and says so. Nothing is fetched without a click.
import React, { useEffect, useRef, useState } from "react";
import { useStore, useSetTaskProgress } from "../lib/store.jsx"; // useSetTaskProgress: #3976
import { landed, noJob } from "../lib/projectJobs.js"; // TASKS.csv #3953 — the download lands only in the project it started in
import { requestModuleAction } from "../lib/menuRequests.js";
import { startOptedOut, setStartOptOut, shouldCloseStart } from "../lib/startFlow.js"; // shouldCloseStart: #3930
import { groundFileKind, terrainSummary, crsWords, groundStrip, startChecklist, startDestination, qcLine, parseEpsgInput, whatIsThis } from "../lib/startChecklist.js"; // qcLine, parseEpsgInput, whatIsThis: #3918
import { crsName } from "../lib/reproject.js";
import { projectEpsgChooser } from "../lib/adoptCrs.js";
import { fetchAreaBox } from "../lib/dataExtent.js";
import { tieOf } from "../lib/localGridTie.js";
import { panel, rowBtn } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";
import { openHelp } from "../lib/help.js"; // TASKS.csv #3887 — the First steps guide
import { DropPicture } from "./DropDiagram.jsx"; // TASKS.csv #3939 — pictures first
import { Rotate3d, Boxes, FileText } from "lucide-react"; // TASKS.csv #3939 — the card's three lines

const Z = 55; // under every other dialog (60; the import's column matching 62): they open over this one
const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const cardLine = { display: "flex", gap: 8, alignItems: "flex-start" }, cardIcon = { flex: "0 0 auto", marginTop: 1, color: "var(--color-tier-basic)" }; // TASKS.csv #3939
const link = { background: "none", border: "none", padding: 0, color: "var(--color-primary)", cursor: "pointer", font: "inherit", textDecoration: "underline" };

function DropArea({ onFiles, multiple, accept, label, busy, picture }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div data-start-drop="" onDragOver={(e) => { stop(e); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { stop(e); setOver(false); const f = Array.from(e.dataTransfer?.files || []); if (f.length) onFiles(f); }}
      style={{ border: `1.5px dashed ${over ? "var(--color-primary)" : "var(--color-tier-basic)"}`, borderRadius: 14, padding: "18px 16px", textAlign: "center", background: over ? "var(--color-selected-bg)" : "linear-gradient(160deg, var(--color-bg) 0%, var(--color-tier-basic-bg) 75%)", boxShadow: "var(--shadow-lift)" }}>{/* #3956: style A */}
      {picture && <div style={{ maxWidth: 240, margin: "0 auto 8px" }}><DropPicture picture={picture} /></div>}{/* TASKS.csv #3939 */}
      <div style={{ marginBottom: 10 }}>{label}</div>
      <button type="button" style={rowBtn(true)} disabled={busy} onClick={() => input.current?.click()}>{busy ? tr("Reading…") : tr("Browse…")}</button>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; if (f.length) onFiles(f); }} />
    </div>
  );
}

export default function StartDialogs({ reason = "launch", onClose, goTo, onOpenProject }) {
  const store = useStore();
  const { project, terrain, addTerrain, setEpsg, projectIsEmpty, collars, startProjectJob } = store; // startProjectJob: TASKS.csv #3953
  const [step, setStep] = useState(1);
  const [noDrill, setNoDrill] = useState(false);
  const [ground, setGround] = useState(null); // "file" | "make" | "skip"
  const [note, setNote] = useState(null); // { text, warn }
  const [busy, setBusy] = useState(false);
  const [carried, setCarried] = useState([]); // tables dropped on the ground step: imported when step 2 opens
  const [optOut, setOptOut] = useState(() => startOptedOut());
  const [stripDone, setStripDone] = useState(null); // the "make the ground" strip's answer, said in one line
  const epsg = project?.epsg ?? null;
  // TASKS.csv #3918 — the follow-ups: the place picker for a terrain with no coordinate system, the files GeoStrix can't place ("What is
  // this?"), the UTM-zone question after "make one for me" (Maps > Terrain's own check, lib/srtmFetch.js), and screen 3's next-steps card
  const [picker, setPicker] = useState(null); // { files, typed, error } while a terrain with no CRS waits for one
  const [unplaced, setUnplaced] = useState([]); // [{ file, text, where }]
  const [zoneAsk, setZoneAsk] = useState(null); // { better, misfit, parsed }
  const [card, setCard] = useState(null); // { qc } once Done: the small next-steps card, not a dialog

  // TASKS.csv #3930 — a sample, a project or a recovery copy loading under this dialog closes it (its backdrop covered the page); the dialog's own
  // imports (a terrain, the files dropped in step 2, the made ground) do not, so they mark it engaged first
  const engaged = useRef(false);
  useEffect(() => { if (shouldCloseStart({ empty: projectIsEmpty, engaged: engaged.current, sampleRequested: !!store.sampleRequest })) onClose?.(); }, [projectIsEmpty, store.sampleRequest]);
  const sendFiles = (files) => { engaged.current = true; goTo?.("viewer"); requestModuleAction("import-dropped-files", { files }); }; // the 3D view's own entry (#2019)
  const importFiles = (files) => { // #3918 — a file the import can't place is asked about here, the rest go in
    const odd = files.map((file) => ({ file, ...(whatIsThis(file.name) || {}) })).filter((x) => x.text);
    if (odd.length) setUnplaced((u) => [...u, ...odd]);
    const ok = files.filter((f) => !odd.some((x) => x.file === f));
    if (ok.length) sendFiles(ok);
  };
  const next = () => { setStep(2); setNote(null); if (carried.length) { importFiles(carried); setCarried([]); } };
  const finish = async () => { // screen 3: the dialog gives way to a small card with the next steps and the data check's one line
    goTo?.(startDestination({ noDrill, collars: collars?.length || 0 }));
    const checking = !noDrill && !!collars?.length;
    setCard({ qc: null, checking });
    if (!checking) return;
    try {
      const { runDataQCSliced } = await import("../lib/dataQC.js");
      const r = await runDataQCSliced({ project, collars, survey: store.survey || [], layers: store.layers || {}, boundaries: store.boundaries || [], assays: store.assays || [], assayElements: store.assayElements || [], terrain, customLayers: store.customLayers || [] });
      setCard({ qc: r ? qcLine(r.summary) : null, checking: false });
    } catch { setCard({ qc: null, checking: false }); }
  };

  // TASKS.csv #3953 / #3963 — the ground the dialog brings in (a file, its CRS, the download) is a job of the project it started in
  const terrainJob = () => { const label = tr("Terrain"); return startProjectJob ? startProjectJob({ label }) : noJob(label); };
  const setTaskProgress = useSetTaskProgress(); // TASKS.csv #3976 — the ground's download in the status bar
  // step 1: a terrain file (GeoTIFF) through the terrain importer's parser; anything else waits for step 2
  const onGroundFiles = async (files) => {
    engaged.current = true;
    const tifs = files.filter((f) => groundFileKind(f.name) === "terrain"), rest = files.filter((f) => groundFileKind(f.name) !== "terrain");
    if (rest.length) setCarried((c) => [...c, ...rest]);
    if (!tifs.length) { setNote({ text: tr(rest.length === 1 ? "That looks like a table or a map, not a terrain: it goes in the next step." : "Those look like tables or maps, not a terrain: they go in the next step.") }); return; }
    setBusy(true); setNote(null);
    const job = terrainJob(); // TASKS.csv #3963 — a plain file import belongs to the project it started in too
    try {
      const { parseDEMFiles } = await import("../lib/raster.js");
      const tie = tieOf(project);
      const parsed = await parseDEMFiles(tifs, tie ? null : epsg, null, { tie, chooseProjectEpsg: projectEpsgChooser({ isEmpty: projectIsEmpty, setEpsg, fileName: tifs[0].name, live: job.isLive }) }); // live: #3963
      if (!(await landed(job))) return; // TASKS.csv #3963 — into the project it started in (the finally clears the busy state)
      if (terrain && !window.confirm(tr("Replace the current terrain (\"{name}\") with \"{name2}\"? Only one terrain surface is supported at a time.", { name: terrain.name, name2: parsed.name }))) { setBusy(false); return; }
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null });
      setGround("file");
      const sum = terrainSummary(parsed), crsNow = parsed.reprojectedTo || parsed.epsgTag || epsg;
      const where = parsed.epsgTag ? crsWords(crsNow, crsName(crsNow)) : ""; // #3918 — no tag: the place picker asks
      setPicker(parsed.epsgTag ? null : { files: tifs, typed: "", error: null });
      setNote({ text: [sum?.text, where, rest.length ? tr("The other files go in the next step.") : ""].filter(Boolean).join(" ") });
    } catch (e) {
      if (job.gone) return; // #3963 — its project is gone and the banner said so
      setNote({ text: tr("{name}: GeoStrix could not read it as a terrain ({error}). Try another file, or make one for me.", { name: tifs[0].name, error: String(e?.message || e) }), warn: true });
    } finally { setBusy(false); job.end(); } // job: #3963
  };

  // #3918 — a terrain with no coordinate system: its numbers are the project's, or in the CRS the user types (re-read through it)
  const pickCrs = async (code) => {
    engaged.current = true;
    if (code == null) { setPicker((p) => ({ ...p, error: tr("Type the EPSG code as a number, for example 32609.") })); return; }
    if (!crsName(code)) { setPicker((p) => ({ ...p, error: tr("GeoStrix doesn't know EPSG:{code}. Check the number on the file's .prj or its notes.", { code }) })); return; }
    if (!epsg || Number(code) === Number(epsg)) { if (!epsg) setEpsg(code); setPicker(null); setNote({ text: crsWords(code, crsName(code)) }); return; }
    setBusy(true);
    const job = terrainJob(); // TASKS.csv #3963
    try {
      const { parseDEMFiles } = await import("../lib/raster.js");
      const parsed = await parseDEMFiles(picker.files, epsg, String(code), {});
      if (!(await landed(job))) return; // TASKS.csv #3963 — into the project it started in (the finally clears the busy state)
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null });
      setPicker(null);
      setNote({ text: [terrainSummary(parsed)?.text, tr("Read as {name} (EPSG:{code}) and brought into the project's coordinate system.", { name: crsName(code), code })].filter(Boolean).join(" ") });
    } catch (e) { if (!job.gone) setPicker((p) => ({ ...p, error: String(e?.message || e) })); } finally { setBusy(false); job.end(); } // job: #3963
  };

  // step 2's strip: the Copernicus GLO-30 download for the collars' area, on a click; offline or failed: the collar heights, said
  const strip = step === 2 ? groundStrip({ choice: ground, collars: collars?.length || 0, terrain: !!terrain, epsg: tieOf(project) ? null : epsg }) : null;
  const makeGround = async (zoneEpsg = null) => {
    engaged.current = true;
    const useEpsg = zoneEpsg || epsg;
    const offline = () => setStripDone({ text: tr("No internet connection: using the collar heights for now. Add a terrain later with Add data."), warn: true });
    if (typeof navigator !== "undefined" && navigator.onLine === false) { offline(); return; }
    setBusy(true);
    const job = terrainJob(); // TASKS.csv #3953
    // TASKS.csv #3976 — the bar in the status bar, with Cancel stopping the reads (#3963's signal)
    const bar = (await import("../lib/fetchProgress.js")).startFetchProgress(setTaskProgress, { label: tr("Terrain"), stages: [["read", 0.85], ["build", 0.15]], onCancel: () => job.abort() });
    bar.step("read", 0, 1, tr("Connecting to {source}…", { source: "Copernicus GLO-30" })); // #3976 — the bar at once (a moving bar until something is counted)
    try {
      const box = fetchAreaBox(collars, store.surfaceSamples || []);
      const { toLonLat } = await import("../lib/reproject.js");
      const ll = await Promise.all([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => toLonLat(x, y, useEpsg)));
      if (ll.some((p) => !p)) throw new Error(tr("the project's coordinate system could not be turned into latitude and longitude"));
      const ext = ll.reduce((b, p) => [Math.min(b[0], p.lon), Math.min(b[1], p.lat), Math.max(b[2], p.lon), Math.max(b[3], p.lat)], [Infinity, Infinity, -Infinity, -Infinity]);
      const { fetchCopernicusTerrain } = await import("../lib/copernicusDem.js");
      const parsed = await fetchCopernicusTerrain({ lonMin: ext[0], latMin: ext[1], lonMax: ext[2], latMax: ext[3], targetEpsg: useEpsg, gridMax: 200, signal: job.signal /* #3963 */, onProgress: (done, total) => bar.step("read", done, total, tr("Reading {source} tiles {done} of {total}", { source: "Copernicus GLO-30", done, total })) /* #3976 */ });
      bar.step("build", 0, 1, tr("Building the terrain")); // #3976
      // #3918 — Maps > Terrain's own check (lib/srtmFetch.js): collars hundreds of metres off the ground are in the wrong UTM zone, or not
      const { collarGroundMisfit, findBetterUtmZone, MISFIT_ZONE_M } = await import("../lib/srtmFetch.js");
      if (!(await landed(job))) return; // TASKS.csv #3953 — into the project it started in (the finally clears the busy state)
      const misfit = zoneEpsg ? null : collarGroundMisfit(collars, parsed);
      if (misfit && misfit.medianDz > MISFIT_ZONE_M) {
        const better = await findBetterUtmZone(collars, useEpsg, misfit);
        if (!(await landed(job))) return; // TASKS.csv #3953 — again, after the last await
        if (better) { setZoneAsk({ better, misfit, parsed }); return; }
      }
      keepGround(parsed, misfit && misfit.medianDz > MISFIT_ZONE_M ? tr(" Check the project CRS and the collar elevations (feet? a local datum?): the collars sit a median {v} m off this terrain.", { v: Math.round(misfit.medianDz) }) : "");
    } catch (e) {
      if (job.gone) return; // #3963 — its project closed mid-download: the banner says it
      if (typeof navigator !== "undefined" && navigator.onLine === false) offline();
      else setStripDone({ text: tr("The ground could not be downloaded ({error}): using the collar heights for now. Add a terrain later with Add data.", { error: String(e?.message || e) }), warn: true });
    } finally { setBusy(false); bar.end(); job.end(); } // job: TASKS.csv #3953; bar: #3976
  };

  const keepGround = (parsed, extra = "") => {
    addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null, source: parsed.source || null });
    setZoneAsk(null);
    setStripDone({ text: [terrainSummary(parsed)?.text, tr("Copernicus GLO-30 shows the ground of 2011–2015: ground mined since reads lower, and older collars can sit above it."), extra.trim()].filter(Boolean).join(" "), warn: !!extra });
  };

  const rows = step === 2 ? startChecklist(store, { noDrill }) : [];
  const title = step === 1 ? tr("Step 1 of 2: the ground.") : noDrill ? tr("Step 2 of 2: your data.") : tr("Step 2 of 2: your drilling.");
  const noteLine = (n) => n && <div role="status" style={{ ...small, marginTop: 8, color: n.warn ? "var(--color-warn-text)" : "var(--color-text)" }}>{n.text}</div>;

  if (card) return ( // #3918 — screen 3: a small card, not a dialog; the project is usable behind it
    <div data-start-card="" role="status" className="ge-card" style={{ ...panel({ width: "min(380px, calc(100vw - 32px))" }), borderRadius: 12, boxShadow: "var(--shadow-pop)", position: "fixed", right: 16, bottom: 40, zIndex: Z, padding: "12px 14px", gap: 6 }}>{/* #3956: the shared card */}
      <div className="ge-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, margin: "-12px -14px 2px", padding: "10px 14px 8px" }}>
        <b>{tr("Your project is in.")}</b>
        <button type="button" style={link} onClick={onClose}>{tr("Close")}</button>
      </div>
      {card.checking && <div style={small}>{tr("Checking your data…")}</div>}
      {card.qc && <div data-start-qc="">{card.qc}</div>}
      {/* TASKS.csv #3939 — three icon lines */}
      <div style={cardLine}><Rotate3d size={16} aria-hidden="true" style={cardIcon} /><span>{tr("Look around: drag to turn, wheel to zoom.")}</span></div>
      {!noDrill && <div style={cardLine}><Boxes size={16} aria-hidden="true" style={cardIcon} /><span>{tr("Model: the green Model button, one step at a time.")} <button type="button" style={link} onClick={() => { goTo?.("viewer"); onClose?.(); }}>{tr("Show me")}</button></span></div>}
      <div style={cardLine}><FileText size={16} aria-hidden="true" style={cardIcon} /><span>{tr("Sheet: Layout > Sheets, in one click.")} <button type="button" style={link} onClick={() => { goTo?.("layout"); onClose?.(); }}>{tr("Open Layout")}</button></span></div>
      <div>{tr("New here? First steps shows the everyday path in six screens.")} <button type="button" style={link} data-start-guide="" onClick={() => openHelp("first-steps")}>{tr("First steps")}</button></div>{/* TASKS.csv #3887 */}
    </div>
  );

  return (
    <div data-start-dialog={step} style={{ position: "fixed", inset: 0, zIndex: Z, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,10,14,0.45)" }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ge-start-title" className="ge-card" style={{ ...panel({ width: "min(560px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)" }), borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "auto", padding: "18px 20px" }}>{/* #3956: the shared card */}
        <div className="ge-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, margin: "-18px -20px 0", padding: "14px 20px 4px", borderBottom: "none" }}>
          <h2 id="ge-start-title" style={{ margin: 0, fontSize: "var(--font-size-xl)" }}>{tr("Let's begin a project!")}</h2>
          <button type="button" style={link} onClick={onClose}>{tr("Close")}</button>
        </div>
        <div style={{ ...small, margin: "4px 0 12px" }}>{title}</div>

        {step === 1 && (<>
          <DropArea busy={busy} accept=".tif,.tiff,.csv,.txt,.xlsx,.xls,.zip,.gpkg,.shp" onFiles={onGroundFiles} picture="terrain"
            label={tr("Drop your terrain (DEM) here.")} />
          {noteLine(note)}
          {picker && (
            <div data-start-crs="" style={{ marginTop: 8, padding: 10, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              <div>{tr("Which coordinate system is this file in?")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                {epsg && <button type="button" style={rowBtn(true)} disabled={busy} onClick={() => pickCrs(Number(epsg))}>{tr("The project's: {crs}", { crs: crsName(epsg) || `EPSG:${epsg}` })}</button>}
                <label style={small}>{epsg ? tr("Another, by its EPSG code:") : tr("Its EPSG code:")} <input value={picker.typed} onChange={(e) => setPicker((p) => ({ ...p, typed: e.target.value, error: null }))} placeholder="32609" style={{ width: 90 }} /></label>
                <button type="button" style={rowBtn(!epsg)} disabled={busy} onClick={() => pickCrs(parseEpsgInput(picker.typed))}>{tr("Use it")}</button>
              </div>
              {picker.error && <div style={{ ...small, color: "var(--color-warn-text)", marginTop: 4 }}>{picker.error}</div>}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button type="button" style={rowBtn(ground === "make")} aria-pressed={ground === "make"} onClick={() => { setGround("make"); setNote({ text: tr("OK. GeoStrix will make it once it knows where your project is, in the next step.") }); }}>
              {tr("Make one for me")}
            </button>
          </div>
          <div style={{ ...small, marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button type="button" style={link} onClick={() => { setGround("skip"); next(); }}>{tr("Skip for now")}</button>
            <button type="button" style={link} onClick={() => { onClose?.(); goTo?.("viewer"); }}>{tr("Try an example")}</button>
            {onOpenProject && <button type="button" style={link} onClick={() => { onClose?.(); onOpenProject(); }}>{tr("Open a saved project")}</button>}
          </div>
          <label style={{ display: "block", marginTop: 12 }}><input type="checkbox" checked={noDrill} onChange={(e) => setNoDrill(e.target.checked)} /> {tr("I'm not using drill hole data.")}</label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" style={rowBtn(true)} data-start-next="" onClick={next}>{tr("Next")}</button>
          </div>
        </>)}

        {step === 2 && (<>
          <DropArea busy={false} multiple onFiles={importFiles} picture={noDrill ? "map" : "holes"}
            label={noDrill ? tr("Drop your maps, samples, pictures or geophysics here, all at once. GeoStrix works out which is which.") : tr("Drop all your files here at once. GeoStrix works out which is which.")} />
          <div style={{ ...small, marginTop: 6 }}>{tr("If a file is unclear, GeoStrix asks about it.")}</div>
          {unplaced.map((u) => (
            <div key={u.file.name + u.file.size} data-start-unplaced="" style={{ marginTop: 8, padding: 8, border: "1px solid var(--color-warn-border)", borderRadius: 6 }}>
              <b>{tr("What is this?")}</b> <span style={small}>{u.text}</span>
              {u.where && <div style={small}>{u.where}</div>}
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <button type="button" style={link} onClick={() => { sendFiles([u.file]); setUnplaced((x) => x.filter((y) => y !== u)); }}>{tr("Try it anyway")}</button>
                <button type="button" style={link} onClick={() => setUnplaced((x) => x.filter((y) => y !== u))}>{tr("Leave it out")}</button>
              </div>
            </div>
          ))}
          <ul data-start-checklist="" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {rows.map((r) => (
              <li key={r.key} data-row={r.key} data-done={r.done ? "1" : "0"} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <span aria-hidden="true" style={{ width: 16, color: r.done ? "var(--color-success-text)" : "var(--color-text-faint)" }}>{r.done ? "✓" : "○"}</span>
                <span style={{ flex: 1 }}><b title={r.what}>{r.label}</b>{r.detail && <div style={small}>{r.detail}</div>}</span>{/* #3939: what each row is, as its tooltip */}
              </li>
            ))}
          </ul>
          {strip && strip.state !== "ready" && !stripDone && <div style={{ ...small, marginTop: 10 }}>{strip.text}</div>}
          {zoneAsk && (
            <div data-start-zone="" style={{ marginTop: 12, padding: 10, border: "1px solid var(--color-warn-border)", borderRadius: 6 }}>
              <div>{tr("Check the UTM zone: your collars sit a median {v} m off this ground, but within {v2} m of it read as {name}.", { v: Math.round(zoneAsk.misfit.medianDz), name: zoneAsk.better.name, v2: Math.round(zoneAsk.better.medianDz) })}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" style={rowBtn(true)} disabled={busy} onClick={() => { const code = zoneAsk.better.code; setEpsg(code); setZoneAsk(null); makeGround(code); }}>{tr("Use {name} and download again", { name: zoneAsk.better.name })}</button>
                <button type="button" style={rowBtn(false)} disabled={busy} onClick={() => keepGround(zoneAsk.parsed, tr(" The collars sit a median {v} m off this terrain (in {name} they would sit within {v2} m) — kept as you chose.", { v: Math.round(zoneAsk.misfit.medianDz), name: zoneAsk.better.name, v2: Math.round(zoneAsk.better.medianDz) }))}>{tr("Keep this ground")}</button>
              </div>
            </div>
          )}
          {strip?.state === "ready" && !stripDone && !zoneAsk && (
            <div data-start-ground="" style={{ marginTop: 12, padding: 10, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              <div>{tr("Make the ground for this area? GeoStrix downloads it from the Copernicus 30 m elevation model (copernicus-dem-30m.s3.amazonaws.com). Only the corner coordinates of the area are sent.")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" style={rowBtn(true)} disabled={busy} onClick={() => makeGround()}>{busy ? tr("Downloading…") : tr("Download")}</button>
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
