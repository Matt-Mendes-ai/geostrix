"use strict";
// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — GeoStrix as a Model Context Protocol server: the read-only protocol part, with no Electron in it so a test can drive it.
// MCP over stdio is newline-delimited JSON-RPC 2.0; this answers initialize, ping, tools/list and tools/call (the only capability offered is tools). It is the second place the
// guards are enforced: the arguments are checked against the tool's own schema and refused when they look like a file path or a credential, the number of calls a minute and the size of a
// reply are capped, and what the project's side sends back is scrubbed of credential-like fields and absolute paths before it leaves. The tools themselves (src/lib/mcpTools.js) check the same again.
const TOOLS = require("./mcpToolDefs.json");

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LIMITS = { maxArgBytes: 4000, maxResultBytes: 100000, callsPerMinute: 60 };
// a name that holds a secret (never accepted as an argument, never sent back)
const CREDENTIAL_KEY = /pass(word|wd|phrase)?|secret|token|api[_-]?key|credential|authorization|private[_-]?key|connection[_-]?string|\bpwd\b|safestorage/i;
// something that points at a file or a folder: a drive, a UNC share, an absolute or home path, a parent folder, a file: URL, a %VAR% or $VAR folder
const PATH_LIKE = /^[a-zA-Z]:[\\/]|^\\\\|^\/(?!\/)|(^|[\\/])\.\.([\\/]|$)|^file:|^~[\\/]|%[a-z_]+%|\$\{?[a-z_]+\}?[\\/]/i;
// an absolute path inside a longer text (a collar comment, a project note): the well-known roots only
const PATH_IN_TEXT = /([a-zA-Z]:[\\/]|\\\\[^\s\\]+\\)[^\s"',;]+|\/(Users|home|var|etc|tmp|mnt|opt|root|private)\/[^\s"',;]+/g;

const rpcError = (id, code, message, data) => JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id, result) => JSON.stringify({ jsonrpc: "2.0", id, result });
const toolDef = (name) => TOOLS.find((t) => t.name === name) || null;

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
    const p = props[k];
    const bad = (why) => ({ code: "schema", message: `'${k}' ${why}.` });
    if (p.type === "string") { if (typeof v !== "string") return bad("must be text"); if (p.maxLength != null && v.length > p.maxLength) return bad(`is too long (at most ${p.maxLength} characters)`); if (p.minLength != null && v.length < p.minLength) return bad("is empty"); }
    else if (p.type === "integer" || p.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return bad("must be a number");
      if (p.type === "integer" && !Number.isInteger(v)) return bad("must be a whole number");
      if (p.minimum != null && v < p.minimum) return bad(`must be at least ${p.minimum}`);
      if (p.maximum != null && v > p.maximum) return bad(`must be at most ${p.maximum}`);
    } else if (p.type === "array") {
      if (!Array.isArray(v)) return bad("must be a list");
      if (p.maxItems != null && v.length > p.maxItems) return bad(`has too many items (at most ${p.maxItems})`);
      for (const x of v) { if (typeof x !== "string" || (p.items?.maxLength != null && x.length > p.items.maxLength) || (p.items?.minLength != null && x.length < p.items.minLength)) return bad("must be a list of short texts"); }
    }
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

// One connection. callTool(name, args) -> Promise<{ ok, data } | { ok: false, error }> (the open project's side); askAllow(clientName) -> Promise<'once' | 'always' | 'refuse'>;
// onActivity(entry) is told of each call (tool, ok, bytes, refused) and of the client that connected.
function createSession({ callTool, askAllow, onActivity = () => {}, now = Date.now, limits = LIMITS }) {
  let client = null, allowed = false, closed = false;
  const stamps = [];
  const log = (e) => { try { onActivity({ at: now(), client, ...e }); } catch { /* the list is for the user only */ } };
  async function handleLine(line) {
    if (closed) return null;
    let msg; try { msg = JSON.parse(line); } catch { return rpcError(null, -32700, "Parse error"); }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return msg && msg.id !== undefined ? rpcError(msg.id, -32600, "Invalid request") : rpcError(null, -32600, "Invalid request");
    const { id, method, params } = msg, isNote = id === undefined;
    if (method === "initialize") {
      client = cleanClientName(params?.clientInfo?.name);
      const answer = await askAllow(client);
      if (answer !== "once" && answer !== "always") { closed = true; log({ event: "refused" }); return rpcError(id, -32000, "The user did not allow this AI app to read the project."); }
      allowed = true; log({ event: "connected", always: answer === "always" });
      const asked = params?.protocolVersion;
      return rpcResult(id, { protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "geostrix", title: "GeoStrix", version: "1" }, instructions: "Read-only access to the project open in GeoStrix. Start with project_summary. Results are capped and paged; ask for the next page with 'offset'." });
    }
    if (isNote) return null; // notifications/initialized, notifications/cancelled ...
    if (method === "ping") return rpcResult(id, {});
    if (!allowed) return rpcError(id, -32002, "Not initialized");
    if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
    if (method === "tools/call") {
      const name = params?.name;
      const def = typeof name === "string" ? toolDef(name) : null;
      if (!def) { log({ tool: String(name).slice(0, 40), ok: false, refused: "unknown tool" }); return rpcError(id, -32602, `Unknown tool: ${String(name).slice(0, 40)}`); }
      const why = refuseArgs(def, params?.arguments);
      if (why) { log({ tool: name, ok: false, refused: why.code }); return rpcResult(id, { content: [{ type: "text", text: why.message }], isError: true }); }
      const t = now(); while (stamps.length && t - stamps[0] > 60000) stamps.shift();
      if (stamps.length >= limits.callsPerMinute) { log({ tool: name, ok: false, refused: "rate" }); return rpcResult(id, { content: [{ type: "text", text: `Too many calls: at most ${limits.callsPerMinute} a minute. Wait a little and ask for larger pages instead.` }], isError: true }); }
      stamps.push(t);
      let r; try { r = await callTool(name, params?.arguments || {}); } catch { r = { ok: false, error: "The tool could not read the project." }; } // what failed inside the app (a stack, a path) is not passed on
      if (!r?.ok) { log({ tool: name, ok: false, refused: "error" }); return rpcResult(id, { content: [{ type: "text", text: scrub(String(r?.error || "The tool failed.").slice(0, 400)).value }], isError: true }); }
      const { value, removed } = scrub(r.data);
      const capped = capText(value, limits.maxResultBytes);
      log({ tool: name, ok: capped.ok, bytes: capped.bytes || 0, rows: r.rows ?? null, scrubbed: removed || undefined, refused: capped.ok ? undefined : "size" });
      return rpcResult(id, { content: [{ type: "text", text: capped.text }], isError: !capped.ok });
    }
    return rpcError(id, -32601, `Method not found: ${method.slice(0, 40)}`);
  }
  return { handleLine, get client() { return client; }, close: () => { closed = true; } };
}

module.exports = { TOOLS, SUPPORTED, LIMITS, CREDENTIAL_KEY, PATH_LIKE, refuseArgs, scrub, capText, createSession, cleanClientName, toolDef };
