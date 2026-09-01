// Bridges to Electron when available; degrades gracefully in a plain browser (dev in Vite).
const d = typeof window !== "undefined" ? window.desktop : null;

export const isDesktop = !!(d && d.isDesktop);

export async function savePDF(suggestedName) {
  if (d) return d.exportPDF({ suggestedName });
  // browser fallback: trigger the print dialog
  window.print();
  return { ok: false, fallback: true };
}

export async function saveFile({ suggestedName, filters, content, encoding }) {
  if (d) return d.saveFile({ suggestedName, filters, content, encoding });
  // browser fallback: anchor download
  const blob = encoding === "base64"
    ? b64toBlob(content)
    : new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = suggestedName; a.click();
  URL.revokeObjectURL(url);
  return { ok: true, fallback: true };
}

export async function openFile({ filters } = {}) {
  if (d) return d.openFile({ filters });
  // browser fallback: hidden file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = (filters || []).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return resolve({ ok: false });
      const reader = new FileReader();
      reader.onload = () => resolve({ ok: true, content: reader.result, name: file.name });
      reader.readAsText(file);
    };
    input.click();
  });
}

export async function openSectionWindow(payload) {
  if (d) return d.openSectionWindow(payload);
  // browser fallback: new tab won't share memory; we stash in sessionStorage keyed by id. Reuses the
  // caller-supplied id (matching its store.sections entry) when given one, so contacts drawn in the new
  // tab relay back to the right saved section — see the CONTACTS_CHANNEL bit below.
  const id = payload?.id || `section_${Date.now()}`;
  sessionStorage.setItem(id, JSON.stringify(payload));
  window.open(`${location.origin}${location.pathname}#/section?id=${id}`, "_blank");
  return { id, fallback: true };
}

export async function updateSectionWindow(payload) {
  if (d) return d.updateSectionWindow(payload);
  return { ok: false, fallback: true };
}

// A section pop-out relays its "snapshot to Layout" click back to the main window. In Electron this
// goes through the main process (see electron/main.js "section-snapshot"); in the plain-browser dev
// fallback (where the pop-out is just `window.open` to a new tab, not a separate OS process) a
// BroadcastChannel does the same job without needing window.opener (which "noopener"-style tabs may
// not have, and which wouldn't survive a page reload anyway).
const SNAPSHOT_CHANNEL = "geox-section-snapshot";
export async function sendSectionSnapshot(payload) {
  if (d) return d.sendSectionSnapshot(payload);
  try { new BroadcastChannel(SNAPSHOT_CHANNEL).postMessage(payload); } catch (_) {}
  return { ok: true, fallback: true };
}
export function onSectionSnapshot(cb) {
  if (d) return d.onSectionSnapshot(cb);
  try {
    const bc = new BroadcastChannel(SNAPSHOT_CHANNEL);
    const h = (e) => cb(e.data);
    bc.addEventListener("message", h);
    return () => { bc.removeEventListener("message", h); bc.close(); };
  } catch (_) { return () => {}; }
}

// TASKS.csv — cross-section contact drawing: same relay mechanism as the snapshot channel above, for a
// pop-out's drawn/edited contacts (interpreted lithological contacts on the 2D section) making their
// way back into the main window's store.sections (see App.jsx's onSectionContacts listener).
const CONTACTS_CHANNEL = "geox-section-contacts";
export async function sendSectionContacts(payload) {
  if (d) return d.sendSectionContacts(payload);
  try { new BroadcastChannel(CONTACTS_CHANNEL).postMessage(payload); } catch (_) {}
  return { ok: true, fallback: true };
}
export function onSectionContacts(cb) {
  if (d) return d.onSectionContacts(cb);
  try {
    const bc = new BroadcastChannel(CONTACTS_CHANNEL);
    const h = (e) => cb(e.data);
    bc.addEventListener("message", h);
    return () => { bc.removeEventListener("message", h); bc.close(); };
  } catch (_) { return () => {}; }
}

// TASKS.csv #33 — autosave / crash recovery. In Electron this writes a fixed userData-dir file with
// no save-dialog (electron/main.js "autosave-*"); the plain-browser dev fallback uses localStorage
// (fine here — this is GeoStrix's own app code, not a claude.ai artifact, and it's the same kind of
// "small local state that survives a reload" job sessionStorage already does for the section pop-out
// above, just needing to survive a full app restart instead of one tab's lifetime).
const AUTOSAVE_KEY = "geox-autosave";
export async function autosaveWrite(content) {
  if (d) return d.autosaveWrite({ content });
  try { localStorage.setItem(AUTOSAVE_KEY, content); return { ok: true, fallback: true }; }
  catch (err) { return { ok: false, error: err.message }; }
}
export async function autosaveRead() {
  if (d) return d.autosaveRead();
  try {
    const content = localStorage.getItem(AUTOSAVE_KEY);
    if (!content) return { ok: false };
    return { ok: true, content, fallback: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function autosaveClear() {
  if (d) return d.autosaveClear();
  try { localStorage.removeItem(AUTOSAVE_KEY); return { ok: true, fallback: true }; }
  catch (err) { return { ok: false, error: err.message }; }
}

export function onMenu(cb) {
  if (d) return d.onMenu(cb);
  return () => {};
}
export function onSectionData(cb) {
  if (d) return d.onSectionData(cb);
  return () => {};
}

export async function dbTest(config) {
  if (!d) return { ok: false, error: "Database connections require the desktop app (not available in the browser preview)." };
  return d.dbTest(config);
}
export async function dbQuery(config, sql) {
  if (!d) return { ok: false, error: "Database connections require the desktop app." };
  return d.dbQuery(config, sql);
}
export async function dbListTables(config) {
  if (!d) return { ok: false, error: "Database connections require the desktop app." };
  return d.dbListTables(config);
}

// TASKS.csv #206 — persistent DB connections + filesystem browsing for the Browser panel. See
// electron/main.js's liveDbConnections Map for what "persistent" means here: held in the main
// process's memory for the app session, never written to disk — same password-never-saved guarantee
// as dbTest/dbQuery/dbListTables above, just not re-asked for on every single query/import.
export async function dbConnect(config) {
  if (!d) return { ok: false, error: "Database connections require the desktop app." };
  return d.dbConnect(config);
}
export async function dbDisconnect(id) {
  if (!d) return { ok: false, error: "Database connections require the desktop app." };
  return d.dbDisconnect(id);
}
export async function dbLiveList() {
  if (!d) return { ok: true, connections: [] };
  return d.dbLiveList();
}
export async function dbLiveQuery(id, sql) {
  if (!d) return { ok: false, error: "Database connections require the desktop app." };
  return d.dbLiveQuery(id, sql);
}
export async function dbLiveListTables(id) {
  if (!d) return { ok: false, error: "Database connections require the desktop app." };
  return d.dbLiveListTables(id);
}
export async function fsListDir(dirPath) {
  if (!d) return { ok: false, error: "Folder browsing requires the desktop app (not available in the browser preview)." };
  return d.fsListDir(dirPath);
}
export async function fsListDrives() {
  if (!d) return { ok: true, drives: [] };
  return d.fsListDrives();
}
export async function fsReadFile(filePath) {
  if (!d) return { ok: false, error: "Folder browsing requires the desktop app." };
  return d.fsReadFile(filePath);
}
// Reconstructs a browser File object from a main-process file read (see fsReadFile above) so a file
// clicked in the Browser panel can be handed to the exact same parseVectorFile()/openImportModal()
// path the existing "Import" toolbar buttons already use.
export function base64ToFile(base64, name) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name);
}

// ---------- SRTM tile fetch (see electron/main.js's fetch-srtm-tile handler) ----------
// In Electron, proxied through the main process (sidesteps any CORS question, keeps the renderer's
// network surface narrow — see main.js's comment). In a plain-browser dev session there's no main
// process to proxy through, so this falls back to a direct fetch of the same public AWS bucket —
// works as long as the bucket's own CORS policy allows it, which it's designed to (built for direct
// browser/client consumption). Both paths resolve to the same thing: raw PNG bytes as an ArrayBuffer.
export async function fetchSRTMTile(z, x, y) {
  if (d && d.fetchSRTMTile) {
    const res = await d.fetchSRTMTile(z, x, y);
    if (!res.ok) throw new Error(res.message || `Tile fetch failed (z${z}/${x}/${y}).`);
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile fetch failed (HTTP ${res.status}) for z${z}/${x}/${y}.`);
  return res.arrayBuffer();
}

// ---------- Generic web-layer fetch (see electron/main.js's fetch-web-layer handler) ----------
// TASKS.csv #127 — WMS/WMTS/WFS. Same Electron-proxy / browser-fallback split as fetchSRTMTile above,
// generalized to an arbitrary user-supplied URL instead of one fixed source: in Electron this goes
// through the main process (sidesteps CORS, which most government WMS/WFS servers don't set
// permissively for arbitrary origins); in a plain-browser dev session it falls back to a direct
// fetch(), which works only as far as that particular server's own CORS policy allows — same honest
// limitation the SRTM fallback already has. Returns { contentType, arrayBuffer } uniformly so callers
// can decide whether to decode as text (XML capabilities, GeoJSON) or wrap as an image data URL.
export async function fetchWebLayerUrl(url) {
  if (d && d.fetchWebLayerUrl) {
    const res = await d.fetchWebLayerUrl(url);
    if (!res.ok) throw new Error(res.message || `Request failed for ${url}`);
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { contentType: res.contentType || "", arrayBuffer: bytes.buffer };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status}) for ${url}`);
  return { contentType: res.headers.get("content-type") || "", arrayBuffer: await res.arrayBuffer() };
}

// ---------- Python sidecar (see electron/main.js startPythonSidecar, python-sidecar/) ----------
// Unlike everything else in this file, these are plain `fetch()` calls, not `window.desktop` IPC —
// the sidecar is a local HTTP server, so there's nothing Electron-specific about talking to it, and
// this works identically in a plain-browser dev session (as long as you've started the sidecar
// manually, since there's no Electron main process there to spawn it for you). Every call is
// wrapped so a connection failure (Python not installed, deps missing, sidecar still booting) comes
// back as a normal { ok: false } result — never a thrown/unhandled rejection — since these features
// are always optional extras on top of an app that works fully without them.
const PY_SIDECAR_BASE = "http://127.0.0.1:8765";

export async function pythonHealth() {
  try {
    const res = await fetch(`${PY_SIDECAR_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, error: `Sidecar returned HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: "Python sidecar not reachable (not started, still booting, or Python/deps not installed — see python-sidecar/README.md)." };
  }
}

// TASKS.csv #187 — bug fix: FastAPI's automatic 422 validation-error response shape is
// `{"detail": [{"loc": [...], "msg": "...", "type": "..."}, ...]}` — an ARRAY of objects, not a
// string. Both pythonInterpolate and pythonImplicitModel used to do `body?.detail || ...` and hand
// that straight to `res.error`, which a caller then interpolates into a template string (e.g.
// ViewerModule.jsx's runSurfaceStack: `${label} failed: ${res.error}`). Array.prototype.toString on
// an array of plain objects joins them with "," after calling each object's own toString, and a
// plain object's default toString is "[object Object]" — hence the exact "[object Object],
// [object Object],[object Object]" a real user hit when the stratigraphic stack request failed
// validation (one entry per invalid field, in this case 3). This helper renders both shapes into an
// actual readable string; a plain-string `detail` (a handled application error the sidecar raises
// deliberately, e.g. "not enough points") still passes through unchanged.
function formatSidecarErrorDetail(detail, status) {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        const loc = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== "body").join(".") : null;
        const msg = d?.msg || JSON.stringify(d);
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join("; ");
  }
  return `Sidecar returned HTTP ${status}`;
}

// points: [{x,y,z,value}], query: [{x,y,z}], opts: {method:'rbf'|'idw', rbfFunction, smoothing, power}
export async function pythonInterpolate(points, query, opts = {}) {
  try {
    const res = await fetch(`${PY_SIDECAR_BASE}/interpolate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points, query,
        method: opts.method || "rbf",
        rbf_function: opts.rbfFunction || "thin_plate_spline",
        smoothing: opts.smoothing ?? 0,
        power: opts.power ?? 2,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: formatSidecarErrorDetail(body?.detail, res.status) };
    }
    const data = await res.json();
    return { ok: true, values: data.values };
  } catch (err) {
    return { ok: false, error: "Python sidecar not reachable (not started, still booting, or Python/deps not installed — see python-sidecar/README.md)." };
  }
}

// TASKS.csv #29 — implicit surface modelling (GemPy, via the sidecar's /implicit-model endpoint).
// surfaces: [{ name, points: [{x,y,z}], orientations: [{x,y,z,dip,azimuth}] }]
export async function pythonImplicitModel(extent, surfaces, opts = {}) {
  try {
    const res = await fetch(`${PY_SIDECAR_BASE}/implicit-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extent, surfaces,
        resolution: opts.resolution || [40, 40, 40],
        relation: opts.relation || "erode",
      }),
      // Real bug found here: this used to be 60s, and a fetch that hits an AbortSignal timeout
      // throws the exact same generic error as a genuinely-unreachable sidecar, so a slow-but-
      // working request looked identical to a broken one ("Python sidecar not reachable" — while
      // the Py status-bar indicator sat green the whole time, since /health is a separate, fast
      // request unaffected by how long /implicit-model takes). GemPy's own import is heavy (numba/
      // JIT-backed), and that cost lands entirely on the FIRST call each time the sidecar process
      // starts — a cold first run against a real multi-hole property can genuinely take well over
      // a minute before any compute even begins. 300s gives real (if slow) runs room to finish
      // instead of being cut off and misreported as a connectivity problem.
      // TASKS.csv #231 — a real GemPy run can take 80s+ on a real property; opts.signal lets the
      // caller offer a genuine cancel button (ViewerModule wires an AbortController's signal through
      // and a "Cancel" action in the status bar) rather than making the user wait out the fixed 5-
      // minute timeout below or force-quit the app. AbortSignal.any combines both — whichever fires
      // first (user cancel or the safety-net timeout) aborts the fetch; Electron's Chromium is recent
      // enough to have AbortSignal.any (shipped Chrome 116+).
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: formatSidecarErrorDetail(body?.detail, res.status) };
    }
    const data = await res.json();
    return { ok: true, surfaces: data.surfaces };
  } catch (err) {
    // A user-triggered cancel (opts.signal aborted with this specific reason) gets its own quiet,
    // non-error message — distinct from a genuine timeout/connectivity problem, which the two branches
    // below still handle exactly as before.
    if (opts.signal?.aborted && opts.signal.reason === "user-cancelled") {
      return { ok: false, cancelled: true, error: "Cancelled." };
    }
    // Distinguish "the request timed out" (sidecar is there and presumably still working, just
    // slow) from "the sidecar genuinely isn't reachable" (not started, crashed, or gempy missing)
    // — these used to share one misleading message that always pointed at connectivity/install
    // even when the real cause was just needing more time.
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, error: "Timed out after 5 minutes waiting on the sidecar. GemPy's first run after the sidecar starts is slow (importing its numba-backed dependencies alone can take a while) — if this was the first run this session, try again now that it's warmed up. If it keeps timing out, try a coarser resolution or fewer points/orientations." };
    }
    return { ok: false, error: "Python sidecar not reachable, or gempy isn't installed there yet (pip install -r python-sidecar/requirements.txt — this pulls in gempy, a bigger install than the base sidecar)." };
  }
}

function b64toBlob(b64) {
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes]);
}
