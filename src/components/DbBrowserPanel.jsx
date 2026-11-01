import React, { useCallback, useState, useEffect } from "react";
import { useTablePull, ROW_WARN_THRESHOLD } from "../lib/useTablePull.js"; // TASKS.csv #921
import { profileProblem } from "../lib/dbProfiles.js"; // TASKS.csv #1267
import TablePullConfirm from "./TablePullConfirm.jsx";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, HardDrive, Star, Database, Loader2, Unplug, RefreshCw } from "./icons.js";
import { fsListDir, fsListDrives, fsReadFile, readResultToFile, dbLiveListTables, dbPasswordStatus } from "../lib/desktop.js";
import { useStore } from "../lib/store.jsx";
import { useBrowserPanelPrefs } from "../lib/useBrowserPanelPrefs.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { colors } from "../lib/theme.js"; // #999 — the success green (an SVG icon prop)
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// TASKS.csv #206 — "#206 will live in the 3d view side panel like in QGIS... In the browser panel the
// user will have their C drive folder as default, the recent folders that GeoStrix imported/exported
// data from and also option to add folders as favorites." A QGIS-Browser-style dock: a lazily-expanded
// filesystem tree (drives -> folders -> importable files) plus a Postgres tree built on the SAME live
// connections DatabaseConnectModal now opens via store.connectDb (see that modal's #206 changes) — so
// a connection made from either place shows up, and stays open, in both.
// TASKS.csv #289 (QGIS-specialist review) — .tif/.tiff/.gxf (raster drapes) and .dxf (CAD boundaries)
// are both fully supported elsewhere in the app but were missing from this list, so they never showed
// as importable in the Browser tree at all — a QGIS user treats the Browser as the one place to pull
// in ANY supported file. The routing per extension lives in ViewerModule's importBrowserFile (the
// `onImportFile` prop), which dispatches to the handler each format already had.
export const IMPORTABLE_EXT = [".csv", ".zip", ".shp", ".gpkg", ".tif", ".tiff", ".gxf", ".dxf", ".las", ".xlsx", ".kml", ".kmz"]; // .las: TASKS.csv #492; .xlsx / .kml / .kmz: #717

// TASKS.csv #282 — the table import's bounds and guard rails live in lib/useTablePull.js (#921).

// Identifiers are quoted rather than interpolated bare: a table/schema whose name is mixed case, contains
// a space, or collides with a reserved word broke the old bare-interpolated SQL, and quoting also means a
// hostile-looking name out of information_schema can't terminate the identifier and inject a second
// statement. TASKS.csv #349 — quoting and chunked reads are per engine (lib/dbSql.js).

export default function DbBrowserPanel({ onImportFile, onImportRows, onError }) {
  const { dbConnections, liveDbConnections, connectDb, disconnectDb } = useStore();
  const { recent, favorites, noteRecentFolder, addFavorite, removeFavorite } = useBrowserPanelPrefs();
  const [drives, setDrives] = useState(null);
  const [drivesLoading, setDrivesLoading] = useState(false);

  const loadDrives = useCallback(async () => {
    if (drives || drivesLoading) return;
    setDrivesLoading(true);
    const res = await fsListDrives();
    setDrivesLoading(false);
    setDrives(res.ok ? res.drives : []);
  }, [drives, drivesLoading]);

  const handleFilePick = useCallback(async (entry) => {
    const res = await fsReadFile(entry.path);
    if (!res.ok) { onError?.(`${entry.name}: ${res.error || "could not be read."}`); return; } // #717 — was silent
    const file = readResultToFile(res, res.name); // #346
    noteRecentFolder(entry.path.slice(0, Math.max(0, entry.path.length - entry.name.length - 1)) || entry.path);
    onImportFile(file);
  }, [onImportFile, noteRecentFolder, onError]);

  return (
    <div style={{ padding: "10px 12px", overflowY: "auto", height: "100%", fontSize: "var(--font-size-base)" }}>
      <div style={sectionLabel}>{tr("Files")}</div>

      {favorites.length > 0 && (
        <TreeSection label={tr("Favourites")}>
          {favorites.map((p) => (
            <FsTreeNode key={p} entry={{ name: p.split(/[\\/]/).filter(Boolean).pop() || p, path: p, isDir: true }}
              depth={0} isFavorite favorites={favorites} onToggleFavorite={(fp) => removeFavorite(fp)} onFilePick={handleFilePick} />
          ))}
        </TreeSection>
      )}

      {recent.length > 0 && (
        <TreeSection label={tr("Recent")}>
          {recent.map((p) => (
            <FsTreeNode key={p} entry={{ name: p.split(/[\\/]/).filter(Boolean).pop() || p, path: p, isDir: true }}
              depth={0} favorites={favorites} onToggleFavorite={(fp, add) => (add ? addFavorite(fp) : removeFavorite(fp))} onFilePick={handleFilePick} />
          ))}
        </TreeSection>
      )}

      <TreeSection label={tr("This computer")} onExpand={loadDrives}>
        {drivesLoading && <div style={{ padding: "4px 0 4px 18px", color: "var(--color-text-muted)" }}><Loader2 size={12} className="spin" />{" "}{tr("Loading drives…")}</div>}
        {drives && drives.length === 0 && <div style={{ padding: "4px 0 4px 18px", color: "var(--color-text-muted)" }}>{tr("No drives found.")}</div>}
        {drives && drives.map((d) => (
          <FsTreeNode key={d} entry={{ name: d, path: d, isDir: true }} depth={0} isDrive
            favorites={favorites} onToggleFavorite={(fp, add) => (add ? addFavorite(fp) : removeFavorite(fp))} onFilePick={handleFilePick} />
        ))}
      </TreeSection>

      <div style={{ ...sectionLabel, marginTop: 14 }}>{tr("PostgreSQL")}</div>
      {dbConnections.length === 0 && (
        <div style={{ color: "var(--color-text-muted)", padding: "2px 0 6px" }}>{tr("No saved connections yet — use \"Connect database\" above to add one.")}</div>
      )}
      {dbConnections.map((profile) => (
        <PgTreeNode key={profile.name} profile={profile} live={liveDbConnections[profile.name]}
          connectDb={connectDb} disconnectDb={disconnectDb} onImportRows={onImportRows} />
      ))}
    </div>
  );
}

function TreeSection({ label, children, onExpand }) {
  // Starts collapsed like every other node in this lazily-expanded tree — "This computer" used to
  // default open without ever firing onExpand (only the click handler called it), so drives silently
  // never loaded until the user clicked it CLOSED first. Caught via Playwright/screenshot during
  // #206 verification.
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 4 }}>
      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => { const next = !open; setOpen(next); if (next && onExpand) onExpand(); }}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "3px 0", color: "var(--color-text-secondary)", fontWeight: 600 }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function FsTreeNode({ entry, depth, isDrive, isFavorite, favorites, onToggleFavorite, onFilePick }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(false);
  const isFav = favorites.includes(entry.path);
  const isImportable = !entry.isDir && IMPORTABLE_EXT.some((ext) => entry.name.toLowerCase().endsWith(ext));

  const toggle = useCallback(async () => {
    if (!entry.isDir) { if (isImportable) onFilePick(entry); return; }
    const next = !open;
    setOpen(next);
    if (next && children === null) {
      setLoading(true);
      const res = await fsListDir(entry.path);
      setLoading(false);
      setChildren(res.ok ? res.entries : []);
    }
  }, [entry, open, children, isImportable, onFilePick]);

  return (
    <div>
      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={toggle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2.5px 0", paddingLeft: depth * 14 + 4, color: isImportable ? "var(--color-text)" : "#3a4453" }}>
        {entry.isDir ? (loading ? <Loader2 size={12} className="spin" /> : open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 11, display: "inline-block" }} />}
        {isDrive ? <HardDrive size={12} color="#7a8698" /> : entry.isDir ? (open ? <FolderOpen size={12} color="#c9a24a" /> : <Folder size={12} color="#c9a24a" />) : <File size={12} color={isImportable ? "#3a76b0" : "#a8b0bc"} />}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.path}>{entry.name}</span>
        {entry.isDir && hover && onToggleFavorite && (
          <Star role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} color={isFav ? "#e2a63c" : "#c7ccd3"} fill={isFav ? "#e2a63c" : "none"}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.path, !isFav); }}
            title={isFav ? tr("Remove from favourites") : tr("Add to favourites")} />
        )}
      </div>
      {open && children && children.map((c) => (
        <FsTreeNode key={c.path} entry={c} depth={depth + 1} favorites={favorites} onToggleFavorite={onToggleFavorite} onFilePick={onFilePick} />
      ))}
    </div>
  );
}

function PgTreeNode({ profile, live, connectDb, disconnectDb, onImportRows }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pwSaved, setPwSaved] = useState(false); // TASKS.csv #621 — a password remembered for this login
  useEffect(() => { let on = true; dbPasswordStatus(profile).then((r) => { if (on) setPwSaved(!!r?.saved); }); return () => { on = false; }; }, [profile]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [tables, setTables] = useState(null);
  const [tablesLoading, setTablesLoading] = useState(false);

  const loadTables = useCallback(async (id) => {
    setTablesLoading(true);
    const res = await dbLiveListTables(id);
    setTablesLoading(false);
    if (res.ok) setTables(res.tables); else setError(res.error);
  }, []);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && live && tables === null) loadTables(live.id);
  }, [open, live, tables, loadTables]);

  const doConnect = useCallback(async () => {
    const problem = profileProblem(profile); // #1267
    if (problem) { setError(tr(problem)); return; }
    setConnecting(true); setError(null);
    const res = await connectDb({ ...profile, password });
    setConnecting(false);
    if (!res.ok) { setError(res.error); return; }
    setPassword("");
    setOpen(true);
    loadTables(res.id);
  }, [connectDb, profile, password, loadTables]);

  // TASKS.csv #282 / #921 — count first, confirm when large, chunked cursor reads (lib/useTablePull.js, shared with the
  // Connect to database dialog)
  const { pending, setPending, busyTable, pickTable, fetchTable } = useTablePull({ liveId: live?.id, profile, onRows: onImportRows, setError });

  return (
    <div style={{ marginBottom: 2 }}>
      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "3px 0" }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Database size={12} color={live ? colors.successFg : "#94a1b0"} />
        <span style={{ flex: 1 }}>{profile.name}</span>
        {/* TASKS.csv #249 (colorblind-safety review) — state was previously color-only-at-a-glance
            (the dot's color), with the word only in a hover title; "live" is now always visible text
            when connected, so this row's state doesn't depend on distinguishing the dot's color. */}
        {live && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)" }}>{tr("live")}</span>}
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "var(--color-success-fg)" : "var(--color-border-light)" }} title={live ? tr("Connected") : tr("Not connected")} />
      </div>
      {open && (
        <div style={{ paddingLeft: 18 }}>
          {!live && (
            <div style={{ display: "flex", gap: 4, marginBottom: 6, alignItems: "center" }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={pwSaved ? tr("Saved — just Connect") : tr("Password")} style={pwInp} aria-label={tr("Password for {name}", { name: profile.name })}
                onKeyDown={(e) => { if (e.key === "Enter") doConnect(); }} />
              <button onClick={doConnect} disabled={connecting} style={connectBtn}>{connecting ? <Loader2 size={12} className="spin" /> : tr("Connect")}</button>
            </div>
          )}
          {live && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, color: "var(--color-text-secondary)" }}>
              <span>{live.info?.db ? tr("Connected — {db}", { db: live.info.db }) : tr("Connected")}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <RefreshCw role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer" }} title={tr("Refresh table list")} onClick={() => loadTables(live.id)} />
                <Unplug role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer" }} color="#a05050" title={tr("Disconnect")} onClick={() => { disconnectDb(profile.name); setTables(null); }} />
              </div>
            </div>
          )}
          {error && <div style={{ color: "var(--color-danger-solid)", marginBottom: 6 }}>{error}</div>}
          <TablePullConfirm pending={pending} onFirst={() => fetchTable(pending.t, pending.total, ROW_WARN_THRESHOLD)} onAll={() => fetchTable(pending.t, pending.total, null)} onCancel={() => setPending(null)} />
          {tablesLoading && <div style={{ color: "var(--color-text-muted)" }}><Loader2 size={12} className="spin" />{" "}{tr("Loading tables…")}</div>}
          {tables && tables.map((t, i) => {
            const key = `${t.table_schema}.${t.table_name}`;
            const busy = busyTable === key;
            return (
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} key={i} onClick={() => { if (!busyTable) pickTable(t); }} style={{ display: "flex", alignItems: "center", gap: 6, cursor: busyTable ? "default" : "pointer", padding: "2px 0", color: "#3a4453", opacity: busyTable && !busy ? 0.5 : 1 }}
                title={tr("Import {key} (checks its row count first)", { key })}>
                {busy && <Loader2 size={12} className="spin" style={{ flexShrink: 0 }} />}
                {t.table_type === "VIEW" && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-accent)", border: "1px solid var(--color-accent)", borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>{tr("VIEW")}</span>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{key}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const sectionLabel = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6, fontWeight: 600 };
const pwInp = { flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 7px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
const connectBtn = { padding: "4px 9px", borderRadius: 5, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "var(--color-success-text)" };
