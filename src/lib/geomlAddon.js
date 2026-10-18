// TASKS.csv #638 — the renderer's side of the predictive-modelling add-on (addons/geoml, geoML, GPL-3.0): install /
// status through the desktop bridge (electron/addons.js), then jobs over the add-on's local API (127.0.0.1:8766) with the
// per-launch token. Without the desktop app (browser preview) a developer can run the add-on by hand on 8766 with no
// token, and this talks to it directly.
import { sidecarProof } from "./desktop.js"; // TASKS.csv #667 — the same HMAC check as the engine
const d = typeof window !== "undefined" ? window.desktop : null;
const ID = "geoml";
const DEFAULT_PORT = 8766;

export const addonDesktop = !!d?.addonStatus;
export async function addonStatus() {
  if (d?.addonStatus) return d.addonStatus(ID);
  try { const r = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/health`, { signal: AbortSignal.timeout(1500) }); return { id: ID, available: true, installed: r.ok, running: r.ok, dev: true }; }
  catch { return { id: ID, available: true, installed: false, running: false, browser: true }; }
}
export const addonInstall = () => (d?.addonInstall ? d.addonInstall(ID) : Promise.resolve({ ok: false, error: "Installing add-ons needs the desktop app." }));
export const addonCancelInstall = () => d?.addonCancelInstall?.(ID);
export const addonUninstall = () => d?.addonUninstall?.(ID);
export const onAddonEvent = (cb) => (d?.onAddonEvent ? d.onAddonEvent((ev) => { if (ev.id === ID) cb(ev); }) : () => {});

let conn = null;
async function connection() {
  if (!d?.addonEnsure) return { port: DEFAULT_PORT, token: null };
  const e = await d.addonEnsure(ID);
  if (!e.ok) throw new Error(e.error || "The predictive-modelling add-on could not start.");
  conn = await d.addonConnection(ID);
  return conn;
}

// TASKS.csv #645 — the cached port + token go stale when the add-on stops (crash, Remove, cancel restarts it):
// a refused connection or a 401 drops them and the call is tried once more on a fresh connection.
async function call(path, { method = "GET", body, timeoutMs = 30000 } = {}, retried = false) {
  const c = conn || (await connection());
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${c.port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(c.token ? { "X-GeoStrix-Token": c.token } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (!retried && e.name !== "TimeoutError" && d?.addonEnsure) { conn = null; return call(path, { method, body, timeoutMs }, true); }
    throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && d?.addonEnsure) { conn = null; return call(path, { method, body, timeoutMs }, true); }
  if (!res.ok) throw Object.assign(new Error(json.detail || `The add-on answered HTTP ${res.status}.`), { status: res.status, body: json });
  return json;
}

// Starts the add-on if needed and waits until it answers (first start: Windows may scan the new files for a while).
// TASKS.csv #667 — identity first: /health is asked with a fresh nonce and must return HMAC-SHA256(token, nonce), as
// GeoStrix's own engine does (#353), before the token or any project data is sent. An add-on from 0.1.2 on always
// answers with the proof, so for those a missing proof is refused (no downgrade to the weaker check); 0.1.0 / 0.1.1
// keep the earlier token-checked probe.
const versionAtLeast = (v, min) => { const a = String(v || "0").split(".").map(Number), b = min.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; } return true; };
export async function addonReady(onWait, maxMs = 120000) {
  conn = null;
  const c = await connection();
  const installed = d?.addonStatus ? await d.addonStatus(ID).catch(() => null) : null;
  const expectProof = !!c.token && versionAtLeast(installed?.version, "0.1.2");
  const t0 = Date.now();
  for (;;) {
    let health = null;
    const nonce = c.token ? hex(crypto.getRandomValues(new Uint8Array(24))) : null;
    try {
      const r = await fetch(`http://127.0.0.1:${c.port}/health${nonce ? `?nonce=${nonce}` : ""}`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) health = await r.json();
    } catch { /* not up yet */ }
    if (health) {
      const stranger = () => new Error(`Another program answered on port ${c.port} instead of GeoStrix's predictive-modelling add-on, so no data was sent. Close other copies of GeoStrix and try again.`);
      if (c.token && (health.proof || expectProof)) {
        if (health.proof !== (await sidecarProof(c.token, nonce))) throw stranger();
      } else if (c.token) {
        // #645 — add-on 0.1.0 / 0.1.1: a token-checked request tells ours ("no such job", 404) from a stranger (401)
        const p = await fetch(`http://127.0.0.1:${c.port}/v1/jobs/identity-probe`, { headers: { "X-GeoStrix-Token": c.token }, signal: AbortSignal.timeout(2000) });
        if (p.status === 401) throw stranger();
      }
      return health;
    }
    if (Date.now() - t0 > maxMs) throw new Error("The predictive-modelling add-on didn't start within two minutes. Its log is in GeoStrix's settings folder (addons/geoml/addon.log).");
    onWait?.(Math.round((Date.now() - t0) / 1000));
    await new Promise((r) => setTimeout(r, 1000));
  }
}
// #692 — what the running add-on can do (0.1.2 lists it; older ones are known by version)
export const addonHas = (health, feature) => (Array.isArray(health?.features) ? health.features.includes(feature) : feature === "trend" && versionAtLeast(health?.version, "0.1.1"));
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export const startJob = (kind, params) => call("/v1/jobs", { method: "POST", body: { kind, params }, timeoutMs: 60000 });
export const jobStatus = (id) => call(`/v1/jobs/${encodeURIComponent(id)}`, { timeoutMs: 10000 });
export const jobResult = (id) => call(`/v1/jobs/${encodeURIComponent(id)}/result`, { timeoutMs: 120000 });
export const cancelJob = (id) => call(`/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {}, timeoutMs: 10000 });

// Runs a job to the end: onProgress({ progress, message, elapsed }) every second; resolves with the result.
// TASKS.csv #691 — as robust as the engine's job client (#321 / #515): a status poll that times out while TensorFlow
// saturates the CPU is retried (up to MAX_MISSES in a row) instead of abandoning a running 1-2 GB job; whenever the
// client gives up, the job is cancelled so it is not left running with nothing able to cancel it; a "no such job"
// after a lost connection (the add-on was restarted) says what happened instead of a bare 404; and a 409 from a
// model already running carries that job's id (err.busyJobId) so the panel can offer to cancel it.
export const MAX_MISSES = 5;
export async function runJob(kind, params, onProgress, signal, { pollMs = 1000 } = {}) {
  let job;
  try { job = await startJob(kind, params); }
  catch (e) {
    if (e.status === 409 && e.body?.job?.id) throw Object.assign(new Error("A predictive model is already running in the add-on (started earlier). Cancel it, then run this again."), { busyJobId: e.body.job.id });
    throw e;
  }
  const giveUp = async (err) => { await cancelJob(job.id).catch(() => {}); throw err; };
  let misses = 0, lastErr = null;
  for (;;) {
    if (signal?.aborted) return giveUp(new Error("Cancelled."));
    await new Promise((r) => setTimeout(r, pollMs));
    let s;
    try { s = await jobStatus(job.id); misses = 0; }
    catch (e) {
      if (e.status === 404) return giveUp(new Error("The add-on stopped while the model was running (it was restarted, so the job is gone). Its log is in GeoStrix's settings folder (addons/geoml/addon.log)."));
      misses++; lastErr = e;
      if (misses >= MAX_MISSES) return giveUp(new Error(`Lost contact with the add-on (${MAX_MISSES} status checks in a row failed: ${lastErr.message}). The model was cancelled.`));
      continue;
    }
    onProgress?.(s);
    if (s.state === "done") return jobResult(job.id);
    if (s.state === "error" || s.state === "failed") throw new Error(s.error || "The model failed.");
    if (s.state === "cancelled") throw new Error("Cancelled.");
  }
}
