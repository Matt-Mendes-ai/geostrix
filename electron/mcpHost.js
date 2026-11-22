"use strict";
// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — the AI-app (Model Context Protocol) server, in the main process, off until the user switches it on in Tools > AI App Access.
//   * Local only: a named pipe (Windows) or a Unix socket in a per-user folder, never a TCP port, so no web page can reach it; every connection starts with a per-launch token, which is
//     written (with the pipe's name) to <userData>/mcp/endpoint.json (user-only file) for the bridge (electron/mcpBridgeCli.js, GeoStrix run as Node) that an AI app starts, and removed when it is switched off.
//   * Read-only: the project lives in the window's store, so each tool call is sent to the window (mcp-request) and answered by src/lib/mcpTools.js. Nothing here touches a file or the project.
//   * The user is asked the first time an AI app connects (allow once / always allow / don't allow, a native box the window cannot answer), and sees which app is connected and what it called.
// Electron is injected (getWindow, askAllow, prefs), so a test can run the whole thing on a real pipe.
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createSession, createChangeLock, createJobs } = require("./mcpProtocol.js");

const DEBUG = !!process.env.GEOSTRIX_MCP_DEBUG; // a breadcrumb file for the live checks: events only, never what a tool returned
const HANDSHAKE_MS = 5000, CALL_TIMEOUT_MS = 30000, NETWORK_CALL_TIMEOUT_MS = 10 * 60000 /* #3932: a download */, MAX_LINE = 64 * 1024, ACTIVITY_KEPT = 60;

function createHost({ userDataDir, getWindow, askAllow, askNetwork, isOnline, readPrefs, writePrefs, onStatus = () => {}, platform = process.platform, limits, tools }) { // tools: a test may give its own list (#3932)
  const dir = path.join(userDataDir, "mcp"), endpointFile = path.join(dir, "endpoint.json");
  const dbg = (...a) => { if (DEBUG) try { fs.appendFileSync(path.join(dir, "debug.log"), `${new Date().toISOString()} ${a.join(" ")}
`); } catch { /* no folder */ } };
  let server = null, token = null, pipe = null, seq = 0;
  const conns = new Set(), pending = new Map(), activity = [], clients = new Map(); // clients: name -> { since, calls }
  let calls = 0;
  // TASKS.csv #3932 — 'Allow AI apps to make changes': off by default, only while the server runs, off with it; kept for the next launch (prefs allowChanges) only with 'remember'
  let changesOn = false;
  const changeLock = createChangeLock(); // one change at a time, whichever app asks
  const jobs = createJobs(); // #3937 — the long changes answered "started", checked with job_status (shared by every connection, scoped by app)

  const status = () => ({ enabled: !!server, changes: !!server && changesOn, remember: !!readPrefs().mcp?.remember, clients: [...clients].map(([name, c]) => ({ name, since: c.since, calls: c.calls })), calls, activity: activity.slice(-ACTIVITY_KEPT), allowed: readPrefs().mcp?.allowed || [] });
  const push = () => { try { onStatus(status()); } catch { /* the window is gone */ } };
  const note = (e) => {
    if (e.event === "connected") clients.set(e.client, { since: e.at, calls: 0 });
    else if (e.tool) { calls++; const c = clients.get(e.client); if (c) c.calls++; activity.push({ at: e.at, client: e.client, tool: e.tool, ok: e.ok, rows: e.rows ?? null, bytes: e.bytes || 0, refused: e.refused || null, ...(e.change ? { change: true } : {}) }); if (activity.length > ACTIVITY_KEPT * 2) activity.splice(0, activity.length - ACTIVITY_KEPT); }
    else if (e.event === "refused") activity.push({ at: e.at, client: e.client, tool: null, ok: false, refused: "not allowed" });
    push();
  };

  // a call into the window, answered through respond()
  function callTool(name, args, meta = {}) { // meta: the app's (cleaned) name and whether it is a change tool (#3932: the window sends those to lib/mcpActions.js)
    const win = getWindow();
    if (!win || win.isDestroyed?.()) return Promise.resolve({ ok: false, error: "GeoStrix has no open window to read the project from." });
    return new Promise((resolve) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: "GeoStrix did not answer in time (it may be busy). Try again." }); }, meta.network || meta.long ? NETWORK_CALL_TIMEOUT_MS : CALL_TIMEOUT_MS);
      pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      try { win.webContents.send("mcp-request", { id, name, args, ...(meta.client ? { client: meta.client } : {}), ...(meta.change ? { change: true } : {}) }); } catch { clearTimeout(timer); pending.delete(id); resolve({ ok: false, error: "GeoStrix could not be reached." }); }
    });
  }
  function respond(id, payload) { const f = pending.get(id); if (!f) return false; pending.delete(id); f(payload && typeof payload === "object" ? { ok: !!payload.ok, data: payload.data, rows: payload.rows, error: payload.error } : { ok: false, error: "No answer." }); return true; }

  // #3932 — 'Always allow' is remembered per kind: reading (allowed) and changes (allowedChanges). A remembered reader connecting while changes are on is not asked at
  // connect; it is asked about changes the first time it calls a change tool (opts.again).
  async function ask(client, opts = {}) {
    const p0 = readPrefs().mcp || {}, allowed = p0.allowed || [], allowedChanges = p0.allowedChanges || [];
    if (opts.changes && allowedChanges.includes(client)) return { answer: "always", changes: true };
    if (allowed.includes(client) && !opts.again) return { answer: "always", changes: false };
    const a = await askAllow(client, opts);
    if (a === "always") {
      const p = readPrefs().mcp || {}, add = (list) => [...new Set([...(list || []), client])].slice(-20);
      writePrefs({ mcp: { ...p, allowed: add(p.allowed), ...(opts.changes ? { allowedChanges: add(p.allowedChanges) } : {}) } });
    }
    return { answer: a, changes: !!opts.changes && (a === "once" || a === "always") };
  }

  function onConnection(sock) {
    let authed = false, buf = "", queue = Promise.resolve(), session = null;
    sock.setEncoding("utf8");
    const kill = () => { try { sock.destroy(); } catch { /* gone */ } };
    const timer = setTimeout(() => { if (!authed) { dbg("handshake timeout"); kill(); } }, HANDSHAKE_MS);
    conns.add(sock); dbg("connection");
    sock.on("close", () => { dbg("close"); clearTimeout(timer); conns.delete(sock); const c = session?.client; if (c && ![...conns].some((s) => s !== sock && s._mcpClient === c)) { clients.delete(c); push(); } session?.close(); });
    sock.on("error", (e) => { dbg("error", e.code); kill(); });
    sock.on("end", () => { dbg("client ended"); queue.then(() => { try { sock.end(); } catch { /* gone */ } }); });
    sock.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_LINE) return kill();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
        if (!authed) {
          const want = `GEOSTRIX-MCP ${token}`, a = Buffer.from(line), b = Buffer.from(want);
          if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { dbg("bad token", a.length, b.length); return kill(); }
          dbg("authenticated");
          authed = true; clearTimeout(timer);
          session = createSession({ callTool, askAllow: async (c, opts) => { sock._mcpClient = c; return ask(c, opts); }, changesAllowed: () => !!server && changesOn, changeLock, jobs, emit: (line) => { if (!sock.destroyed) sock.write(`${line}\n`); }, ...(askNetwork ? { askNetwork } : {}), ...(isOnline ? { isOnline } : {}), onActivity: note, ...(limits ? { limits } : {}), ...(tools ? { tools } : {}) });
          continue;
        }
        if (!line.trim()) continue;
        dbg("line", line.slice(0, 60));
        queue = queue.then(async () => { const out = await session.handleLine(line); dbg("reply", out ? out.slice(0, 40) : "none"); if (out && !sock.destroyed) sock.write(`${out}\n`); }).catch(() => {});
      }
    });
  }

  function start() {
    if (server) return Promise.resolve({ ok: true, pipe });
    return new Promise((resolve) => {
      try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        token = crypto.randomBytes(32).toString("hex");
        const id = crypto.randomBytes(6).toString("hex");
        pipe = platform === "win32" ? `\\\\.\\pipe\\geostrix-mcp-${id}` : path.join(dir, `mcp-${id}.sock`);
        const s = net.createServer({ allowHalfOpen: true }, onConnection); // a client that has sent its last line and ended is still answered
        s.once("error", (e) => { server = null; resolve({ ok: false, error: `Could not start: ${e.code || e.message}` }); });
        s.listen(pipe, () => {
          server = s;
          try { if (platform !== "win32") fs.chmodSync(pipe, 0o600); } catch { /* the folder is already user-only */ }
          fs.writeFileSync(endpointFile, JSON.stringify({ pipe, token, pid: process.pid }), { mode: 0o600 });
          push(); resolve({ ok: true, pipe });
        });
      } catch (e) { server = null; resolve({ ok: false, error: e.message }); }
    });
  }
  function stop() {
    for (const s of [...conns]) { try { s.destroy(); } catch { /* gone */ } }
    conns.clear(); clients.clear();
    for (const [, f] of pending) f({ ok: false, error: "Stopped." }); pending.clear();
    const s = server; server = null; token = null; changesOn = false;
    try { s?.close(); } catch { /* closed */ }
    try { fs.rmSync(endpointFile, { force: true }); if (pipe && platform !== "win32") fs.rmSync(pipe, { force: true }); } catch { /* gone */ }
    pipe = null; push();
    return { ok: true };
  }
  // the switch: remembered across launches only when 'remember' is ticked
  async function setEnabled(on, remember) {
    const p = readPrefs().mcp || {};
    if (!on) changesOn = false; // #3932 — the changes switch goes off with access
    writePrefs({ mcp: { ...p, remember: !!remember, enabled: !!on && !!remember, allowChanges: !!on && !!remember && changesOn } });
    return on ? start() : stop();
  }
  // #3932 — the changes switch; only while AI App Access is on
  function setChanges(on) {
    if (!server) { changesOn = false; return { ok: false, error: "AI App Access is off." }; }
    changesOn = !!on;
    const p = readPrefs().mcp || {};
    writePrefs({ mcp: { ...p, allowChanges: changesOn && !!p.remember } });
    push();
    return { ok: true, changes: changesOn };
  }
  // at launch: on again only if it was left on with 'remember' (and the changes switch with it)
  const resumeIfRemembered = async () => {
    const p = readPrefs().mcp;
    if (!(p?.remember && p?.enabled)) return { ok: true, off: true };
    const r = await start();
    if (r.ok && p.allowChanges) { changesOn = true; push(); }
    return r;
  };
  // TASKS.csv #3992 — the window that was asked reloaded, navigated away, crashed or closed: it can no longer answer the calls waiting on it, so each fails at once with a plain line
  // (instead of holding the one-change-at-a-time lock until the call's own 10 minutes ran out). What a change had already done in that window is not known here, so the line says so.
  const LOST = { reloaded: "was reloaded", crashed: "stopped working", closed: "was closed" };
  function windowLost(reason = "reloaded") {
    const n = pending.size; if (!n) return 0;
    const error = `GeoStrix's window ${LOST[reason] || LOST.reloaded} before it answered, so this call cannot say whether it finished: check the project in GeoStrix.`;
    for (const [id, f] of [...pending]) { pending.delete(id); f({ ok: false, error }); }
    return n;
  }
  const forgetClients = () => { const p = readPrefs().mcp || {}; writePrefs({ mcp: { ...p, allowed: [], allowedChanges: [] } }); push(); return { ok: true }; };
  return { start, stop, setEnabled, setChanges, resumeIfRemembered, forgetClients, status, respond, callTool, windowLost, _endpointFile: endpointFile };
}

module.exports = { createHost, HANDSHAKE_MS, CALL_TIMEOUT_MS };
