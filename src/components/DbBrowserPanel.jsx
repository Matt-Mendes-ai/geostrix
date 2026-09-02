import React, { useCallback, useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, HardDrive, Star, X, Database, Loader2, Unplug, RefreshCw } from "lucide-react";
import { fsListDir, fsListDrives, fsReadFile, base64ToFile, dbLiveListTables, dbLiveQuery } from "../lib/desktop.js";
import { useStore } from "../lib/store.jsx";
import { useBrowserPanelPrefs } from "../lib/useBrowserPanelPrefs.js";

// TASKS.csv #206 — "#206 will live in the 3d view side panel like in QGIS... In the browser panel the
// user will have their C drive folder as default, the recent folders that GeoStrix imported/exported
// data from and also option to add folders as favorites." A QGIS-Browser-style dock: a lazily-expanded
// filesystem tree (drives -> folders -> importable files) plus a Postgres tree built on the SAME live
// connections DatabaseConnectModal now opens via store.connectDb (see that modal's #206 changes) — so
// a connection made from either place shows up, and stays open, in both.
const IMPORTABLE_EXT = [".csv", ".zip", ".shp", ".gpkg"];

export default function DbBrowserPanel({ onImportFile, onImportRows }) {
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
    if (!res.ok) return;
    const file = base64ToFile(res.base64, res.name);
    noteRecentFolder(entry.path.slice(0, Math.max(0, entry.path.length - entry.name.length - 1)) || entry.path);
    onImportFile(file);
  }, [onImportFile, noteRecentFolder]);

  return (
    <div style={{ padding: "10px 12px", overflowY: "auto", height: "100%", fontSize: 11.5 }}>
      <div style={sectionLabel}>Files</div>

      {favorites.length > 0 && (
        <TreeSection label="Favorites">
          {favorites.map((p) => (
            <FsTreeNode key={p} entry={{ name: p.split(/[\\/]/).filter(Boolean).pop() || p, path: p, isDir: true }}
              depth={0} isFavorite favorites={favorites} onToggleFavorite={(fp) => removeFavorite(fp)} onFilePick={handleFilePick} />
          ))}
        </TreeSection>
      )}

      {recent.length > 0 && (
        <TreeSection label="Recent">
          {recent.map((p) => (
            <FsTreeNode key={p} entry={{ name: p.split(/[\\/]/).filter(Boolean).pop() || p, path: p, isDir: true }}
              depth={0} favorites={favorites} onToggleFavorite={(fp, add) => (add ? addFavorite(fp) : removeFavorite(fp))} onFilePick={handleFilePick} />
          ))}
        </TreeSection>
      )}

      <TreeSection label="This computer" onExpand={loadDrives}>
        {drivesLoading && <div style={{ padding: "4px 0 4px 18px", color: "#94a1b0" }}><Loader2 size={11} className="spin" /> Loading drives…</div>}
        {drives && drives.length === 0 && <div style={{ padding: "4px 0 4px 18px", color: "#94a1b0" }}>No drives found.</div>}
        {drives && drives.map((d) => (
          <FsTreeNode key={d} entry={{ name: d, path: d, isDir: true }} depth={0} isDrive
            favorites={favorites} onToggleFavorite={(fp, add) => (add ? addFavorite(fp) : removeFavorite(fp))} onFilePick={handleFilePick} />
        ))}
      </TreeSection>

      <div style={{ ...sectionLabel, marginTop: 14 }}>PostgreSQL</div>
      {dbConnections.length === 0 && (
        <div style={{ color: "#94a1b0", padding: "2px 0 6px" }}>No saved connections yet — use "Connect database" above to add one.</div>
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
      <div onClick={() => { const next = !open; setOpen(next); if (next && onExpand) onExpand(); }}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "3px 0", color: "#55606e", fontWeight: 600 }}>
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
      <div onClick={toggle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2.5px 0", paddingLeft: depth * 14 + 4, color: isImportable ? "#1a2028" : "#3a4453" }}>
        {entry.isDir ? (loading ? <Loader2 size={11} className="spin" /> : open ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : <span style={{ width: 11, display: "inline-block" }} />}
        {isDrive ? <HardDrive size={12} color="#7a8698" /> : entry.isDir ? (open ? <FolderOpen size={12} color="#c9a24a" /> : <Folder size={12} color="#c9a24a" />) : <File size={12} color={isImportable ? "#3a76b0" : "#a8b0bc"} />}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.path}>{entry.name}</span>
        {entry.isDir && hover && onToggleFavorite && (
          <Star size={11} color={isFav ? "#e2a63c" : "#c7ccd3"} fill={isFav ? "#e2a63c" : "none"}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.path, !isFav); }}
            title={isFav ? "Remove from favorites" : "Add to favorites"} />
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
    setConnecting(true); setError(null);
    const res = await connectDb({ ...profile, password });
    setConnecting(false);
    if (!res.ok) { setError(res.error); return; }
    setPassword("");
    setOpen(true);
    loadTables(res.id);
  }, [connectDb, profile, password, loadTables]);

  const pickTable = useCallback(async (t) => {
    const res = await dbLiveQuery(live.id, `SELECT * FROM ${t.table_schema}.${t.table_name} LIMIT 500;`);
    if (res.ok) onImportRows({ headers: res.fields, rows: res.rows, sourceName: `db:${profile.database}.${t.table_name}` });
    else setError(res.error);
  }, [live, onImportRows, profile.database]);

  return (
    <div style={{ marginBottom: 2 }}>
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "3px 0" }}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Database size={12} color={live ? "#3d9a63" : "#94a1b0"} />
        <span style={{ flex: 1 }}>{profile.name}</span>
        {/* TASKS.csv #249 (colorblind-safety review) — state was previously color-only-at-a-glance
            (the dot's color), with the word only in a hover title; "live" is now always visible text
            when connected, so this row's state doesn't depend on distinguishing the dot's color. */}
        {live && <span style={{ fontSize: 9, color: "#3d9a63" }}>live</span>}
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "#3d9a63" : "#c7ccd3" }} title={live ? "Connected" : "Not connected"} />
      </div>
      {open && (
        <div style={{ paddingLeft: 18 }}>
          {!live && (
            <div style={{ display: "flex", gap: 4, marginBottom: 6, alignItems: "center" }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={pwInp}
                onKeyDown={(e) => { if (e.key === "Enter") doConnect(); }} />
              <button onClick={doConnect} disabled={connecting} style={connectBtn}>{connecting ? <Loader2 size={11} className="spin" /> : "Connect"}</button>
            </div>
          )}
          {live && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, color: "#55606e" }}>
              <span>{live.info?.db ? `Connected — ${live.info.db}` : "Connected"}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <RefreshCw size={11} style={{ cursor: "pointer" }} title="Refresh table list" onClick={() => loadTables(live.id)} />
                <Unplug size={12} style={{ cursor: "pointer" }} color="#a05050" title="Disconnect" onClick={() => { disconnectDb(profile.name); setTables(null); }} />
              </div>
            </div>
          )}
          {error && <div style={{ color: "#c0392b", marginBottom: 6 }}>{error}</div>}
          {tablesLoading && <div style={{ color: "#94a1b0" }}><Loader2 size={11} className="spin" /> Loading tables…</div>}
          {tables && tables.map((t, i) => (
            <div key={i} onClick={() => pickTable(t)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 0", color: "#3a4453" }}
              title={`Import ${t.table_schema}.${t.table_name} (first 500 rows)`}>
              {t.table_type === "VIEW" && <span style={{ fontSize: 9, color: "#e2a63c", border: "1px solid #e2a63c", borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>VIEW</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.table_schema}.{t.table_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const sectionLabel = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 6, fontWeight: 600 };
const pwInp = { flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "4px 7px", color: "#1a2028", fontSize: 11, fontFamily: "inherit" };
const connectBtn = { padding: "4px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer", border: "1px solid #3d6b52", background: "#1e3629", color: "#8fd9ab" };
