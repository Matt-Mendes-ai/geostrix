// Bridges to Electron when available; degrades gracefully in a plain browser (dev in Vite).
const d = typeof window !== "undefined" ? window.desktop : null;

export const isDesktop = !!(d && d.isDesktop);

// TASKS.csv #398 — pdf = { pageSize, landscape } from lib/pageFormats.js pdfOptions(); omitted = A4 landscape.
export async function savePDF(suggestedName, pdf = {}) {
  if (d) return d.exportPDF({ suggestedName, ...pdf });
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

// TASKS.csv #553 — write to a path the user already chose this session (the project's own file); refused by the
// main process otherwise ({ notAllowed }), and unavailable in a plain browser.
export async function saveFileTo({ filePath, content, encoding }) {
  if (!d?.saveFileTo) return { ok: false, notAllowed: true };
  return d.saveFileTo({ filePath, content, encoding });
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
// TASKS.csv #475 — move an unreadable autosave aside (desktop); the browser fallback just drops it.
export async function autosaveQuarantine() {
  if (d && d.autosaveQuarantine) return d.autosaveQuarantine();
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) { /* ignore */ }
  return { ok: false };
}
export async function autosaveRead() {
  if (d) return d.autosaveRead();
  try {
    const content = localStorage.getItem(AUTOSAVE_KEY);
    if (!content) return { ok: false };
    return { ok: true, content, fallback: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
// User-reported bug: closing the app with unsaved changes didn't work at all — no dialog, no
// feedback, only killable via Task Manager. Root cause was App.jsx's beforeunload handler: the
// standard e.preventDefault() pattern shows a real "leave site?" dialog in an actual browser, but
// Electron shows nothing for it by default and just silently blocks the window from closing forever.
// Fixed by pushing dirty state to the main process instead, which owns a real dialog.showMessageBoxSync
// confirm on the window's close event (see electron/main.js) — no-op in the browser fallback, where
// the plain beforeunload prompt (still wired up in App.jsx for that path) works correctly on its own.
export function setDirtyState(dirty) {
  if (d) d.setDirtyState(dirty);
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
// TASKS.csv #346 — fs-read-file now returns raw bytes (`data`, a Uint8Array over IPC) instead of base64;
// accepts either so nothing breaks mid-upgrade.
export function readResultToFile(res, name) {
  if (res.data) return new File([res.data], name || res.name);
  return base64ToFile(res.base64, name || res.name);
}

// ---------- bundled sample data (TASKS.csv #293) ----------
// Returns real browser File objects for a list of files inside the shipped sample_data/ folder, so
// the "Load sample project" action in the 3D View's empty state can hand them straight to the same
// parseVectorFile()/import-queue path a drag-and-drop of those same CSVs would take — no separate
// import code path to keep in sync.
//
// Desktop: ask the main process where sample_data actually landed (repo in dev, <resources>/sample_data
// in a packaged install — see main.js's sample-data-path handler), then read each file through the
// existing fs-read-file bridge. Browser preview: Vite serves the repo root statically in dev, so the
// same files are reachable at /sample_data/... — which keeps this feature testable in a plain
// `vite` session exactly like the rest of the app's browser-fallback branches.
export async function loadSampleFiles(subdir, names) {
  const rel = (n) => `${subdir ? subdir + "/" : ""}${n}`;
  if (d && d.sampleDataPath) {
    const res = await d.sampleDataPath();
    if (!res.ok) throw new Error(res.error || "Sample data folder not found.");
    const sep = res.path.includes("\\") ? "\\" : "/";
    const files = [];
    for (const n of names) {
      const r = await d.fsReadFile(`${res.path}${sep}${rel(n).split("/").join(sep)}`);
      if (!r.ok) throw new Error(`${n}: ${r.error || "couldn't be read"}`);
      files.push(readResultToFile(r, n)); // #346
    }
    return files;
  }
  const files = [];
  for (const n of names) {
    const r = await fetch(`/sample_data/${rel(n)}`);
    if (!r.ok) throw new Error(`${n}: sample data isn't available in this preview (HTTP ${r.status}).`);
    files.push(new File([await r.blob()], n));
  }
  return files;
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

// ---------- Auto-update (see electron/main.js setupAutoUpdater, TASKS.csv #37) ----------
// Desktop-only, like most of this file — a browser/dev session has no installer to update, so every
// call here is a no-op there (checkForUpdates resolves { ok: false } with an explanatory message
// rather than throwing, matching this file's general "can't help, here's why" shape; the others are
// harmless no-ops since there's nothing to download/install without an active update in progress).
export async function checkForUpdates() {
  if (d && d.updaterCheck) return d.updaterCheck();
  return { ok: false, message: "Update checks require the desktop app." };
}
export async function downloadUpdate() {
  if (d && d.updaterDownload) return d.updaterDownload();
  return { ok: false, message: "Update checks require the desktop app." };
}
export async function installUpdate() {
  if (d && d.updaterInstall) return d.updaterInstall();
  return { ok: false, message: "Update checks require the desktop app." };
}
export function onUpdaterEvent(cb) {
  if (d && d.onUpdaterEvent) return d.onUpdaterEvent(cb);
  return () => {};
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

// TASKS.csv #321 — the sidecar requires a per-launch token (electron/main.js). Fetched once over IPC and
// sent on every request. In a plain-browser dev session there is no Electron, no token, and a hand-started
// sidecar that doesn't require one — so the header is simply omitted there.
let sidecarTokenPromise = null;
// TASKS.csv #353 — before the token (and with it any project data) goes to 127.0.0.1:8765, make sure the
// program listening there is OUR sidecar: it must return HMAC-SHA256(token, a fresh random nonce). Anything
// else on that port (another app, a leftover process from another tool) gets nothing. Checked once per
// session; a failed check is not remembered, so starting the real sidecar later still works.
let sidecarVerified = null;
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
export async function sidecarProof(token, nonce) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(nonce)));
}
async function verifySidecarIdentity(token) {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(24)));
  const res = await fetch(`${PY_SIDECAR_BASE}/health?nonce=${nonce}`, { signal: AbortSignal.timeout(3000) });
  const j = await res.json().catch(() => ({}));
  if (j?.proof !== (await sidecarProof(token, nonce))) {
    const e = new Error("Another program is using the Python engine's port (127.0.0.1:8765), so GeoStrix did not send it your data. Close that program (or restart the computer) and try again.");
    e.code = "SIDECAR_IDENTITY";
    throw e;
  }
}
async function sidecarHeaders(extra = {}) {
  if (!sidecarTokenPromise) sidecarTokenPromise = d?.getSidecarToken ? d.getSidecarToken().catch(() => null) : Promise.resolve(null);
  const token = await sidecarTokenPromise;
  if (!token) return extra;
  if (!sidecarVerified) sidecarVerified = verifySidecarIdentity(token).catch((e) => { sidecarVerified = null; throw e; });
  await sidecarVerified;
  return { ...extra, "X-GeoStrix-Token": token };
}
// TASKS.csv #440 — the desktop app starts the sidecar on first use instead of at launch. Every call that
// needs Python goes through this first: it asks the main process to spawn it (a no-op when running) and,
// when this call did the spawning, waits for /health so the request doesn't race the server's startup.
// In a plain-browser session there is nothing to spawn and this returns at once.
let sidecarStartPromise = null;
export async function ensureSidecarUp() {
  if (!d?.ensureSidecar) return;
  if (sidecarStartPromise) return sidecarStartPromise;
  sidecarStartPromise = (async () => {
    const r = await d.ensureSidecar().catch(() => null);
    if (r?.spawned) {
      // A frozen build unpacks and imports numpy/scipy before listening; allow it ~45 s.
      const until = Date.now() + 45000;
      while (Date.now() < until) {
        const h = await pythonHealth();
        if (h.ok) break;
        await new Promise((res) => setTimeout(res, 500));
      }
      window.dispatchEvent(new Event("geostrix-sidecar-started"));
    }
  })().finally(() => { sidecarStartPromise = null; });
  return sidecarStartPromise;
}
export async function isSidecarRunning() {
  return d?.isSidecarRunning ? d.isSidecarRunning().catch(() => false) : true;
}

// #391 follow-up — the README this used to point to isn't installed; the status bar's "Py" opens the in-app help
const SIDECAR_UNREACHABLE = "GeoStrix's Python engine isn't reachable (not started, still starting, or blocked) — click \"Py\" in the status bar for what to check.";
// TASKS.csv #563 — the pip advice only means something when running from source (no desktop bridge): the
// installer ships the engine frozen, with no requirements.txt and no pip.
const DEV_PIP_HINT = () => (d ? "" : " (Running from source: pip install -r python-sidecar/requirements.txt in python-sidecar's venv.)");
async function sidecarJson(path, { method = "GET", body, timeoutMs = 30000, signal } = {}) {
  await ensureSidecarUp();
  try {
    const res = await fetch(`${PY_SIDECAR_BASE}${path}`, {
      method,
      headers: await sidecarHeaders(body !== undefined ? { "Content-Type": "application/json" } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
    if (!res.ok) return { ok: false, status: res.status, error: formatSidecarErrorDetail(data?.detail) || `Sidecar returned HTTP ${res.status}`, data }; // data: #515 (running_job)
    return { ok: true, status: res.status, data };
  } catch (err) {
    // TASKS.csv #563 — say WHY: every failure used to read "isn't reachable", so a slow /result on a weak machine
    // or a user cancel looked like a missing engine. reason: identity | aborted | timeout | unreachable.
    if (err?.code === "SIDECAR_IDENTITY") return { ok: false, status: 0, reason: "identity", error: err.message }; // #353
    if (signal?.aborted) return { ok: false, status: 0, reason: "aborted", error: "Cancelled." };
    if (err?.name === "TimeoutError" || err?.name === "AbortError") return { ok: false, status: 0, reason: "timeout", error: `GeoStrix's Python engine didn't answer within ${Math.round(timeoutMs / 1000)} s — it may still be busy (a first run, or a slower machine, takes longer). Try again in a moment.` };
    return { ok: false, status: 0, reason: "unreachable", error: SIDECAR_UNREACHABLE + DEV_PIP_HINT() };
  }
}

// TASKS.csv #321 — SimPEG potential-field jobs. plan() never allocates anything heavy; a job runs in its
// own sidecar process, so cancel really frees its memory.
export const sidecarPlanPotential = (request) => sidecarJson("/v1/geophys/plan", { method: "POST", body: request, timeoutMs: 60000 });
export const sidecarStartPotentialJob = (request) => startSidecarJob("potential", request);
// TASKS.csv #322 — 2D DC resistivity / IP inversion job
export const sidecarStartDcipJob = (request) => startSidecarJob("dcip2d", request);
export const sidecarJobStatus = (id) => sidecarJson(`/v1/jobs/${encodeURIComponent(id)}`, { timeoutMs: 10000 });
// TASKS.csv #325 — asks for the per-cell columns as base64 binary (main.py binary_cells) and turns them back
// into plain number arrays here, so every caller sees exactly the shape it always did. An older sidecar that
// ignores ?binary=1 returns plain lists, which pass through untouched.
export function decodeBinaryCells(data) {
  const cells = data?.cells;
  if (!cells || typeof cells !== "object" || Array.isArray(cells)) return data;
  const out = {};
  for (const [k, v] of Object.entries(cells)) {
    if (v && typeof v === "object" && typeof v.b64 === "string" && (v.dtype === "f4" || v.dtype === "f8")) {
      const s = typeof atob === "function" ? atob(v.b64) : globalThis.Buffer.from(v.b64, "base64").toString("binary");
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      if (v.dtype === "f8") { out[k] = Array.from(new Float64Array(bytes.buffer)); continue; }
      // float32 offsets from `base`, rounded back to the column's decimals (exact: the sidecar checked it)
      const f = new Float32Array(bytes.buffer), base = Number(v.base) || 0, arr = new Array(f.length);
      const p = Number.isInteger(v.decimals) ? 10 ** v.decimals : null;
      for (let i = 0; i < f.length; i++) { const x = f[i] + base; arr[i] = p ? Math.round(x * p) / p : x; }
      out[k] = arr;
    } else out[k] = v;
  }
  return { ...data, cells: out };
}
export const sidecarJobResult = (id) => sidecarJson(`/v1/jobs/${encodeURIComponent(id)}/result?binary=1`, { timeoutMs: 120000 })
  .then((r) => (r.ok ? { ...r, data: decodeBinaryCells(r.data) } : r));
export const sidecarCancelJob = (id) => sidecarJson(`/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {}, timeoutMs: 10000 });

// TASKS.csv #515 — the sidecar runs ONE job at a time. A poll loop that gave up (lost contact, deadline) without
// cancelling used to leave that job holding the slot — still using CPU and RAM — and every later run got 409
// "cancel it first" with no job left in the app to cancel. Now giving up always sends /cancel; if that cannot
// get through either, the id is remembered, and the next start that hits a 409 naming it cancels it and retries.
const abandonedJobs = new Set();
export async function abandonSidecarJob(id) {
  if (!id) return { ok: false };
  abandonedJobs.add(id);
  const r = await sidecarCancelJob(id);
  if (r.ok) abandonedJobs.delete(id);
  return r;
}
export async function startSidecarJob(jobKind, request) {
  const post = () => sidecarJson("/v1/jobs", { method: "POST", body: { jobKind, request }, timeoutMs: 60000 });
  let res = await post();
  const stale = res.status === 409 ? res.data?.running_job : null;
  if (stale && abandonedJobs.has(stale)) {
    await sidecarCancelJob(stale);
    for (let i = 0; i < 20; i++) { // the process is terminated on cancel; give it up to ~10 s to free the slot
      const st = await sidecarJobStatus(stale);
      if (!st.ok || st.data?.state !== "running") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    abandonedJobs.delete(stale);
    res = await post();
  }
  return res;
}
// Poll misses tolerated before a loop gives up (a busy machine can miss one 10 s status call).
export const JOB_POLL_MAX_MISSES = 5;

export async function pythonHealth() {
  try {
    const res = await fetch(`${PY_SIDECAR_BASE}/health`, { signal: AbortSignal.timeout(2000) }); // #353: /health needs no token — never send it before the identity check
    if (!res.ok) return { ok: false, error: `Sidecar returned HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: SIDECAR_UNREACHABLE };
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

// TASKS.csv #406 — pythonInterpolate (and the sidecar's /interpolate) removed: no caller, unbounded RBF.

// TASKS.csv #29 — implicit surface modelling (GemPy, via the sidecar's /implicit-model endpoint).
// surfaces: [{ name, points: [{x,y,z}], orientations: [{x,y,z,dip,azimuth}] }]
// TASKS.csv #355 — runs as a sidecar JOB (its own process) so Cancel really stops the solve: the job is
// started, polled once a second, and cancelled (process terminated) when opts.signal fires. Same
// signature and return shape as before, so no caller changes. Falls back to the old synchronous endpoint
// when talking to an older sidecar that doesn't know jobKind "implicit".
export async function pythonImplicitModel(extent, surfaces, opts = {}) {
  const request = {
    extent, surfaces,
    resolution: opts.resolution || [40, 40, 40],
    relation: opts.relation || "erode",
    ...(opts.rangeMultiplier ? { range_multiplier: opts.rangeMultiplier } : {}),
    ...(opts.returnBlock ? { return_block: true } : {}), // TASKS.csv #356
    ...(opts.faults?.length ? { faults: opts.faults } : {}), // TASKS.csv #360 — faults that offset the stack
  };
  const start = await startSidecarJob("implicit", request); // #515
  if (!start.ok && start.status === 400 && /jobKind must be 'potential'\.?$/.test(start.error || "")) return pythonImplicitModelSync(extent, surfaces, opts);
  if (!start.ok) return { ok: false, error: start.error }; // #563 — the real reason (identity / timeout / unreachable / HTTP), unchanged
  const id = start.data.id;
  const deadline = Date.now() + 15 * 60 * 1000; // safety net only; Cancel is the real control now
  const cancelled = () => opts.signal?.aborted;
  let misses = 0; // #515
  for (;;) {
    if (cancelled()) { await sidecarCancelJob(id); return { ok: false, cancelled: true, error: "Cancelled." }; }
    if (Date.now() > deadline) { await sidecarCancelJob(id); return { ok: false, error: "Stopped after 15 minutes. Try a coarser resolution or fewer points/orientations." }; }
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 1000);
      opts.signal?.addEventListener?.("abort", () => { clearTimeout(t); resolve(); }, { once: true });
    });
    if (cancelled()) continue;
    const st = await sidecarJobStatus(id);
    if (!st.ok) {
      if (++misses < JOB_POLL_MAX_MISSES) continue;
      const c = await abandonSidecarJob(id); // #515 — never leave it holding the engine
      return { ok: false, error: `Lost contact with the Python engine during the run (${misses} status checks in a row failed: ${st.error})${c.ok ? " — the job was cancelled." : " — it will be cancelled automatically when you start the next run."}` };
    }
    misses = 0;
    if (st.data.state === "done") break;
    if (st.data.state === "cancelled") return { ok: false, cancelled: true, error: "Cancelled." };
    if (st.data.state === "failed") return { ok: false, error: st.data.error || "The modelling job failed." };
  }
  const r = await sidecarJobResult(id);
  if (!r.ok) return { ok: false, error: r.error };
  const data = r.data;
  return { ok: true, surfaces: data.surfaces, rangeUsed: data.range_used, rangeDefault: data.range_default, cO: data.c_o, block: data.block || null, orientationsDeduplicated: data.orientations_deduplicated ?? null }; // #512
}

// The pre-#355 synchronous call, kept only as a fallback for an older sidecar.
async function pythonImplicitModelSync(extent, surfaces, opts = {}) {
  await ensureSidecarUp(); // #440
  try {
    const res = await fetch(`${PY_SIDECAR_BASE}/implicit-model`, {
      method: "POST",
      headers: await sidecarHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        extent, surfaces,
        resolution: opts.resolution || [40, 40, 40],
        relation: opts.relation || "erode",
        ...(opts.faults?.length ? { faults: opts.faults } : {}), // TASKS.csv #360
        // TASKS.csv #274 — omitted entirely (not sent as 1) when the user leaves it on Auto, so the
        // request the sidecar sees is identical to a pre-#274 one in that case.
        ...(opts.rangeMultiplier ? { range_multiplier: opts.rangeMultiplier } : {}),
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
    // TASKS.csv #274 — rangeUsed/rangeDefault/cO are what the run notice and the exported surface's
    // provenance report, so "why did this look different than last time" has an answer. Older sidecars
    // don't send them; undefined then, and every consumer treats that as "unknown".
    return { ok: true, surfaces: data.surfaces, rangeUsed: data.range_used, rangeDefault: data.range_default, cO: data.c_o, orientationsDeduplicated: data.orientations_deduplicated ?? null }; // #512
  } catch (err) {
    if (err?.code === "SIDECAR_IDENTITY") return { ok: false, error: err.message }; // #353
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
    return { ok: false, error: SIDECAR_UNREACHABLE + DEV_PIP_HINT() }; // #563
  }
}

function b64toBlob(b64) {
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes]);
}
