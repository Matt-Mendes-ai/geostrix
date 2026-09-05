import React, { useCallback, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, HardDrive, Star, X, Database, Loader2, Unplug, RefreshCw, AlertTriangle } from "lucide-react";
import { fsListDir, fsListDrives, fsReadFile, base64ToFile, dbLiveListTables, dbLiveQuery } from "../lib/desktop.js";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import { useBrowserPanelPrefs } from "../lib/useBrowserPanelPrefs.js";

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
const IMPORTABLE_EXT = [".csv", ".zip", ".shp", ".gpkg", ".tif", ".tiff", ".gxf", ".dxf"];

// TASKS.csv #282 — bounds for the Postgres table import below. Found independently by BOTH the
// security and Micromine specialist reviews: #255 correctly removed the old hard `LIMIT 500` (a real
// drillhole program's litho/assay table is legitimately tens of thousands of rows and was being
// silently truncated), but replaced it with nothing at all — an unqualified `SELECT *` fired straight
// into renderer memory the instant a table row was clicked, with no row count shown first, no
// confirmation, and no way to cancel. A live company Postgres holding a multi-property archive
// routinely has single tables in the hundreds of thousands to millions of rows.
//
// Re-capping would just resurrect the original complaint, so this is warn-first instead:
//   1. `SELECT COUNT(*)` runs first (cheap, and the standard thing every DB tool does) so the user
//      sees the size BEFORE committing to the pull;
//   2. above ROW_WARN_THRESHOLD an explicit confirm appears with the real number and a "first N rows"
//      escape hatch — nothing is fetched until the user picks one;
//   3. anything over CHUNK_ROWS is fetched through a server-side CURSOR in chunks (NOT LIMIT/OFFSET,
//      which re-scans from the top on every page and can duplicate/skip rows if the table changes
//      underneath us), driving the status bar's existing taskProgress bar with a working Cancel.
const ROW_WARN_THRESHOLD = 50000;
const CHUNK_ROWS = 20000;
const IMPORT_CURSOR = "geostrix_import_cursor";

// Postgres identifiers are quoted rather than interpolated bare: a table/schema whose name is mixed
// case, contains a space, or collides with a reserved word broke the old bare-interpolated SQL, and
// quoting also means a hostile-looking name out of information_schema can't terminate the identifier
// and inject a second statement.
const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

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
        {drivesLoading && <div style={{ padding: "4px 0 4px 18px", color: "var(--color-text-muted)" }}><Loader2 size={11} className="spin" /> Loading drives…</div>}
        {drives && drives.length === 0 && <div style={{ padding: "4px 0 4px 18px", color: "var(--color-text-muted)" }}>No drives found.</div>}
        {drives && drives.map((d) => (
          <FsTreeNode key={d} entry={{ name: d, path: d, isDir: true }} depth={0} isDrive
            favorites={favorites} onToggleFavorite={(fp, add) => (add ? addFavorite(fp) : removeFavorite(fp))} onFilePick={handleFilePick} />
        ))}
      </TreeSection>

      <div style={{ ...sectionLabel, marginTop: 14 }}>PostgreSQL</div>
      {dbConnections.length === 0 && (
        <div style={{ color: "var(--color-text-muted)", padding: "2px 0 6px" }}>No saved connections yet — use "Connect database" above to add one.</div>
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
      <div onClick={toggle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2.5px 0", paddingLeft: depth * 14 + 4, color: isImportable ? "var(--color-text)" : "#3a4453" }}>
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
  // TASKS.csv #282 — `pending` holds a counted-but-not-yet-fetched table awaiting the user's answer;
  // `busyTable` is the "counting…/fetching…" spinner on the clicked row; cancelRef is read between
  // cursor chunks (a ref, not state, so the running loop sees the change immediately).
  const [pending, setPending] = useState(null);
  const [busyTable, setBusyTable] = useState(null);
  const cancelRef = useRef(false);
  const setTaskProgress = useSetTaskProgress();

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

  // User report: "there is a limit of 500 rows when I'm importing a layer" — the old LIMIT 500 was a
  // leftover from the table-picker's original preview-only purpose; importing a layer as a genuine
  // data source should pull the whole table, not silently truncate a real dataset (a full drillhole
  // program's litho/assay table is routinely tens of thousands of rows). TASKS.csv #282 puts the
  // guardrails back WITHOUT re-capping — see the constants at the top of this file.

  // Actually pulls the rows. `limit` = null means "everything". Chunks through a server-side cursor
  // once the pull is bigger than one chunk, so a genuinely huge table degrades into a progress bar
  // instead of a frozen window, and stays cancellable the whole way.
  const fetchTable = useCallback(async (t, total, limit) => {
    const qualified = `${quoteIdent(t.table_schema)}.${quoteIdent(t.table_name)}`;
    const label = `Importing ${t.table_schema}.${t.table_name}`;
    const target = limit == null ? total : Math.min(limit, total);
    setPending(null);
    setError(null);
    setBusyTable(`${t.table_schema}.${t.table_name}`);
    cancelRef.current = false;

    const finish = (rows, fields, truncated) => {
      setBusyTable(null);
      setTaskProgress?.(null);
      if (!rows.length) { setError("That table returned no rows."); return; }
      let sourceName = `db:${profile.database}.${t.table_name}`;
      if (truncated) sourceName += ` (first ${rows.length.toLocaleString()} of ${total.toLocaleString()})`;
      onImportRows({ headers: fields, rows, sourceName });
    };

    // Small enough to be one round trip — no cursor, no transaction, no progress bar needed.
    if (target <= CHUNK_ROWS) {
      const res = await dbLiveQuery(live.id, `SELECT * FROM ${qualified}${limit == null ? "" : ` LIMIT ${Math.floor(limit)}`};`);
      setBusyTable(null);
      if (!res.ok) { setError(res.error); return; }
      finish(res.rows, res.fields, limit != null && total > limit);
      return;
    }

    setTaskProgress?.({ label, pct: 1, onCancel: () => { cancelRef.current = true; } });
    const rows = [];
    let fields = null;
    // A cursor needs a transaction. Everything below is read-only, so the transaction is opened
    // explicitly and always rolled back (never committed) — nothing this panel does should ever be
    // able to write to the user's database.
    const begin = await dbLiveQuery(live.id, "BEGIN;");
    if (!begin.ok) { setBusyTable(null); setTaskProgress?.(null); setError(begin.error); return; }
    try {
      const decl = await dbLiveQuery(live.id, `DECLARE ${IMPORT_CURSOR} NO SCROLL CURSOR FOR SELECT * FROM ${qualified};`);
      if (!decl.ok) { setError(decl.error); return; }
      while (rows.length < target) {
        if (cancelRef.current) { setError(`Import cancelled — ${rows.length.toLocaleString()} row(s) fetched, nothing imported.`); return; }
        const want = Math.min(CHUNK_ROWS, target - rows.length);
        const res = await dbLiveQuery(live.id, `FETCH FORWARD ${want} FROM ${IMPORT_CURSOR};`);
        if (!res.ok) { setError(res.error); return; }
        if (!fields) fields = res.fields;
        rows.push(...res.rows);
        setTaskProgress?.({ label: `${label} — ${rows.length.toLocaleString()} / ${target.toLocaleString()} rows`, pct: Math.min(99, (rows.length / Math.max(1, target)) * 100), onCancel: () => { cancelRef.current = true; } });
        if (res.rows.length < want) break; // cursor exhausted early (rows removed since the COUNT)
      }
      finish(rows, fields || [], limit != null && total > limit);
    } finally {
      await dbLiveQuery(live.id, `CLOSE ${IMPORT_CURSOR};`).catch(() => {});
      await dbLiveQuery(live.id, "ROLLBACK;").catch(() => {});
      setBusyTable(null);
      setTaskProgress?.(null);
    }
  }, [live, onImportRows, profile.database, setTaskProgress]);

  // Clicking a table now COUNTS first and never pulls anything until the size is known.
  const pickTable = useCallback(async (t) => {
    setError(null);
    setPending(null);
    setBusyTable(`${t.table_schema}.${t.table_name}`);
    const res = await dbLiveQuery(live.id, `SELECT COUNT(*) AS n FROM ${quoteIdent(t.table_schema)}.${quoteIdent(t.table_name)};`);
    setBusyTable(null);
    if (!res.ok) { setError(res.error); return; }
    // COUNT(*) comes back as a bigint, which node-postgres hands over as a STRING (bigints don't fit
    // a JS number safely) — Number() it explicitly rather than relying on it already being numeric.
    const total = Number(res.rows?.[0]?.n ?? 0);
    if (!Number.isFinite(total)) { setError("Couldn't read that table's row count."); return; }
    if (total === 0) { setError("That table is empty — nothing to import."); return; }
    if (total > ROW_WARN_THRESHOLD) { setPending({ t, total }); return; }
    fetchTable(t, total, null);
  }, [live, fetchTable]);

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
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "#3d9a63" : "var(--color-border-light)" }} title={live ? "Connected" : "Not connected"} />
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, color: "var(--color-text-secondary)" }}>
              <span>{live.info?.db ? `Connected — ${live.info.db}` : "Connected"}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <RefreshCw size={11} style={{ cursor: "pointer" }} title="Refresh table list" onClick={() => loadTables(live.id)} />
                <Unplug size={12} style={{ cursor: "pointer" }} color="#a05050" title="Disconnect" onClick={() => { disconnectDb(profile.name); setTables(null); }} />
              </div>
            </div>
          )}
          {error && <div style={{ color: "var(--color-danger-solid)", marginBottom: 6 }}>{error}</div>}
          {/* TASKS.csv #282 — the warn-before-you-pull confirmation. Nothing has been fetched at this
              point beyond the COUNT(*), so cancelling here costs the user nothing. */}
          {pending && (
            <div style={{ marginBottom: 6, padding: "7px 8px", background: "#fdf6e6", border: "1px solid #e2c98a", borderRadius: 5, color: "#6b5a2a", lineHeight: 1.45 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, marginBottom: 3 }}>
                <AlertTriangle size={11} /> {pending.total.toLocaleString()} rows
              </div>
              <div style={{ marginBottom: 6 }}>
                {pending.t.table_schema}.{pending.t.table_name} is large. Loading all of it pulls every row into memory at once
                and can take a while on a modest machine.
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <button onClick={() => fetchTable(pending.t, pending.total, ROW_WARN_THRESHOLD)} style={smallBtn}>
                  First {ROW_WARN_THRESHOLD.toLocaleString()}
                </button>
                <button onClick={() => fetchTable(pending.t, pending.total, null)} style={smallBtn}>Import all</button>
                <button onClick={() => setPending(null)} style={{ ...smallBtn, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
              </div>
            </div>
          )}
          {tablesLoading && <div style={{ color: "var(--color-text-muted)" }}><Loader2 size={11} className="spin" /> Loading tables…</div>}
          {tables && tables.map((t, i) => {
            const key = `${t.table_schema}.${t.table_name}`;
            const busy = busyTable === key;
            return (
              <div key={i} onClick={() => { if (!busyTable) pickTable(t); }} style={{ display: "flex", alignItems: "center", gap: 6, cursor: busyTable ? "default" : "pointer", padding: "2px 0", color: "#3a4453", opacity: busyTable && !busy ? 0.5 : 1 }}
                title={`Import ${key} (checks its row count first)`}>
                {busy && <Loader2 size={11} className="spin" style={{ flexShrink: 0 }} />}
                {t.table_type === "VIEW" && <span style={{ fontSize: 9, color: "var(--color-accent)", border: "1px solid var(--color-accent)", borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>VIEW</span>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{key}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const sectionLabel = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 6, fontWeight: 600 };
const pwInp = { flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 7px", color: "#1a2028", fontSize: 11, fontFamily: "inherit" };
const connectBtn = { padding: "4px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer", border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "#8fd9ab" };
const smallBtn = { padding: "3px 8px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", border: "1px solid #c9a24a", background: "var(--color-bg)", color: "#6b5a2a", fontFamily: "inherit" };
