// TASKS.csv #445 step 3 — the viewer's import pipeline (file -> mapping dialog, the commit into the store, the multi-file drag-and-drop queue, the
// sample-project loader), moved out of ViewerModule.jsx. ViewerModule calls this hook at the same point in its body as the code used to run.
// Startup split (side 3, 2026-11-13, Main's request: startup JavaScript at 1,976 kB of 2,000) — the body is importPipelineImpl.js, loaded on first
// use (and on an idle moment after launch): this file keeps only what must be a hook (the store, the state and refs, the module-action listener,
// the queue's useCallback) and the functions ViewerModule calls, each of which loads the body and runs it with this render's values.
import { useRef, useState, useCallback, useEffect } from "react";
import { useModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #2019
import { useStore } from "../../lib/store.jsx"; // TASKS.csv #2632
import { notice, errorNotice } from "../../lib/notices.js";
import { layerOverlapOf } from "../../lib/viewer/layerOverlap.js"; // TASKS.csv #1649 — read while the dialog renders, so not behind the load

let implPromise = null;
export const loadImportPipeline = () => (implPromise ||= import("./importPipelineImpl.js").catch((e) => { implPromise = null; throw e; }));

export function useImportPipeline(ctx) {
  const { addVoxelModel, fillCodeDictionary, recordImportLeftOut, assays: storeAssays } = useStore(); // assays: #3039 // #2632; fillCodeDictionary: #2163; recordImportLeftOut: #2493
  const { importStateRef, setNotices, setDragOver, setImportModal, goToModule } = ctx;
  const [layerPicker, setLayerPicker] = useState(null); // TASKS.csv #288 — {file, forceTarget, options} while the layer picker is open
  const batchRowsRef = useRef(null);
  const commitBusyRef = useRef(false); // #1652 — one commit at a time
  const importQueueRef = useRef([]);
  const importQueueTotalRef = useRef(0); // total files this drop started with, for the progress bar
  const importActiveRef = useRef(false); // #229 — one queue at a time
  const assayHandoffRef = useRef([]); // #1350
  const surfaceHandoffRef = useRef(new Set()); // #2268
  const dropOriginRef = useRef(null); // TASKS.csv #2660 — the tab a drop came from (Maps), for Cancel
  const [sampleLoading, setSampleLoading] = useState(false);
  const env = useRef(null);
  env.current = { ctx, h: { addVoxelModel, fillCodeDictionary, recordImportLeftOut, storeAssays, layerPicker, setLayerPicker, batchRowsRef, commitBusyRef, importQueueRef, importQueueTotalRef, importActiveRef, assayHandoffRef, surfaceHandoffRef, sampleLoading, setSampleLoading } };
  // the body, built with the latest render's values, then the call; a failed chunk load is said, not swallowed
  const run = (fn) => loadImportPipeline().then((m) => fn(m.makeImportPipeline(env.current.ctx, env.current.h)), (e) => { setNotices((p) => [...p, errorNotice(String(e?.message || e))]); });
  useEffect(() => { // loaded on an idle moment after launch, so the first import does not wait for it
    const go = () => { loadImportPipeline().catch(() => {}); };
    const id = typeof requestIdleCallback === "function" ? requestIdleCallback(go, { timeout: 8000 }) : setTimeout(go, 3000);
    return () => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));
  }, []);
  // a drop's files are taken while the event lasts (a DataTransfer is empty after it)
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); const files = Array.from(e.dataTransfer?.files || []); return run((p) => p.handleDrop({ preventDefault() {}, dataTransfer: { files } })); };
  // TASKS.csv #2019 — files dropped on the Maps tab that need this import (points, tables, layer pickers), with what Maps already did
  useModuleAction(["import-dropped-files"], (_a, p) => {
    dropOriginRef.current = p?.origin || null; // TASKS.csv #2660 — Cancel goes back where the drop was made
    const extra = [...(p?.notes || []), ...(p?.others?.length ? [notice("{names}: not a file the map or this import reads.", { names: p.others.slice(0, 4).join(", ") + (p.others.length > 4 ? "…" : "") })] : [])];
    if (extra.length) setNotices((q) => [...q, ...extra]);
    if (p?.files?.length) run((x) => x.handleDrop({ preventDefault() {}, dataTransfer: { files: p.files } }));
  });
  const processImportQueue = useCallback(() => run((p) => p.processImportQueue()), []); // run reads env.current: the latest values
  const call = (name) => (...args) => run((p) => p[name](...args));
  // TASKS.csv #2660 (#2591 (3)) — a table dropped on the Maps plan opens this dialog on the 3D View; Cancel left the user there. Cancel on the last
  // file of a drop made elsewhere goes back to that tab; a commit stays here (the data is drawn here)
  const cancelImport = () => {
    setImportModal(null);
    const back = !importQueueRef.current.length ? dropOriginRef.current : null;
    processImportQueue();
    if (back) { dropOriginRef.current = null; goToModule(back); }
  };
  const importOverlap = (m) => (m ? layerOverlapOf(importStateRef.current.layers, m.target, m.mapping, m.allRows || [], m.fileName) : null); // #1649
  return { cancelImport, commitImport: call("commitImport"), handleDrop, importBrowserFile: call("importBrowserFile"), importOverlap, layerPicker, loadSampleProject: call("loadSampleProject"), openImportFromRows: call("openImportFromRows"), openImportModal: call("openImportModal"), processImportQueue, sampleLoading, setLayerPicker, reloadDbImports: call("reloadDbImports") };
}
