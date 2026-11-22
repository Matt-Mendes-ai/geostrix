"use strict";
// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — GeoStrix as a Model Context Protocol server: the read-only protocol part, with no Electron in it so a test can drive it.
// MCP over stdio is newline-delimited JSON-RPC 2.0; this answers initialize, ping, tools/list and tools/call (the only capability offered is tools). It is the second place the
// guards are enforced: the arguments are checked against the tool's own schema and refused when they look like a file path or a credential, the number of calls a minute and the size of a
// reply are capped, and what the project's side sends back is scrubbed of credential-like fields and absolute paths before it leaves. The tools themselves (src/lib/mcpTools.js) check the same again.
const TOOLS = require("./mcpToolDefs.json");

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LIMITS = { maxArgBytes: 4000, maxResultBytes: 100000, callsPerMinute: 60, changesPerMinute: 10, changeWaitMs: 30000,
  // TASKS.csv #3937 — a change that takes longer than asyncAfterMs is answered at once with "started" and a job id (job_status checks it); an app that sent a progressToken
  // gets a notifications/progress every progressEveryMs meanwhile; the last jobsKept jobs are remembered
  asyncAfterMs: 20000, progressEveryMs: 5000, jobsKept: 20 };
// TASKS.csv #3932 (Matt's decision, 2026-11-21) — change tools: a tool whose MCP annotations say readOnlyHint: false makes a change in GeoStrix (through the store, one Undo step).
// They are always listed, but refused HERE, before the window sees them, unless the user has ticked 'Allow AI apps to make changes' (Tools > AI App Access; off by default, off with
// AI App Access); each AI app is asked once more about changes, they are capped at 10 a minute and only one runs at a time (across every connected app).
const isChangeTool = (def) => def?.annotations?.readOnlyHint === false;
// a change tool that downloads (MCP openWorldHint): asked for in a native box every time (askNetwork), refused offline
const isNetworkTool = (def) => isChangeTool(def) && def?.annotations?.openWorldHint === true;
const CHANGES_OFF = "Changes are switched off in GeoStrix. To allow them: Tools › AI App Access › Allow AI apps to make changes.";
// a name that holds a secret (never accepted as an argument, never sent back)
const CREDENTIAL_KEY = /pass(word|wd|phrase)?|secret|token|api[_-]?key|credential|authorization|private[_-]?key|connection[_-]?string|\bpwd\b|safestorage/i;
// something that points at a file or a folder: a drive, a UNC share, an absolute or home path, a parent folder, a file: URL, a %VAR% or $VAR folder
const PATH_LIKE = /^[a-zA-Z]:[\\/]|^\\\\|^\/(?!\/)|(^|[\\/])\.\.([\\/]|$)|^file:|^~[\\/]|%[a-z_]+%|\$\{?[a-z_]+\}?[\\/]/i;
// an absolute path inside a longer text (a collar comment, a project note): the well-known roots only
const PATH_IN_TEXT = /([a-zA-Z]:[\\/]|\\\\[^\s\\]+\\)[^\s"',;]+|\/(Users|home|var|etc|tmp|mnt|opt|root|private)\/[^\s"',;]+/g;

const rpcError = (id, code, message, data) => JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id, result) => JSON.stringify({ jsonrpc: "2.0", id, result });
const toolDef = (name, tools = TOOLS) => tools.find((t) => t.name === name) || null;

// one value against its schema, strictly: text (with an optional enum), numbers, true / false, a list of texts, and (#3932) a small object of such values
// with no other keys. -> null or why it is refused ('must be text' ...)
function badValue(p, v, depth = 0) {
  if (!p || typeof p !== "object") return "is not accepted";
  if (p.type === "string") {
    if (typeof v !== "string") return "must be text";
    if (p.maxLength != null && v.length > p.maxLength) return `is too long (at most ${p.maxLength} characters)`;
    if (p.minLength != null && v.length < p.minLength) return "is empty";
    if (Array.isArray(p.enum) && !p.enum.includes(v)) return `must be one of: ${p.enum.join(", ")}`;
    return null;
  }
  if (p.type === "integer" || p.type === "number") {
    if (typeof v !== "number" || !Number.isFinite(v)) return "must be a number";
    if (p.type === "integer" && !Number.isInteger(v)) return "must be a whole number";
    if (p.minimum != null && v < p.minimum) return `must be at least ${p.minimum}`;
    if (p.maximum != null && v > p.maximum) return `must be at most ${p.maximum}`;
    return null;
  }
  if (p.type === "boolean") return typeof v === "boolean" ? null : "must be true or false";
  if (p.type === "array") {
    if (!Array.isArray(v)) return "must be a list";
    if (p.maxItems != null && v.length > p.maxItems) return `has too many items (at most ${p.maxItems})`;
    for (const x of v) { if (typeof x !== "string" || (p.items?.maxLength != null && x.length > p.items.maxLength) || (p.items?.minLength != null && x.length < p.items.minLength) || (Array.isArray(p.items?.enum) && !p.items.enum.includes(x))) return "must be a list of short texts"; }
    return null;
  }
  if (p.type === "object" && depth < 1) { // one level only (make_section's { x, y })
    if (!v || typeof v !== "object" || Array.isArray(v)) return "must be an object";
    const props = p.properties || {};
    for (const k of Object.keys(v)) if (!(k in props)) return `has an unknown field '${k}'`;
    for (const r of p.required || []) if (v[r] === undefined) return `needs '${r}'`;
    for (const [k, x] of Object.entries(v)) { const why = badValue(props[k], x, depth + 1); if (why) return `.${k} ${why}`; }
    return null;
  }
  return "is not accepted";
}

// -> null when the arguments are acceptable, else { code: 'credential' | 'path' | 'schema', message }
function refuseArgs(tool, args) {
  const def = typeof tool === "string" ? toolDef(tool) : tool;
  if (!def) return { code: "schema", message: "Unknown tool." };
  if (args == null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return { code: "schema", message: "The arguments must be an object." };
  let bytes = 0; try { bytes = Buffer.byteLength(JSON.stringify(args)); } catch { return { code: "schema", message: "The arguments cannot be read." }; }
  if (bytes > LIMITS.maxArgBytes) return { code: "schema", message: `The arguments are too large (${bytes} bytes; the limit is ${LIMITS.maxArgBytes}).` };
  const seen = []; // every key and string, at any depth
  const walk = (v, depth) => { if (depth > 4) return; if (typeof v === "string") seen.push(["", v]); else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { seen.push([k, null]); walk(x, depth + 1); } };
  walk(args, 0);
  for (const [k] of seen) if (k && CREDENTIAL_KEY.test(k)) return { code: "credential", message: `GeoStrix never accepts credentials ('${k}'). No password, token or key is needed to read the project.` };
  for (const [, s] of seen) if (s != null && PATH_LIKE.test(s)) return { code: "path", message: "File paths are never accepted: the tools take hole ids, element symbols, layer keys and section names, and read only the open project." };
  const props = def.inputSchema?.properties || {};
  for (const k of Object.keys(args)) if (!(k in props)) return { code: "schema", message: `Unknown argument '${k}'.` };
  for (const r of def.inputSchema?.required || []) if (args[r] === undefined) return { code: "schema", message: `'${r}' is required.` };
  for (const [k, v] of Object.entries(args)) {
    const why = badValue(props[k], v);
    if (why) return { code: "schema", message: why.startsWith(".") ? `'${k}${why}.` : `'${k}' ${why}.` };
  }
  return null;
}

// a value from the project's side, without credential-like fields or absolute paths. -> { value, removed }
function scrub(value) {
  let removed = 0;
  const go = (v, depth) => {
    if (depth > 12) return null;
    if (typeof v === "string") { const s = v.replace(PATH_IN_TEXT, () => { removed++; return "[path removed]"; }); return s; }
    if (Array.isArray(v)) return v.map((x) => go(x, depth + 1));
    if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) { if (CREDENTIAL_KEY.test(k)) { removed++; continue; } o[k] = go(x, depth + 1); } return o; }
    return v;
  };
  return { value: go(value, 0), removed };
}

// The reply text, or an error text when it is too large
function capText(data, maxBytes = LIMITS.maxResultBytes) {
  let text; try { text = JSON.stringify(data); } catch { return { ok: false, text: "The result could not be written as text." }; }
  const bytes = Buffer.byteLength(text);
  if (bytes > maxBytes) return { ok: false, bytes, text: `The result is too large (${bytes} bytes; the limit is ${maxBytes}). Ask for fewer rows ('limit'), a later page ('offset') or a narrower filter.` };
  return { ok: true, bytes, text };
}

const cleanClientName = (n) => String(n ?? "").replace(/[^\p{L}\p{N} ._\-()]/gu, "").trim().slice(0, 60) || "An AI app";

// #3932 — one change at a time across every connection: run(fn) waits behind the change before it, and gives up (-> { waited: true }) when that one takes longer than waitMs
function createChangeLock() {
  let tail = Promise.resolve();
  return {
    run(fn, waitMs) {
      const prev = tail; let release; const mine = new Promise((r) => { release = r; }); tail = prev.then(() => mine);
      return new Promise((resolve) => {
        let started = false, gaveUp = false;
        const timer = setTimeout(() => { if (!started) { gaveUp = true; resolve({ waited: true }); } }, waitMs);
        prev.then(async () => {
          if (gaveUp) return release();
          started = true; clearTimeout(timer);
          try { resolve({ value: await fn() }); } catch (e) { resolve({ error: e }); } finally { release(); }
        });
      });
    },
  };
}

// TASKS.csv #3937 — the long changes (a download, later a model run) outlast an AI app's own request timeout, so a change still running after asyncAfterMs is answered at once
// ("started", a job id) and the app checks on it with job_status. The registry belongs to the host (shared by every connection) and is scoped by the app's name: an app sees only its own jobs.
function createJobs({ now = Date.now, kept = LIMITS.jobsKept } = {}) {
  const list = []; let n = 0;
  return {
    create(tool, client) { const j = { id: `job-${++n}-${Math.random().toString(16).slice(2, 6)}`, tool, client, state: "queued", startedAt: now(), finishedAt: null, text: null }; list.push(j); while (list.length > kept) list.shift(); return j; },
    finish(j, settled) { j.state = settled.isError ? "failed" : "done"; j.finishedAt = now(); j.text = settled.text; },
    get(id, client) { return list.find((j) => j.id === id && j.client === client) || null; },
    mine(client) { return list.filter((j) => j.client === client); },
    view(j) { const text = j.text; let result; if (j.state === "done") { try { result = JSON.parse(text); } catch { result = text; } } return { job_id: j.id, tool: j.tool, state: j.state, seconds: Math.round(((j.finishedAt ?? now()) - j.startedAt) / 1000), ...(j.state === "done" ? { result } : {}), ...(j.state === "failed" ? { error: text } : {}) }; },
  };
}

// One connection. callTool(name, args, { client, change }) -> Promise<{ ok, data } | { ok: false, error }> (the open project's side);
// askAllow(clientName, { changes, again }) -> Promise<'once' | 'always' | 'refuse' | { answer, changes }> ('changes': the question said the app may also make changes;
// 'again': an app already reading asks for changes; the object form says whether a remembered app is also remembered for changes);
// changesAllowed() -> whether 'Allow AI apps to make changes' is on (#3932); onActivity(entry) is told of each call (tool, ok, bytes, refused) and of the client that connected.
// askNetwork(clientName, toolName) -> Promise<boolean> (#3932: the download question; false = no), isOnline() -> boolean
// jobs: the host's registry (createJobs) and emit(line): writes a server-to-app line (a progress notification) to this connection (#3937)
function createSession({ callTool, askAllow, changesAllowed = () => false, changeLock = createChangeLock(), askNetwork = async () => false, isOnline = () => true, tools = TOOLS, onActivity = () => {}, now = Date.now, limits = LIMITS, jobs = createJobs({ now }), emit = null }) {
  let client = null, allowed = false, closed = false, changesOk = false;
  const stamps = [], changeStamps = [];
  const L = { ...LIMITS, ...limits };
  const hasChanges = tools.some(isChangeTool);
  const answerOf = (a) => (a && typeof a === "object" ? a.answer : a);
  const log = (e) => { try { onActivity({ at: now(), client, ...e }); } catch { /* the list is for the user only */ } };
  async function handleLine(line) {
    if (closed) return null;
    let msg; try { msg = JSON.parse(line); } catch { return rpcError(null, -32700, "Parse error"); }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return msg && msg.id !== undefined ? rpcError(msg.id, -32600, "Invalid request") : rpcError(null, -32600, "Invalid request");
    const { id, method, params } = msg, isNote = id === undefined;
    if (method === "initialize") {
      client = cleanClientName(params?.clientInfo?.name);
      const withChanges = hasChanges && !!changesAllowed();
      const a = await askAllow(client, { changes: withChanges });
      const answer = answerOf(a);
      if (answer !== "once" && answer !== "always") { closed = true; log({ event: "refused" }); return rpcError(id, -32000, "The user did not allow this AI app to read the project."); }
      allowed = true; changesOk = withChanges && (a && typeof a === "object" ? !!a.changes : true); log({ event: "connected", always: answer === "always" });
      const asked = params?.protocolVersion;
      const instructions = hasChanges
        ? "Access to the project open in GeoStrix. Start with project_summary. Results are capped and paged; ask for the next page with 'offset'. The tools whose description begins 'Makes a change in GeoStrix' work only while the user has switched on 'Allow AI apps to make changes' in GeoStrix; each change shows in GeoStrix and is one step of Undo, and none deletes or overwrites anything."
        : "Read-only access to the project open in GeoStrix. Start with project_summary. Results are capped and paged; ask for the next page with 'offset'.";
      return rpcResult(id, { protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "geostrix", title: "GeoStrix", version: "1" }, instructions });
    }
    if (isNote) return null; // notifications/initialized, notifications/cancelled ...
    if (method === "ping") return rpcResult(id, {});
    if (!allowed) return rpcError(id, -32002, "Not initialized");
    if (method === "tools/list") return rpcResult(id, { tools });
    if (method === "tools/call") {
      const name = params?.name;
      const def = typeof name === "string" ? toolDef(name, tools) : null;
      if (!def) { log({ tool: String(name).slice(0, 40), ok: false, refused: "unknown tool" }); return rpcError(id, -32602, `Unknown tool: ${String(name).slice(0, 40)}`); }
      const change = isChangeTool(def), refuse = (code, text) => { log({ tool: name, ok: false, refused: code, ...(change ? { change } : {}) }); return rpcResult(id, { content: [{ type: "text", text }], isError: true }); };
      if (change && !changesAllowed()) return refuse("changes off", CHANGES_OFF); // #3932 — never reaches the window
      const why = refuseArgs(def, params?.arguments);
      if (why) return refuse(why.code, why.message);
      const t = now(); while (stamps.length && t - stamps[0] > 60000) stamps.shift();
      if (stamps.length >= L.callsPerMinute) return refuse("rate", `Too many calls: at most ${L.callsPerMinute} a minute. Wait a little and ask for larger pages instead.`);
      if (change) {
        while (changeStamps.length && t - changeStamps[0] > 60000) changeStamps.shift();
        if (changeStamps.length >= L.changesPerMinute) return refuse("rate", `Too many changes: at most ${L.changesPerMinute} a minute. Wait a little.`);
        if (!changesOk) { // an app allowed to read (or remembered) before the switch was on is asked once about changes
          const answer = answerOf(await askAllow(client, { changes: true, again: true }));
          if (answer !== "once" && answer !== "always") return refuse("not allowed", "The user did not allow this AI app to make changes in GeoStrix.");
          changesOk = true;
          if (!changesAllowed()) return refuse("changes off", CHANGES_OFF); // switched off while the question was up
        }
        changeStamps.push(t);
        if (isNetworkTool(def)) { // #3932 — every download is asked for in GeoStrix, before anything goes out; no 'always'
          let online = true; try { online = isOnline() !== false; } catch { /* assume so: the fetch says otherwise */ }
          if (!online) return refuse("offline", "No internet connection.");
          let yes = false; try { yes = (await askNetwork(client, name)) === true; } catch { yes = false; }
          if (!yes) return refuse("declined", "The user declined the download in GeoStrix.");
          if (!changesAllowed()) return refuse("changes off", CHANGES_OFF);
        }
      }
      stamps.push(t);
      if (name === "job_status") { // #3937 — answered here: the registry is the host's, the window knows nothing of it
        const want = params?.arguments?.job_id, j = want ? jobs.get(want, client) : null;
        if (want && !j) { log({ tool: name, ok: false, refused: "error" }); return rpcResult(id, { content: [{ type: "text", text: `No job '${String(want).slice(0, 40)}' for this app: GeoStrix remembers the last ${LIMITS.jobsKept}.` }], isError: true }); }
        const out = j ? jobs.view(j) : { jobs: jobs.mine(client).slice(-5).map((x) => jobs.view(x)) };
        const capped = capText(scrub(out).value, L.maxResultBytes);
        log({ tool: name, ok: capped.ok, bytes: capped.bytes || 0, refused: capped.ok ? undefined : "size" });
        return rpcResult(id, { content: [{ type: "text", text: capped.text }], isError: !capped.ok });
      }
      const run = async () => { try { return await callTool(name, params?.arguments || {}, change ? { client, change, ...(isNetworkTool(def) ? { network: true } : {}) } : { client }); } catch { return { ok: false, error: change ? "The change could not be made." : "The tool could not read the project." }; } }; // what failed inside the app (a stack, a path) is not passed on
      // what the window answered, as the reply's text (and the activity entry); a change that was answered "started" settles the same way, later
      const settle = (r, waited = false) => {
        if (waited) { log({ tool: name, ok: false, refused: "busy", change }); return { text: "Another change is still running in GeoStrix. Try again in a moment.", isError: true }; }
        if (!r?.ok) { log({ tool: name, ok: false, refused: "error", ...(change ? { change } : {}) }); return { text: scrub(String(r?.error || "The tool failed.").slice(0, 400)).value, isError: true }; }
        const { value, removed } = scrub(r.data);
        const capped = capText(value, L.maxResultBytes);
        log({ tool: name, ok: capped.ok, bytes: capped.bytes || 0, rows: r.rows ?? null, scrubbed: removed || undefined, refused: capped.ok ? undefined : "size", ...(change ? { change } : {}) });
        return { text: capped.text, isError: !capped.ok };
      };
      const reply = (s) => rpcResult(id, { content: [{ type: "text", text: s.text }], isError: s.isError });
      if (!change) return reply(settle(await run()));
      // #3937 — a change runs in the background of this call: answered when it is done, or at once ("started") when it takes longer than asyncAfterMs
      const job = jobs.create(name, client);
      const lockP = changeLock.run(async () => { job.state = "running"; return run(); }, L.changeWaitMs).then((out) => { const s = out.waited ? settle(null, true) : settle(out.value); jobs.finish(job, s); return s; });
      const rawTok = params?._meta?.progressToken, tok = (typeof rawTok === "string" && rawTok.length <= 64) || (typeof rawTok === "number" && Number.isFinite(rawTok)) ? rawTok : undefined;
      let ticks = 0, tick = null, deadline = null;
      if (emit && tok !== undefined) tick = setInterval(() => { try { emit(JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: tok, progress: ++ticks, message: `GeoStrix is working on it (${Math.round((ticks * L.progressEveryMs) / 1000)} s)…` } })); } catch { /* the connection is gone */ } }, L.progressEveryMs);
      const first = await Promise.race([lockP, new Promise((res) => { deadline = setTimeout(() => res(null), L.asyncAfterMs); })]);
      clearTimeout(deadline); if (tick) clearInterval(tick);
      if (first) return reply(first);
      return reply({ isError: false, text: JSON.stringify({ status: "started", job_id: job.id, tool: name, message: "Started: GeoStrix shows when it's done. Check on it with job_status." }) });
    }
    return rpcError(id, -32601, `Method not found: ${method.slice(0, 40)}`);
  }
  return { handleLine, get client() { return client; }, close: () => { closed = true; } };
}

module.exports = { createJobs, TOOLS, SUPPORTED, LIMITS, CREDENTIAL_KEY, PATH_LIKE, CHANGES_OFF, isChangeTool, isNetworkTool, refuseArgs, scrub, capText, createSession, createChangeLock, cleanClientName, toolDef };
