import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Box, FlaskConical, Radio, Layout, Save, FolderOpen, FilePlus2, RotateCcw, X, Undo2, Redo2, Plus, Image, Layers3, Target, FileBarChart2 } from "lucide-react";
import ShortcutsModal from "./components/ShortcutsModal.jsx";
import { useStore, useCursorValue } from "./lib/store.jsx";
import { onMenu, onSectionSnapshot, onSectionContacts, savePDF, pythonHealth } from "./lib/desktop.js";
import ViewerModule from "./modules/ViewerModule.jsx";
// TASKS.csv #224 (software-design-specialist audit finding: "grep for import()/React.lazy across src/
// returns one hit -- a comment. A fresh launch eagerly fetches ~100 modules including three, geotiff,
// proj4, d3-delaunay, sql.js") — ViewerModule stays a static import (it's the default landing tab and
// shared across View/Modeling/Targeting, so it loads immediately regardless), but the four modules
// that are NOT the landing tab now lazy-load, deferring their own heavy deps (geotiff.js via
// RasterModule, d3-delaunay via GeophysicsModule's Voronoi tool) until a user actually opens that tab.
const GeochemModule = React.lazy(() => import("./modules/GeochemModule.jsx"));
const GeophysicsModule = React.lazy(() => import("./modules/GeophysicsModule.jsx"));
const RasterModule = React.lazy(() => import("./modules/RasterModule.jsx"));
const LayoutModule = React.lazy(() => import("./modules/LayoutModule.jsx"));
// TASKS.csv #138 — project report is opened rarely (not every session), so lazy-load it the same way
// as the tab modules above rather than pulling it (and papaparse's CSV-building path it shares with
// everything else, already loaded regardless) into the eagerly-loaded main bundle for no benefit.
const ProjectReportModal = React.lazy(() => import("./components/ProjectReportModal.jsx"));

// TASKS.csv — Raster split out as its own tab (user request), between Geophysics and Layout so it
// sits near the other data-import modules rather than at the end.
// TASKS.csv #155 — "3D Modeling" promoted to its own top-level module, right after 3D View (user
// request: "I want 3D modeling to have its own module, not within the 3D view" — it used to be a
// "Home | Modeling" pill switcher nested inside the 3D View sidebar). Both tabs render the SAME
// ViewerModule component (see that file's own comment on the `mode` prop for why splitting the
// underlying 3D engine into two components wasn't the right call) — only which sidebar content shows
// differs.
// TASKS.csv #188 — "Targeting" (drillhole planning/targeting module) is a THIRD mode on that same
// shared ViewerModule component, for the same reason #155's split already established: it needs the
// same real 3D view (voxels, terrain, existing holes) as context to plan against, not a separate
// disconnected 3D engine. Placed right after Geophysics — that's the data it's most often planning
// against (voxel value-range isolation), and before Raster/Layout, which are further from "look at
// my targets and plan holes" in the day-to-day workflow.
const MODULES = [
  { id: "viewer", label: "3D View", icon: Box },
  { id: "modeling", label: "3D Modeling", icon: Layers3 },
  { id: "geochem", label: "Geochem", icon: FlaskConical },
  { id: "geophysics", label: "Geophysics", icon: Radio },
  { id: "targeting", label: "Targeting", icon: Target },
  { id: "raster", label: "Raster", icon: Image },
  { id: "layout", label: "Layout", icon: Layout },
];
// TASKS.csv #225 (software-design-specialist audit finding: switching tabs unmounted/remounted the
// entire three.js scene every time, measured 407-622ms blocking per switch, even between View/
// Modeling/Targeting — literally the same ViewerModule component with a different `mode` prop) — maps
// a tab id to the ViewerModule `mode` it corresponds to, so a single persistent instance can be kept
// mounted (hidden via CSS, not unmounted) across all three instead of three separate conditional JSX
// expressions each occupying their own position in the render tree (which is what forced the
// unmount/remount in the first place).
const VIEWER_MODES = { viewer: "view", modeling: "modeling", targeting: "targeting" };

export default function App() {
  const store = useStore();
  const {
    newProject, saveProject, openProject, addLayoutImage, requestedModule, moduleRequestSeq, setSectionContacts,
    workspaceTabs, activeTabId, activeTabDirty, switchToTab, newWorkspaceTab, closeWorkspaceTab, project,
    checkAutosave, restoreAutosave, discardAutosave,
    undo, redo, canUndo, canRedo,
  } = store;
  const [active, setActive] = useState("viewer");
  // TASKS.csv #225 — a stable `mode` to pass ViewerModule while it's hidden behind a non-viewer tab,
  // so hopping to Geochem and back doesn't force a sidebar re-render for a `mode` swap that isn't
  // actually happening. Updated during render (not an effect) whenever the active tab IS a viewer
  // mode, so it's always current by the time it's read for a non-viewer tab.
  const lastViewerModeRef = useRef("view");
  if (VIEWER_MODES[active]) lastViewerModeRef.current = VIEWER_MODES[active];
  const [epsgEditing, setEpsgEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pyStatus, setPyStatus] = useState("checking"); // "checking" | "connected" | "unavailable"
  const [recovery, setRecovery] = useState(null); // { data, projectName, autosavedAt } | null
  const [shortcutsTab, setShortcutsTab] = useState(null); // null | "shortcuts" | "about"
  const [reportOpen, setReportOpen] = useState(false); // TASKS.csv #138

  // TASKS.csv #33 — crash recovery. Check once, right after mount, whether an autosave snapshot
  // exists from a session that never reached a real Save (crash, force-quit, power loss). Only a
  // check — restoring is the user's call, made from the banner below, never automatic, since
  // silently swapping in different project data on launch would be its own kind of surprise.
  useEffect(() => {
    let cancelled = false;
    checkAutosave().then((r) => { if (!cancelled && r) setRecovery(r); });
    return () => { cancelled = true; };
  }, [checkAutosave]);

  // Python sidecar (python-sidecar/) is spawned by Electron's main process, which takes a moment
  // to boot — poll a few times close together right after launch, then settle into an occasional
  // background recheck (e.g. the user starts it manually after installing deps, or it crashes).
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let slowTimer = null;
    // TASKS.csv #236 (software-design-specialist audit finding) — the sidecar is optional and most
    // users (this app's own target audience is budget-constrained geologists, per the standing
    // performance-priority note) will simply never install python-sidecar/'s deps — every failed
    // fetch() to an unreachable host logs a network error to the console regardless of this code's own
    // try/catch (that's Chromium's own behavior, not something JS can suppress), so polling forever at
    // a fixed cadence meant permanent, unavoidable console noise for the common case. Once settled into
    // "unavailable", back off exponentially (20s -> 40s -> ... capped at 5min) instead of a flat 20s
    // forever, resetting back to 20s the moment a check succeeds — still picks the sidecar up
    // reasonably quickly if a user starts it later, just checks far less often once it's clear nothing
    // is there to find.
    const SLOW_BASE_MS = 20000, SLOW_MAX_MS = 300000;
    let slowDelay = SLOW_BASE_MS;
    const scheduleSlow = () => {
      if (cancelled) return;
      slowTimer = setTimeout(async () => {
        const res = await pythonHealth();
        if (cancelled) return;
        setPyStatus(res.ok ? "connected" : "unavailable");
        slowDelay = res.ok ? SLOW_BASE_MS : Math.min(slowDelay * 2, SLOW_MAX_MS);
        scheduleSlow();
      }, slowDelay);
    };
    const check = async () => {
      const res = await pythonHealth();
      if (cancelled) return;
      if (res.ok) { setPyStatus("connected"); scheduleSlow(); return; }
      attempts += 1;
      if (attempts < 8) setTimeout(check, 1500);
      else { setPyStatus("unavailable"); scheduleSlow(); }
    };
    check();
    return () => { cancelled = true; if (slowTimer) clearTimeout(slowTimer); };
  }, []);

  const doSave = useCallback(async () => {
    const res = await saveProject();
    if (res.ok) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }
  }, [saveProject]);
  const doOpen = useCallback(async () => {
    const res = await openProject();
    if (res.ok) setActive("viewer");
  }, [openProject]);
  // TASKS.csv #34 — "New Project" now opens a fresh workspace tab instead of resetting the only
  // project in place, so nothing is ever discarded by this action and the old "unsaved changes will
  // be lost" confirm isn't needed anymore (see newWorkspaceTab's own comment in store.jsx).
  const doNew = useCallback(() => {
    newWorkspaceTab();
  }, [newWorkspaceTab]);

  // The Layout page is the only thing meant to end up on paper (see the @media print rules in
  // app.css, which hide the toolbar/side-panel/status-bar) — so "Export PDF" always exports the
  // Layout page, switching to it first if some other module is active. The one-frame delay via
  // requestAnimationFrame gives React/print CSS a chance to actually paint the Layout tab before
  // Electron's printToPDF grabs the page.
  const doExportPdf = useCallback(() => {
    setActive("layout");
    requestAnimationFrame(() => requestAnimationFrame(() => savePDF("layout.pdf")));
  }, []);

  // A "Snapshot to Layout" click in the cross-section pop-out window can't touch this window's
  // React store directly (separate Electron renderer process) — it comes back over IPC instead.
  // See electron/main.js "section-snapshot" and src/components/SectionWindow.jsx.
  useEffect(() => {
    const off = onSectionSnapshot((payload) => {
      addLayoutImage(payload);
      setActive("layout");
    });
    return off;
  }, [addLayoutImage]);

  // Same cross-process relay pattern as the snapshot listener above, for a cross-section pop-out's
  // drawn contacts (interpreted lithological contacts on the 2D section — see SectionWindow.jsx and
  // store.jsx's sections state). Doesn't switch tabs — the user is drawing in the pop-out, not asking
  // to jump back to the main window.
  useEffect(() => {
    const off = onSectionContacts(({ id, contacts }) => setSectionContacts(id, contacts));
    return off;
  }, [setSectionContacts]);

  // ViewerModule's "Snapshot to Layout" button calls store.goToModule("layout") after queuing the
  // image; this is the other half of that hop.
  const lastModuleReqSeq = useRef(0);
  useEffect(() => {
    if (moduleRequestSeq === lastModuleReqSeq.current) return;
    lastModuleReqSeq.current = moduleRequestSeq;
    if (requestedModule) setActive(requestedModule);
  }, [moduleRequestSeq, requestedModule]);

  // menu → action bridge (Electron File/View/Tools menus)
  useEffect(() => {
    const off = onMenu((action) => {
      if (action.startsWith("module-")) setActive(action.replace("module-", ""));
      else if (action === "export-pdf") doExportPdf();
      else if (action === "set-epsg") setEpsgEditing(true);
      else if (action === "cross-section") setActive("viewer");
      else if (action === "new-project") doNew();
      else if (action === "open-project") doOpen();
      else if (action === "save-project") doSave();
      else if (action === "shortcuts") setShortcutsTab("shortcuts");
      else if (action === "about") setShortcutsTab("about");
      else if (action === "undo") undo();
      else if (action === "redo") redo();
    });
    return off;
  }, [doNew, doOpen, doSave, doExportPdf, undo, redo]);

  // TASKS.csv #31 — Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (also Ctrl+Y for redo, a common Windows habit).
  // Deliberately a plain window keydown listener rather than an Electron menu accelerator (see the
  // Edit menu comment in electron/main.js for why) — this can check what's actually focused and step
  // aside for a text field's own native undo/redo instead of hijacking it, which a menu accelerator
  // has no way to do. Also works identically in the plain-browser dev fallback, unlike a menu
  // accelerator would.
  useEffect(() => {
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod || (key !== "z" && key !== "y")) return;
      if (isEditable(document.activeElement)) return; // let the browser handle text-field undo/redo natively
      if (key === "y") { e.preventDefault(); redo(); return; }
      if (e.shiftKey) { e.preventDefault(); redo(); } else { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // TASKS.csv #34 — warn on quit if any workspace tab (the active one, or a stashed background one)
  // has unsaved changes. Autosave (#33) is the real safety net against a hard crash, but a deliberate
  // quit with an unsaved tab open is worth a native "are you sure" rather than silently trusting
  // autosave's 60s interval to have caught the very latest edit.
  useEffect(() => {
    const anyDirty = activeTabDirty || workspaceTabs.some((t) => t.id !== activeTabId && t.dirty);
    const onBeforeUnload = (e) => { if (anyDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activeTabDirty, workspaceTabs, activeTabId]);

  const doRestore = useCallback(() => {
    restoreAutosave(recovery.data);
    setRecovery(null);
    setActive("viewer");
  }, [recovery, restoreAutosave]);
  const doDiscardRecovery = useCallback(() => {
    discardAutosave();
    setRecovery(null);
  }, [discardAutosave]);

  return (
    <div className="ge-app">
      {recovery && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#241f14", borderBottom: "1px solid #4a3d1e", fontSize: 12, color: "#d8c080" }}>
          <RotateCcw size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Recovered unsaved work from a previous session — "{recovery.projectName}"
            {recovery.autosavedAt ? ` (autosaved ${new Date(recovery.autosavedAt).toLocaleString()})` : ""}.
          </span>
          <button onClick={doRestore} style={{ ...recoveryBtn, background: "#3d3423", color: "#e2c68c", border: "1px solid #5a4a2a" }}>Restore</button>
          <button onClick={doDiscardRecovery} style={recoveryBtn}><X size={12} /> Discard</button>
        </div>
      )}
      <WorkspaceTabBar
        tabs={workspaceTabs}
        activeTabId={activeTabId}
        activeDirty={activeTabDirty}
        activeName={project.name}
        onSwitch={switchToTab}
        onClose={closeWorkspaceTab}
        onNew={doNew}
      />
      <div className="ge-toolbar">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              className={`ge-tool-btn ${active === m.id ? "active" : ""}`}
              onClick={() => !m.disabled && setActive(m.id)}
              disabled={m.disabled}
              title={m.disabled ? "Coming soon" : undefined}
              style={m.disabled ? { opacity: 0.45, cursor: "default" } : undefined}
            >
              <Icon size={15} /> {m.label}
            </button>
          );
        })}
        <div className="ge-tool-sep" />
        <button className="ge-tool-btn" onClick={doNew} title="New project"><FilePlus2 size={14} /> New</button>
        <button className="ge-tool-btn" onClick={doOpen} title="Open project"><FolderOpen size={14} /> Open</button>
        <button className="ge-tool-btn" onClick={doSave} title="Save project"><Save size={14} /> {savedFlash ? "Saved ✓" : "Save"}</button>
        <div className="ge-tool-sep" />
        <button className="ge-tool-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)" style={{ opacity: canUndo ? 1 : 0.4 }}><Undo2 size={14} /></button>
        <button className="ge-tool-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" style={{ opacity: canRedo ? 1 : 0.4 }}><Redo2 size={14} /></button>
        <div className="ge-tool-sep" />
        <button className="ge-tool-btn" onClick={doExportPdf} title="Exports the Layout page (switches to it first if needed)">Export PDF</button>
        <button className="ge-tool-btn" onClick={() => setReportOpen(true)} title="Consolidated drillhole/assay project summary (CSV)"><FileBarChart2 size={14} /> Report</button>
      </div>

      <div className="ge-body">
        {/* TASKS.csv #225 — ONE persistent ViewerModule instance instead of three separate conditional
            JSX expressions (each of which used to occupy its own position in the tree, forcing React
            to unmount/remount on every switch even between three modes of the same component). Hidden
            via ViewerModule's own `visible` prop (display:none internally), not unmounted — see that
            file's own comments for the render-loop/pointer-handler/viewport-request guards this
            required. No `key` here — a key would defeat the whole point by forcing a fresh instance. */}
        <ViewerModule mode={VIEWER_MODES[active] || lastViewerModeRef.current} visible={!!VIEWER_MODES[active]} />
        <Suspense fallback={<div style={{ padding: 20, color: "#94a1b0", fontSize: 13 }}>Loading…</div>}>
          {active === "geochem" && <GeochemModule />}
          {active === "geophysics" && <GeophysicsModule />}
          {active === "raster" && <RasterModule />}
          {active === "layout" && <LayoutModule />}
        </Suspense>
      </div>

      <StatusBar epsgEditing={epsgEditing} setEpsgEditing={setEpsgEditing} pyStatus={pyStatus} />
      {shortcutsTab && <ShortcutsModal initialTab={shortcutsTab} onClose={() => setShortcutsTab(null)} />}
      {reportOpen && (
        <Suspense fallback={null}>
          <ProjectReportModal store={store} onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

// TASKS.csv #34 — multi-project workspace tabs. Kept intentionally simple: a row of pill buttons, no
// drag-to-reorder or right-click menu — closing/opening/switching are the only operations the
// underlying store functions support (see switchToTab/newWorkspaceTab/closeWorkspaceTab in
// store.jsx), and that's also the whole of what was asked for. A single-tab workspace still renders
// this bar (rather than hiding it until a second tab exists) so the "+" affordance for opening more
// projects is always visible instead of only appearing once you've already discovered it another way.
function WorkspaceTabBar({ tabs, activeTabId, activeDirty, activeName, onSwitch, onClose, onNew }) {
  return (
    <div className="ge-tabbar">
      {tabs.map((t) => {
        const isActive = t.id === activeTabId;
        const label = isActive ? activeName : t.name;
        const dirty = isActive ? activeDirty : t.dirty;
        return (
          <div
            key={t.id}
            className={`ge-tab ${isActive ? "active" : ""}`}
            onClick={() => onSwitch(t.id)}
            title={label}
          >
            {dirty && <span className="ge-tab-dot" title="Unsaved changes" />}
            <span className="ge-tab-label">{label || "Untitled project"}</span>
            <X
              size={12}
              className="ge-tab-close"
              onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
              title="Close project"
            />
          </div>
        );
      })}
      <button className="ge-tab-add" onClick={onNew} title="New project (opens another tab)">
        <Plus size={13} />
      </button>
    </div>
  );
}

function StatusBar({ epsgEditing, setEpsgEditing, pyStatus }) {
  const { project, setEpsg, setProjectName, collars, taskProgress } = useStore();
  // TASKS.csv #226/#214 — cursor lives in its own tiny context now (see store.jsx's own comment on
  // CursorProvider), not the big shared store, specifically so this component re-renders on every
  // mousemove-driven cursor update (as it always needed to, to show a live readout) WITHOUT dragging
  // every other useStore() consumer — most importantly ViewerModule.jsx — along for that same ride.
  const cursor = useCursorValue();
  const fmt = (v) => (v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const pyColor = pyStatus === "connected" ? "#e2a63c" : pyStatus === "checking" ? "#55606e" : "#94a1b0";
  const pyLabel = pyStatus === "connected" ? "Python: connected" : pyStatus === "checking" ? "Python: checking…" : "Python: not available (optional — see python-sidecar/README.md)";
  const pct = taskProgress ? Math.max(0, Math.min(100, Math.round(taskProgress.pct ?? 0))) : 0;
  return (
    <div className="ge-status">
      <span>{project.name}</span>
      <span>Holes: <span className="val">{collars.length}</span></span>
      <span>E <span className="val">{fmt(cursor.x)}</span></span>
      <span>N <span className="val">{fmt(cursor.y)}</span></span>
      <span>Z <span className="val">{fmt(cursor.z)}</span></span>
      <span title={pyLabel} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: pyColor, display: "inline-block" }} />
        Py
      </span>
      {taskProgress && (
        <span title={taskProgress.label} style={{ display: "flex", alignItems: "center", gap: 6, color: "#8fd9ab" }}>
          <span style={{ width: 80, height: 5, borderRadius: 3, background: "#f4f5f7", overflow: "hidden", display: "inline-block" }}>
            <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "#e2a63c", transition: "width 0.3s" }} />
          </span>
          <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskProgress.label}</span>
          <span className="val">{pct}%</span>
          {/* TASKS.csv #231 — a real GemPy run can take 80s+ with no way to back out short of force-
              quitting the app; onCancel is only set by callers that actually support cancellation
              (currently the implicit-modelling tools), so this button only appears where it works. */}
          {taskProgress.onCancel && (
            <X size={12} style={{ cursor: "pointer", color: "#e0a0a0" }} title="Cancel" onClick={taskProgress.onCancel} />
          )}
        </span>
      )}
      <span className="spacer" />
      {epsgEditing ? (
        <span>
          EPSG:
          <input
            autoFocus defaultValue={project.epsg}
            onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setEpsg(v); setEpsgEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ width: 70, marginLeft: 6, background: "#ffffff", border: "1px solid #a9c6e0", borderRadius: 4, color: "#1a2028", fontSize: 11, padding: "2px 5px" }}
          />
        </span>
      ) : (
        <span onClick={() => setEpsgEditing(true)} style={{ cursor: "pointer" }}>EPSG: <span className="val">{project.epsg}</span></span>
      )}
    </div>
  );
}

const recoveryBtn = { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 5, background: "transparent", border: "1px solid #4a3d1e", color: "#d8c080", fontSize: 11.5, cursor: "pointer", flexShrink: 0 };
