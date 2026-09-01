const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const dns = require("dns");
const { spawn } = require("child_process");

// User-reported bug: connecting the database tool (Tools > Connect to database) to a local Postgres
// with host "localhost" failed with "connect ECONNREFUSED ::1:<port>" even though the same database
// was reachable from DBeaver/psql on the same machine. Root cause: Node 18+ (which Electron 28 bundles)
// changed how it resolves a bare hostname like "localhost" — by default it tries DNS results in
// whatever order getaddrinfo returns them, which on many Windows machines puts the IPv6 loopback (::1)
// first even though the actual Postgres server is only bound to the IPv4 loopback (127.0.0.1, the
// far more common default for a local Postgres install). pg's Client just connects to whatever address
// Node's own hostname resolution hands it, so it was trying ::1, getting refused (nothing is listening
// there), and never falling back to try 127.0.0.1 at all — same class of bug for ANY hostname with both
// an IPv6 and IPv4 record where the IPv6 route happens to be unreachable, not unique to "localhost".
// Fixed process-wide (not just for the db connector — this would have hit the SRTM tile fetch and any
// future network call the same way) via Node's own dns.setDefaultResultOrder, added in Node 17 for
// exactly this class of "IPv6 route exists in DNS but doesn't actually work" problem. "ipv4first"
// forces plain IPv4 resolution ahead of IPv6 everywhere in this process, matching what psql/DBeaver
// effectively do by default on most setups.
try { dns.setDefaultResultOrder("ipv4first"); } catch (_) { /* Node < 17 fallback: silently keep default order */ }

const isDev = process.env.NODE_ENV === "development";

let mainWindow = null;
const childWindows = new Map(); // id -> BrowserWindow (cross-section pop-outs)
let pySidecar = null; // Python FastAPI sidecar process (optional — see startPythonSidecar below)
const PY_SIDECAR_PORT = 8765;

// Optional local Python server for geoprocessing that's a better fit for Python's scientific stack
// (scipy now; GemPy later for implicit modelling, see TASKS.csv) than reimplementing in JS. The
// renderer talks to it directly over plain HTTP (fetch to 127.0.0.1, not IPC — see
// src/lib/desktop.js pythonHealth/pythonInterpolate), so this function's only job is to get a
// process running on PY_SIDECAR_PORT and clean it up on quit. Entirely best-effort: if Python isn't
// installed, or the dependencies in python-sidecar/requirements.txt aren't installed, this fails
// silently (logged, not thrown) and every feature that depends on it just reports "not available"
// via a failed health check, the same way the Postgres connector degrades when not in Electron.
// TASKS.csv #49 — bundled into packaged installers as of this pass: `npm run build:sidecar`
// (python-sidecar/build_sidecar.js) freezes the sidecar into a standalone executable via PyInstaller
// ahead of `electron-builder`, which copies it into the packaged app's resources dir (extraResources,
// see package.json's `build` config) — no separate Python/pip install needed by an end user. A DEV run
// (`npm run dev`, app.isPackaged false) still uses the from-source `python -m uvicorn` path unchanged,
// since that's the whole point of running from source — pip-installing a fresh copy of GemPy et al.
// just to iterate on this file would be backwards. If the frozen executable is somehow missing from a
// packaged build (extraResources is best-effort — see build_sidecar.js's own comment on why it isn't
// forced into every `npm run build`), this falls through to the same from-source spawn attempt, which
// will fail the same "Python not found" way it always has for someone without Python installed — no
// worse than before this pass, not a new failure mode.
function startPythonSidecar() {
  const frozenName = process.platform === "win32" ? "geostrix-sidecar.exe" : "geostrix-sidecar";
  const frozenPath = path.join(process.resourcesPath || "", "python-sidecar", frozenName);
  const useFrozen = app.isPackaged && fs.existsSync(frozenPath);

  const cwd = path.join(__dirname, "../python-sidecar");
  const [cmd, args] = useFrozen
    ? [frozenPath, []]
    : [process.env.GEOSTRIX_PYTHON || (process.platform === "win32" ? "python" : "python3"),
       ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(PY_SIDECAR_PORT)]];

  try {
    pySidecar = spawn(cmd, args, {
      cwd: useFrozen ? path.dirname(frozenPath) : cwd,
      stdio: isDev ? "inherit" : "ignore",
    });
    pySidecar.on("error", (err) => {
      console.error(`[python-sidecar] failed to start (${useFrozen ? frozenPath : `${cmd} not found, or deps missing — see python-sidecar/README.md`}):`, err.message);
      pySidecar = null;
    });
    pySidecar.on("exit", (code) => {
      if (code !== null && code !== 0) console.error(`[python-sidecar] exited with code ${code}`);
      pySidecar = null;
    });
  } catch (err) {
    console.error("[python-sidecar] spawn failed:", err.message);
    pySidecar = null;
  }
}
function stopPythonSidecar() {
  if (pySidecar && !pySidecar.killed) {
    try { pySidecar.kill(); } catch (_) {}
  }
  pySidecar = null;
}

function resolveUrl(hashRoute) {
  if (isDev) return `http://localhost:5173/#${hashRoute}`;
  return `file://${path.join(__dirname, "../dist/index.html")}#${hashRoute}`;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0c0f14",
    // Packaged builds pick up build/icon.ico|icns via electron-builder's config (package.json), but
    // that only applies to the installed .exe/.app icon — a dev run (npm run dev, no installer) still
    // shows Electron's default icon in the taskbar/dock unless the window is told explicitly. build/
    // icon.png is the same 1024px master the installer icons were generated from.
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(resolveUrl("/"));
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  buildMenu();
  mainWindow.on("closed", () => {
    mainWindow = null;
    for (const w of childWindows.values()) if (!w.isDestroyed()) w.close();
    childWindows.clear();
  });
}

// ---------- cross-section pop-out window ----------
ipcMain.handle("open-section-window", (_e, payload) => {
  // TASKS.csv — cross-section contact drawing: the caller (ViewerModule) now supplies a stable id
  // (matching the section's entry in store.sections) so contacts drawn in this pop-out can be relayed
  // back and matched to the right saved section — only fall back to generating one if the caller
  // didn't supply one (shouldn't happen anymore, but keeps this handler safe standalone).
  const id = payload?.id || `section_${Date.now()}`;

  // TASKS.csv #13 — multiple simultaneous sections already works (every id gets its own BrowserWindow
  // below, nothing closes an existing one when another section is drawn or reopened) — verified this
  // is real, not aspirational, before marking #13 done. The one real gap found while checking: REOPENING
  // the SAME section id that's already open used to always create a second window rather than reusing
  // it, silently orphaning the first — childWindows.set(id, win) just overwrote the map entry, so
  // update-section-window/section-contacts sends after that point only ever reached the newer window,
  // and the user was left looking at two windows for the same section with no way to tell they'd
  // drifted apart. Now it just focuses the existing window and re-sends fresh data instead.
  const existing = childWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.webContents.send("section-data", { id, ...payload });
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return { id };
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: "#0c0f14",
    title: payload?.title || "Cross-section",
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(resolveUrl("/section"));
  win.webContents.once("did-finish-load", () => {
    win.webContents.send("section-data", { id, ...payload });
  });
  win.on("closed", () => childWindows.delete(id));
  childWindows.set(id, win);
  return { id };
});

// push updated section data to an existing pop-out (live sync from main window)
ipcMain.handle("update-section-window", (_e, { id, ...payload }) => {
  const win = childWindows.get(id);
  if (win && !win.isDestroyed()) { win.webContents.send("section-data", { id, ...payload }); return { ok: true }; }
  return { ok: false };
});

// A section pop-out window is a separate renderer with its own JS heap — it doesn't share the main
// window's React store. When the user clicks "Snapshot to Layout" in a section window, it can't call
// store.addLayoutImage() directly; instead it sends the snapshot here and we relay it to the main
// window, whose App.jsx listens via onSectionSnapshot() and forwards it into the store.
ipcMain.handle("section-snapshot", (_e, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send("section-snapshot", payload); return { ok: true }; }
  return { ok: false };
});

// TASKS.csv — cross-section contact drawing: same relay pattern as section-snapshot above, for a
// pop-out's drawn contacts (interpreted lithological contacts on the 2D section) making their way back
// into the main window's store.sections. App.jsx listens via onSectionContacts().
ipcMain.handle("section-contacts", (_e, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send("section-contacts", payload); return { ok: true }; }
  return { ok: false };
});

// ---------- PDF export ----------
ipcMain.handle("export-pdf", async (_e, { suggestedName }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Export PDF",
    defaultPath: suggestedName || "layout.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { ok: false };
  const data = await win.webContents.printToPDF({ printBackground: true, landscape: true, pageSize: "A4" });
  fs.writeFileSync(filePath, data);
  return { ok: true, filePath };
});

// ---------- generic file save (csv / png / svg) ----------
ipcMain.handle("save-file", async (_e, { suggestedName, filters, content, encoding }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Save",
    defaultPath: suggestedName,
    filters: filters || [{ name: "All Files", extensions: ["*"] }],
  });
  if (canceled || !filePath) return { ok: false };
  if (encoding === "base64") fs.writeFileSync(filePath, Buffer.from(content, "base64"));
  else fs.writeFileSync(filePath, content, "utf8");
  return { ok: true, filePath };
});

// ---------- open file (for importers that want a native dialog) ----------
ipcMain.handle("open-file", async (_e, { filters }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: filters || [{ name: "CSV", extensions: ["csv"] }],
  });
  if (canceled || !filePaths.length) return { ok: false };
  const content = fs.readFileSync(filePaths[0], "utf8");
  return { ok: true, filePath: filePaths[0], content, name: path.basename(filePaths[0]) };
});

// ---------- autosave / crash recovery (TASKS.csv #33) ----------
// A silent (no save-dialog) write of the full project payload to a fixed path in Electron's userData
// dir, refreshed periodically by store.jsx while the user works. Deliberately separate from the
// user's own "Save" (save-file above, which always prompts for a path) — this is a safety net for
// "the app crashed / the machine lost power before I hit Save", not a substitute for it, so it's
// never presented to the user as a real save and gets cleared once a real save (or an explicit
// discard) happens.
// TASKS.csv #186 — project file format renamed from .geox(.json) to .geostrix(.json). The autosave
// file follows the same rename. OLD_AUTOSAVE_PATH is kept only as a one-time fallback so a crash-
// recovery snapshot written by a pre-rename build isn't silently orphaned on the first run after
// upgrading — autosave-read falls back to it if the new path doesn't exist yet, and every write goes
// straight to the new path (nothing ever writes the old path again).
const AUTOSAVE_PATH = () => path.join(app.getPath("userData"), "autosave.geostrix.json");
const OLD_AUTOSAVE_PATH = () => path.join(app.getPath("userData"), "autosave.geox.json");
ipcMain.handle("autosave-write", async (_e, { content }) => {
  try { fs.writeFileSync(AUTOSAVE_PATH(), content, "utf8"); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle("autosave-read", async () => {
  try {
    const p = fs.existsSync(AUTOSAVE_PATH()) ? AUTOSAVE_PATH() : (fs.existsSync(OLD_AUTOSAVE_PATH()) ? OLD_AUTOSAVE_PATH() : null);
    if (!p) return { ok: false };
    const content = fs.readFileSync(p, "utf8");
    const stat = fs.statSync(p);
    return { ok: true, content, mtime: stat.mtimeMs };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle("autosave-clear", async () => {
  try {
    if (fs.existsSync(AUTOSAVE_PATH())) fs.unlinkSync(AUTOSAVE_PATH());
    if (fs.existsSync(OLD_AUTOSAVE_PATH())) fs.unlinkSync(OLD_AUTOSAVE_PATH());
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---------- database connector (Postgres/MySQL — DBeaver-managed company databases) ----------
// Each call opens a short-lived client rather than a pool; this is an exploration tool making
// occasional pulls, not a high-throughput backend, so simplicity/robustness wins over pooling.
//
// TASKS.csv #177 — user request: "we will have to build a way to connect to a dbeaver database. some
// companies use it and they have views ready and all." DBeaver itself is a universal GUI client, not
// an engine — it connects to whatever a company actually runs. This was Postgres-only; MySQL/MariaDB
// added first (Matt confirmed it as the priority engine over SQL Server/Oracle/SQLite — Oracle in
// particular needs Instant Client binaries bundled, a real packaging complication for an Electron app,
// so deliberately not attempted speculatively). makeDbClient() below normalizes both drivers' very
// different native shapes (pg's `client.query()` resolves `{rows, fields:[{name}]}`; mysql2's
// `conn.query()` resolves a `[rows, fieldsMeta]` tuple) into one common `{query, end, raw}` shape, so
// every handler below reads config.engine ("postgres" | "mysql", default "postgres" for old saved
// connection profiles with no engine field at all) exactly once, at client-creation time, instead of
// branching on engine inside every single handler.

// User-reported bug: "connect ECONNREFUSED ::1:54380" against a real Postgres (reachable fine from
// DBeaver/psql on the same machine). The dns.setDefaultResultOrder("ipv4first") fix above this section
// should prevent the ::1-vs-127.0.0.1 mismatch from recurring, but this still adds a plain-language
// hint on top of the raw pg error for ECONNREFUSED/ETIMEDOUT/ENOTFOUND specifically — these three cover
// the overwhelming majority of "can't connect" reports, and the raw Node error message alone (no
// context) is the kind of thing a non-Node-developer geologist has no way to act on. Always keeps the
// original err.message too, never replaces it — the hint is additive, not a guess presented as fact.
function friendlyDbError(err, config) {
  const raw = err.message || String(err);
  if (/ECONNREFUSED/.test(raw)) {
    const engineLabel = config.engine === "mysql" ? "MySQL/MariaDB" : "Postgres";
    return `${raw} — nothing is accepting connections at ${config.host}:${config.port}. Double check the host/port match what DBeaver uses for this same connection, and that ${engineLabel} is actually running and reachable from this machine (a local firewall or VPN can block this even when DBeaver on the same network works).`;
  }
  if (/ETIMEDOUT/.test(raw)) {
    return `${raw} — the connection attempt to ${config.host}:${config.port} timed out. Usually means a firewall/VPN is silently dropping the connection rather than refusing it outright, or the host isn't reachable from this network at all.`;
  }
  if (/ENOTFOUND/.test(raw)) {
    return `${raw} — "${config.host}" doesn't resolve to anything. Check for a typo, or that this machine's DNS/hosts file actually knows that hostname (a VPN-only internal hostname often only resolves while connected to that VPN).`;
  }
  if (/password authentication failed|28P01|ER_ACCESS_DENIED_ERROR|Access denied for user/.test(raw)) {
    return `${raw} — connected to the server fine, but the username/password was rejected. Double check both against the same credentials DBeaver uses for this connection.`;
  }
  if (/ER_BAD_DB_ERROR|Unknown database/.test(raw)) {
    return `${raw} — connected to the server, but database "${config.database}" doesn't exist there (or this user can't see it). Check the database name against what DBeaver uses for this connection.`;
  }
  return raw;
}

ipcMain.handle("db-test", async (_e, config) => {
  let db;
  try {
    db = await makeDbClient(config);
    const res = await db.query(testConnectionQuery(config));
    return { ok: true, info: res.rows[0] };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err, config) };
  } finally {
    if (db) try { await db.end(); } catch (_) {}
  }
});

ipcMain.handle("db-query", async (_e, { config, sql }) => {
  let db;
  try {
    db = await makeDbClient(config);
    const res = await db.query(sql);
    return { ok: true, rows: res.rows, fields: res.fields, rowCount: res.rowCount };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err, config) };
  } finally {
    if (db) try { await db.end(); } catch (_) {}
  }
});

ipcMain.handle("db-list-tables", async (_e, config) => {
  let db;
  try {
    db = await makeDbClient(config);
    // TASKS.csv #177 — surface VIEWS alongside base tables, not just tables. A DBeaver-managed
    // company database is exactly the case where the useful thing to import from is often a
    // pre-built view (pre-joined/pre-cleaned), not a raw base table — information_schema.tables
    // already includes both table_type='BASE TABLE' and table_type='VIEW' rows by default (true for
    // both Postgres and MySQL — this table is part of the SQL standard's own information_schema,
    // not a Postgres-specific extension), this was just never filtered TO views specifically.
    const res = await db.query(listTablesQuery(config));
    return { ok: true, tables: res.rows };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err, config) };
  } finally {
    if (db) try { await db.end(); } catch (_) {}
  }
});

// SRTM auto-fetch (TASKS.csv — "fetch SRTM directly instead of manual USGS download+import").
// Proxied through the main process rather than fetched directly from the renderer for two reasons:
// (1) sidesteps any browser CORS policy question entirely — Node's fetch here isn't subject to it —
// so this works the same regardless of how the AWS bucket's CORS is configured; (2) keeps the
// renderer's network surface narrow (a dedicated {z,x,y} tile channel, not a generic "fetch any URL"
// IPC hole an untrusted renderer-side bug could be tricked into misusing).
//
// Source: AWS's public "Terrain Tiles" Open Data bucket (registry.opendata.aws/terrain-tiles),
// Terrarium-encoded elevation PNGs blending SRTM with other open DEMs for full coverage — public,
// no API key, no account. Not literally usgs.gov (their EarthExplorer/M2M API requires a personal
// login, which doesn't fit a zero-config open-source desktop app — see src/lib/srtmFetch.js's header
// comment for the full reasoning), but the same SRTM-heritage public elevation data.
ipcMain.handle("fetch-srtm-tile", async (_e, { z, x, y }) => {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status, message: `Tile fetch failed (HTTP ${res.status}) for z${z}/${x}/${y}.` };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, base64: buf.toString("base64") };
  } catch (err) {
    return { ok: false, status: 0, message: `Network error fetching elevation tile: ${err.message}` };
  }
});

// TASKS.csv #127 — generic WMS/WMTS/WFS layer consumption. A user-supplied government/company OGC
// service URL (GetCapabilities/GetMap/GetFeature), unlike fetch-srtm-tile above which always hits one
// fixed, known-CORS-friendly bucket. Most government WMS/WFS servers do NOT set permissive CORS
// headers for arbitrary origins, so a direct renderer-side fetch() would fail even though the exact
// same URL loads fine as an <img src> (image display isn't CORS-gated the way reading response bytes
// is) — same reasoning as the SRTM proxy, generalized to any URL instead of one hardcoded source.
// Returns base64 always (works for both binary GetMap images and text XML/GeoJSON responses — the
// renderer decides how to decode based on what it asked for) plus contentType so the renderer can
// build a correct data: URL for an image without having to guess the format.
ipcMain.handle("fetch-web-layer", async (_e, { url }) => {
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      // Servers often return a 200 with an XML ServiceExceptionReport instead of a real HTTP error —
      // that's handled renderer-side by inspecting the body — but a genuine non-2xx still deserves
      // its own message rather than being decoded as if it were valid content.
      const bodyText = contentType.includes("xml") || contentType.includes("text") ? await res.text() : "";
      return { ok: false, status: res.status, message: `Request failed (HTTP ${res.status})${bodyText ? `: ${bodyText.slice(0, 300)}` : "."}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, contentType, base64: buf.toString("base64") };
  } catch (err) {
    return { ok: false, status: 0, message: `Network error: ${err.message}` };
  }
});

function pgConfig(config) {
  return {
    host: config.host, port: Number(config.port) || 5432, database: config.database,
    user: config.user, password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  };
}
function mysqlConfig(config) {
  return {
    host: config.host, port: Number(config.port) || 3306, database: config.database,
    user: config.user, password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 8000,
  };
}
function testConnectionQuery(config) {
  return config.engine === "mysql"
    ? "SELECT DATABASE() as db, CURRENT_USER() as usr, VERSION() as ver"
    : "SELECT current_database() as db, current_user as usr, version() as ver";
}
function listTablesQuery(config) {
  return config.engine === "mysql"
    ? "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys') ORDER BY table_schema, table_name"
    : "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name";
}
// Normalizes pg's Client and mysql2's Connection — very different native shapes (pg's query()
// resolves {rows, fields:[{name,...}]}; mysql2's query() resolves a [rows, fieldsMeta] tuple, and a
// non-SELECT statement returns a ResultSetHeader object instead of a rows array entirely) — into one
// common {query, end, raw} shape every handler above/below reads uniformly. `raw` is exposed
// separately (not swallowed) because db-connect needs the actual driver connection object to attach
// its own 'error' listener (a dropped connection fires that event on the raw client/connection, not
// on this wrapper).
async function makeDbClient(config) {
  if (config.engine === "mysql") {
    const mysql = require("mysql2/promise");
    const conn = await mysql.createConnection(mysqlConfig(config));
    return {
      raw: conn,
      query: async (sql) => {
        const [rows, fields] = await conn.query(sql);
        return { rows, fields: (fields || []).map((f) => f.name), rowCount: Array.isArray(rows) ? rows.length : (rows?.affectedRows ?? 0) };
      },
      end: () => conn.end(),
    };
  }
  const { Client } = require("pg");
  const client = new Client(pgConfig(config));
  await client.connect();
  return {
    raw: client,
    query: async (sql) => {
      const res = await client.query(sql);
      return { rows: res.rows, fields: res.fields.map((f) => f.name), rowCount: res.rowCount };
    },
    end: () => client.end(),
  };
}

// TASKS.csv #206 — persistent DB connections (QGIS-style Browser panel). db-test/db-query/db-list-
// tables above are the original one-shot path (open a fresh pg.Client, run one thing, always close it
// in `finally` — used by DatabaseConnectModal's "Test connection"/"Run query" flow) and are left
// exactly as they were for backward compatibility. Everything below is an ADDITIONAL path: a live
// connection is opened once via db-connect and held open in this Map (main-process memory only, for
// the life of the Electron app — never written to disk, same "password never saved" guarantee as
// before, it's just held in RAM instead of being immediately dropped) until db-disconnect or the app
// quits. db-live-query/db-live-list-tables/db-live-list reuse whichever connection id the renderer
// gives them instead of opening a new client per call, which is what actually removes the "enter the
// password every time" friction the user reported.
const liveDbConnections = new Map(); // id -> { client, safeConfig, connectedAt }
let liveDbConnCounter = 0;

ipcMain.handle("db-connect", async (_e, config) => {
  let db;
  try {
    db = await makeDbClient(config);
    const res = await db.query(testConnectionQuery(config));
    const id = `dbconn_${++liveDbConnCounter}_${Date.now()}`;
    const { password, ...safeConfig } = config;
    liveDbConnections.set(id, { client: db, safeConfig, connectedAt: Date.now() });
    db.raw.on("error", (err) => {
      // Connection dropped underneath us (network blip, server restart, idle timeout). Drop our
      // record of it so the Browser panel can show it as disconnected rather than silently failing
      // every subsequent query against a dead client.
      if (liveDbConnections.get(id)?.client === db) liveDbConnections.delete(id);
    });
    return { ok: true, id, info: res.rows[0], config: safeConfig };
  } catch (err) {
    if (db) try { await db.end(); } catch (_) {}
    return { ok: false, error: friendlyDbError(err, config) };
  }
});

ipcMain.handle("db-disconnect", async (_e, { id }) => {
  const entry = liveDbConnections.get(id);
  if (!entry) return { ok: true, alreadyClosed: true };
  liveDbConnections.delete(id);
  try { await entry.client.end(); } catch (_) {}
  return { ok: true };
});

ipcMain.handle("db-live-list", async () => {
  return {
    ok: true,
    connections: Array.from(liveDbConnections.entries()).map(([id, { safeConfig, connectedAt }]) => ({ id, config: safeConfig, connectedAt })),
  };
});

ipcMain.handle("db-live-query", async (_e, { id, sql }) => {
  const entry = liveDbConnections.get(id);
  if (!entry) return { ok: false, error: "This connection has been closed — reconnect and try again.", needsReconnect: true };
  try {
    const res = await entry.client.query(sql);
    return { ok: true, rows: res.rows, fields: res.fields, rowCount: res.rowCount };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err, entry.safeConfig) };
  }
});

ipcMain.handle("db-live-list-tables", async (_e, { id }) => {
  const entry = liveDbConnections.get(id);
  if (!entry) return { ok: false, error: "This connection has been closed — reconnect and try again.", needsReconnect: true };
  try {
    const res = await entry.client.query(listTablesQuery(entry.safeConfig));
    return { ok: true, tables: res.rows };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err, entry.safeConfig) };
  }
});

// Close every live connection cleanly on quit rather than letting the OS kill the sockets.
app.on("before-quit", () => {
  for (const { client } of liveDbConnections.values()) { try { client.end(); } catch (_) {} }
  liveDbConnections.clear();
});

// TASKS.csv #206 — filesystem listing for the Browser panel's folder tree (QGIS-style: C:\ / home
// drive root, expandable). Deliberately narrow: lists one directory at a time (the renderer expands
// lazily, node by node, exactly like QGIS's own Browser tree) rather than walking a whole subtree, so
// a huge folder (or a whole drive) can't stall the main process or return a giant payload.
ipcMain.handle("fs-list-dir", async (_e, { dirPath }) => {
  try {
    const names = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const entries = names
      .filter((n) => !n.name.startsWith("."))
      .map((n) => {
        let isDir = n.isDirectory();
        // A directory symlink (junction) reports isDirectory()===false on some Windows setups —
        // resolve it explicitly rather than misclassifying it as a file.
        if (n.isSymbolicLink()) {
          try { isDir = fs.statSync(path.join(dirPath, n.name)).isDirectory(); } catch (_) { isDir = false; }
        }
        return { name: n.name, path: path.join(dirPath, n.name), isDir };
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: err.code === "EACCES" || err.code === "EPERM" ? `Permission denied: ${dirPath}` : err.message };
  }
});

// Reads one file's raw bytes for the Browser panel's "click a file to import it" flow — the renderer
// wraps the base64 back into a Blob/File so it can be handed to the SAME parseVectorFile()/
// openImportModal() path the existing file-input Import buttons already use, rather than duplicating
// that parsing logic here. Deliberately a single whole-file read (no streaming) — import files here
// are collar/survey/lithology CSVs or small vector packages, not multi-GB data.
ipcMain.handle("fs-read-file", async (_e, { filePath }) => {
  try {
    const buf = await fs.promises.readFile(filePath);
    return { ok: true, base64: buf.toString("base64"), name: path.basename(filePath) };
  } catch (err) {
    return { ok: false, error: err.code === "EACCES" || err.code === "EPERM" ? `Permission denied: ${filePath}` : err.message };
  }
});

// Drive roots (Windows: C:\, D:\, ... ; macOS/Linux: just / — the Browser panel's tree root(s)).
ipcMain.handle("fs-list-drives", async () => {
  if (process.platform !== "win32") return { ok: true, drives: ["/"] };
  const drives = [];
  for (const code of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const drive = `${code}:\\`;
    try { if (fs.existsSync(drive)) drives.push(drive); } catch (_) {}
  }
  return { ok: true, drives: drives.length ? drives : ["C:\\"] };
});

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "New Project", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.webContents.send("menu", "new-project") },
        { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => mainWindow?.webContents.send("menu", "open-project") },
        { label: "Save Project…", accelerator: "CmdOrCtrl+S", click: () => mainWindow?.webContents.send("menu", "save-project") },
        { type: "separator" },
        { label: "Import CSV…", accelerator: "CmdOrCtrl+I", click: () => mainWindow?.webContents.send("menu", "import-csv") },
        { label: "Import Assays…", click: () => mainWindow?.webContents.send("menu", "import-assays") },
        { label: "Import pXRF…", click: () => mainWindow?.webContents.send("menu", "import-pxrf") },
        { type: "separator" },
        { label: "Export PDF…", accelerator: "CmdOrCtrl+P", click: () => mainWindow?.webContents.send("menu", "export-pdf") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      // TASKS.csv #31 — deliberately NO keyboard accelerator on these two. Electron menu accelerators
      // are global-to-the-window and would win over a focused <input>'s own native Ctrl+Z text-undo
      // (of which this app has many — search fields, name fields, the layout text tool, etc.), which
      // would be a much worse regression than not having a menu shortcut for app-level undo. The real
      // Ctrl+Z/Ctrl+Shift+Z handling lives in App.jsx's own keydown listener instead, which can check
      // document.activeElement and defer to native text-undo when a text field has focus — something
      // a Menu accelerator has no way to do. These items exist for menu discoverability/mouse use only.
      label: "Edit",
      submenu: [
        { label: "Undo", click: () => mainWindow?.webContents.send("menu", "undo") },
        { label: "Redo", click: () => mainWindow?.webContents.send("menu", "redo") },
      ],
    },
    {
      label: "View",
      submenu: [
        // TASKS.csv #32 — module-switch accelerators (Ctrl/Cmd+1..4). Previously these four had no
        // keyboard shortcut at all despite being the most-used navigation in the app; added now partly
        // because a "keyboard shortcuts reference" that only had 5 shortcuts to list would barely be
        // worth its own menu entry — these round it out into something actually useful to reference.
        { label: "3D View", accelerator: "CmdOrCtrl+1", click: () => mainWindow?.webContents.send("menu", "module-viewer") },
        { label: "Geochem", accelerator: "CmdOrCtrl+2", click: () => mainWindow?.webContents.send("menu", "module-geochem") },
        { label: "Geophysics", accelerator: "CmdOrCtrl+3", click: () => mainWindow?.webContents.send("menu", "module-geophysics") },
        { label: "Layout", accelerator: "CmdOrCtrl+4", click: () => mainWindow?.webContents.send("menu", "module-layout") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggledevtools" },
        { type: "separator" },
        { role: "resetzoom" }, { role: "zoomin" }, { role: "zoomout" },
      ],
    },
    {
      label: "Tools",
      submenu: [
        { label: "Cross-section (pop-out)", accelerator: "CmdOrCtrl+Shift+C", click: () => mainWindow?.webContents.send("menu", "cross-section") },
        { label: "Set project EPSG…", click: () => mainWindow?.webContents.send("menu", "set-epsg") },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "CmdOrCtrl+/", click: () => mainWindow?.webContents.send("menu", "shortcuts") },
        // Bug fix while touching this menu: "About GeoStrix" sent a "menu"/"about" action that nothing
        // on the renderer side ever handled — clicking it silently did nothing. Now shares the same
        // modal as the new Keyboard Shortcuts entry (see ShortcutsModal in App.jsx), just opened to a
        // different tab.
        { label: "About GeoStrix", click: () => mainWindow?.webContents.send("menu", "about") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => { createMainWindow(); startPythonSidecar(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
app.on("before-quit", stopPythonSidecar);
