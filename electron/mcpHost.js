"use strict";
// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — the AI-app (Model Context Protocol) server, in the main process, off until the user switches it on in Tools > AI App Access.
//   * Local only: a named pipe (Windows) or a Unix socket in a per-user folder, never a TCP port, so no web page can reach it; every connection starts with a per-launch token, which is
//     written (with the pipe's name) to <userData>/mcp/endpoint.json (user-only file) for the bridge `GeoStrix.exe --mcp-bridge` that an AI app starts, and removed when it is switched off.
//   * Read-only: the project lives in the window's store, so each tool call is sent to the window (mcp-request) and answered by src/lib/mcpTools.js. Nothing here touches a file or the project.
//   * The user is asked the first time an AI app connects (allow once / always allow / don't allow, a native box the window cannot answer), and sees which app is connected and what it called.
// Electron is injected (getWindow, askAllow, prefs), so a test can run the whole thing on a real pipe.
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createSession } = require("./mcpProtocol.js");

const HANDSHAKE_MS = 5000, CALL_TIMEOUT_MS = 30000, MAX_LINE = 64 * 1024, ACTIVITY_KEPT = 60;

function createHost({ userDataDir, getWindow, askAllow, readPrefs, writePrefs, onStatus = () => {}, platform = process.platform, limits }) {
  const dir = path.join(userDataDir, "mcp"), endpointFile = path.join(dir, "endpoint.json");
  let server = null, token = null, pipe = null, seq = 0;
  const conns = new Set(), pending = new Map(), activity = [], clients = new Map(); // clients: name -> { since, calls }
  let calls = 0;

  const status = () => ({ enabled: !!server, remember: !!readPrefs().mcp?.remember, clients: [...clients].map(([name, c]) => ({ name, since: c.since, calls: c.calls })), calls, activity: activity.slice(-ACTIVITY_KEPT), allowed: readPrefs().mcp?.allowed || [] });
  const push = () => { try { onStatus(status()); } catch { /* the window is gone */ } };
  const note = (e) => {
    if (e.event === "connected") clients.set(e.client, { since: e.at, calls: 0 });
    else if (e.tool) { calls++; const c = clients.get(e.client); if (c) c.calls++; activity.push({ at: e.at, client: e.client, tool: e.tool, ok: e.ok, rows: e.rows ?? null, bytes: e.bytes || 0, refused: e.refused || null }); if (activity.length > ACTIVITY_KEPT * 2) activity.splice(0, activity.length - ACTIVITY_KEPT); }
    else if (e.event === "refused") activity.push({ at: e.at, client: e.client, tool: null, ok: false, refused: "not allowed" });
    push();
  };

  // a call into the window, answered through respond()
  function callTool(name, args) {
    const win = getWindow();
    if (!win || win.isDestroyed?.()) return Promise.resolve({ ok: false, error: "GeoStrix has no open window to read the project from." });
    return new Promise((resolve) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: "GeoStrix did not answer in time (it may be busy). Try again." }); }, CALL_TIMEOUT_MS);
      pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      try { win.webContents.send("mcp-request", { id, name, args }); } catch { clearTimeout(timer); pending.delete(id); resolve({ ok: false, error: "GeoStrix could not be reached." }); }
    });
  }
  function respond(id, payload) { const f = pending.get(id); if (!f) return false; pending.delete(id); f(payload && typeof payload === "object" ? { ok: !!payload.ok, data: payload.data, rows: payload.rows, error: payload.error } : { ok: false, error: "No answer." }); return true; }

  async function ask(client) {
    const allowed = readPrefs().mcp?.allowed || [];
    if (allowed.includes(client)) return "always";
    const a = await askAllow(client);
    if (a === "always") { const p = readPrefs().mcp || {}; writePrefs({ mcp: { ...p, allowed: [...new Set([...(p.allowed || []), client])].slice(-20) } }); }
    return a;
  }

  function onConnection(sock) {
    let authed = false, buf = "", queue = Promise.resolve(), session = null;
    sock.setEncoding("utf8");
    const kill = () => { try { sock.destroy(); } catch { /* gone */ } };
    const timer = setTimeout(() => { if (!authed) kill(); }, HANDSHAKE_MS);
    conns.add(sock);
    sock.on("close", () => { clearTimeout(timer); conns.delete(sock); const c = session?.client; if (c && ![...conns].some((s) => s !== sock && s._mcpClient === c)) { clients.delete(c); push(); } session?.close(); });
    sock.on("error", () => kill());
    sock.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_LINE) return kill();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
        if (!authed) {
          const want = `GEOSTRIX-MCP ${token}`, a = Buffer.from(line), b = Buffer.from(want);
          if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return kill();
          authed = true; clearTimeout(timer);
          session = createSession({ callTool, askAllow: async (c) => { sock._mcpClient = c; return ask(c); }, onActivity: note, ...(limits ? { limits } : {}) });
          continue;
        }
        if (!line.trim()) continue;
        queue = queue.then(async () => { const out = await session.handleLine(line); if (out && !sock.destroyed) sock.write(`${out}\n`); }).catch(() => {});
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
        const s = net.createServer(onConnection);
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
    const s = server; server = null; token = null;
    try { s?.close(); } catch { /* closed */ }
    try { fs.rmSync(endpointFile, { force: true }); if (pipe && platform !== "win32") fs.rmSync(pipe, { force: true }); } catch { /* gone */ }
    pipe = null; push();
    return { ok: true };
  }
  // the switch: remembered across launches only when 'remember' is ticked
  async function setEnabled(on, remember) {
    const p = readPrefs().mcp || {};
    writePrefs({ mcp: { ...p, remember: !!remember, enabled: !!on && !!remember } });
    return on ? start() : stop();
  }
  // at launch: on again only if it was left on with 'remember'
  const resumeIfRemembered = () => { const p = readPrefs().mcp; return p?.remember && p?.enabled ? start() : Promise.resolve({ ok: true, off: true }); };
  const forgetClients = () => { const p = readPrefs().mcp || {}; writePrefs({ mcp: { ...p, allowed: [] } }); push(); return { ok: true }; };
  return { start, stop, setEnabled, resumeIfRemembered, forgetClients, status, respond, callTool, _endpointFile: endpointFile };
}

module.exports = { createHost, HANDSHAKE_MS, CALL_TIMEOUT_MS };
