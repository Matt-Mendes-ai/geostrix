// TASKS.csv #3932 (Matt's decision, 2026-11-21) — AI apps that make changes, commit 1: the gate. Change tools (MCP annotations readOnlyHint: false) are always listed but refused in the
// main process while 'Allow AI apps to make changes' is off; each app is asked about changes once more; 10 changes a minute; one change at a time across apps; the schema guard takes
// true / false, a fixed list of words and a small { x, y } object. The tool list here is made up (the real change tools come in later commits); no project data at all.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const { createHost } = require("../electron/mcpHost.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const POINT = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false };
const READ_TOOL = { name: "peek", description: "Read-only. A test tool.", inputSchema: { type: "object", properties: {}, additionalProperties: false } };
const CHANGE_TOOL = {
  name: "poke", description: "Makes a change in GeoStrix: a test tool.", annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: { type: "object", properties: { by: { type: "string", enum: ["element", "none"] }, on: { type: "boolean" }, from: POINT, keys: { type: "array", maxItems: 3, items: { type: "string", maxLength: 8 } } }, required: ["by"], additionalProperties: false },
};
const TOOLS = [READ_TOOL, CHANGE_TOOL];
const rpc = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const parse = (t) => JSON.parse(t);
const init = (s, name = "Claude Desktop") => s.handleLine(rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name }, capabilities: {} }));
const callLine = (id, name, args) => rpc(id, "tools/call", { name, arguments: args });

function session({ on = false, answers = [], lock, limits, slow = 0 } = {}) {
  const state = { on, asked: [], calls: [], activity: [] };
  const s = proto.createSession({
    tools: TOOLS, limits, ...(lock ? { changeLock: lock } : {}),
    changesAllowed: () => state.on,
    askAllow: async (c, opts) => { state.asked.push({ c, ...opts }); return answers.length ? answers.shift() : "once"; },
    callTool: async (n, a) => { state.calls.push([n, a]); if (slow) await new Promise((r) => setTimeout(r, slow)); return { ok: true, data: { ok: true, changed: "test" } }; },
    onActivity: (e) => state.activity.push(e),
  });
  return { s, state };
}

test("#3932 the schema guard: true / false, a fixed list of words, a small { x, y } object, all strict", () => {
  const ok = (a) => assert.equal(proto.refuseArgs(CHANGE_TOOL, a), null, JSON.stringify(a));
  const no = (a, re) => { const r = proto.refuseArgs(CHANGE_TOOL, a); assert.ok(r, JSON.stringify(a)); assert.match(r.message, re); };
  ok({ by: "none" }); ok({ by: "element", on: true, from: { x: 1000.5, y: -2 }, keys: ["a", "b"] });
  no({}, /'by' is required/);
  no({ by: "grade" }, /'by' must be one of: element, none/);
  no({ by: "none", on: "yes" }, /'on' must be true or false/);
  no({ by: "none", on: 1 }, /'on' must be true or false/);
  no({ by: "none", from: [1, 2] }, /'from' must be an object/);
  no({ by: "none", from: { x: 1 } }, /'from' needs 'y'/);
  no({ by: "none", from: { x: 1, y: 2, z: 3 } }, /'from' has an unknown field 'z'/);
  no({ by: "none", from: { x: "1", y: 2 } }, /'from\.x must be a number/);
  no({ by: "none", from: { x: 1, y: Infinity } }, /must be a number|cannot be read|from/);
  no({ by: "none", keys: ["a", "b", "c", "d"] }, /too many items/);
  no({ by: "none", from: { x: 1, y: 2, file: "C:\\Users\\x.csv" } }, /File paths are never accepted/); // the path guard looks inside the object too
  no({ by: "none", from: { x: 1, y: 2, api_key: 1 } }, /never accepts credentials/);
  // a schema type the guard does not know is refused, not waved through
  assert.match(proto.refuseArgs({ name: "t", inputSchema: { type: "object", properties: { a: { type: "null" } } } }, { a: null }).message, /'a' is not accepted/);
  // an object inside an object: one level only
  const deep = { name: "t", inputSchema: { type: "object", properties: { a: { type: "object", properties: { b: POINT } } } } };
  assert.match(proto.refuseArgs(deep, { a: { b: { x: 1, y: 2 } } }).message, /not accepted/);
});

test("#3932 with the switch off a change tool is listed but refused before the window, with what to do; reads work", async () => {
  const { s, state } = session({ on: false });
  const i = parse(await init(s));
  assert.match(i.result.instructions, /Makes a change in GeoStrix/); assert.match(i.result.instructions, /Allow AI apps to make changes/);
  assert.equal(state.asked[0].changes, false, "the switch is off: the question is the read-only one");
  const list = parse(await s.handleLine(rpc(2, "tools/list"))).result.tools;
  assert.deepEqual(list.map((t) => t.name), ["peek", "poke"]); assert.equal(list[1].annotations.readOnlyHint, false);
  const r = parse(await s.handleLine(callLine(3, "poke", { by: "none" }))).result;
  assert.equal(r.isError, true); assert.equal(r.content[0].text, proto.CHANGES_OFF);
  assert.equal(proto.CHANGES_OFF, "Changes are switched off in GeoStrix. To allow them: Tools › AI App Access › Allow AI apps to make changes.");
  assert.equal(state.calls.length, 0, "never reached the window");
  assert.deepEqual(state.activity.at(-1), { ...state.activity.at(-1), tool: "poke", ok: false, refused: "changes off", change: true });
  // refused for being off even with bad arguments (the switch is said first)
  assert.equal(parse(await s.handleLine(callLine(4, "poke", { by: "C:\\x" }))).result.content[0].text, proto.CHANGES_OFF);
  assert.equal(parse(await s.handleLine(callLine(5, "peek", {}))).result.isError, false);
  assert.deepEqual(state.calls.map((c) => c[0]), ["peek"]);
  // the read-only server (no change tool) keeps its old instructions
  const ro = proto.createSession({ tools: proto.TOOLS.filter((t) => !proto.isChangeTool(t)), callTool: async () => ({ ok: true, data: {} }), askAllow: async () => "once" });
  assert.match(parse(await init(ro)).result.instructions, /^Read-only access/);
});

test("#3932 switched on after connecting: the app is asked once more (about changes), then the change runs; a refusal is said plainly", async () => {
  const a = session({ on: false });
  await init(a.s); a.state.on = true;
  const r = parse(await a.s.handleLine(callLine(2, "poke", { by: "element", on: true, from: { x: 1, y: 2 } }))).result;
  assert.equal(r.isError, false); assert.deepEqual(JSON.parse(r.content[0].text), { ok: true, changed: "test" });
  assert.deepEqual(a.state.asked.map((q) => [q.changes, !!q.again]), [[false, false], [true, true]]);
  await a.s.handleLine(callLine(3, "poke", { by: "none" }));
  assert.equal(a.state.asked.length, 2, "asked once, not every change");
  assert.equal(a.state.activity.at(-1).change, true);
  const b = session({ on: false, answers: ["once", "refuse"] });
  await init(b.s); b.state.on = true;
  const no = parse(await b.s.handleLine(callLine(2, "poke", { by: "none" }))).result;
  assert.equal(no.isError, true); assert.equal(no.content[0].text, "The user did not allow this AI app to make changes in GeoStrix.");
  assert.equal(b.state.calls.length, 0);
  assert.equal(parse(await b.s.handleLine(callLine(3, "peek", {}))).result.isError, false, "reading still works");
  // on when it connects: one question that says so, and no second one
  const c = session({ on: true });
  await init(c.s);
  assert.equal(c.state.asked[0].changes, true);
  await c.s.handleLine(callLine(2, "poke", { by: "none" }));
  assert.equal(c.state.asked.length, 1); assert.equal(c.state.calls.length, 1);
  // switched off again: refused at once
  c.state.on = false;
  assert.equal(parse(await c.s.handleLine(callLine(3, "poke", { by: "none" }))).result.content[0].text, proto.CHANGES_OFF);
});

test("#3932 at most 10 changes a minute (reads keep their 60); one change at a time across apps, and a wait over the limit is refused", async () => {
  let t = 0;
  const st = { calls: 0 };
  const s = proto.createSession({ tools: TOOLS, now: () => t, changesAllowed: () => true, askAllow: async () => "once", callTool: async () => { st.calls++; return { ok: true, data: {} }; } });
  await init(s);
  for (let i = 0; i < 10; i++) assert.equal(parse(await s.handleLine(callLine(10 + i, "poke", { by: "none" }))).result.isError, false);
  const over = parse(await s.handleLine(callLine(30, "poke", { by: "none" }))).result;
  assert.equal(over.isError, true); assert.match(over.content[0].text, /at most 10 a minute/);
  assert.equal(parse(await s.handleLine(callLine(31, "peek", {}))).result.isError, false, "reads are not held up by the change cap");
  t = 61000;
  assert.equal(parse(await s.handleLine(callLine(32, "poke", { by: "none" }))).result.isError, false, "a minute later");
  assert.equal(st.calls, 12);
  // two apps, one lock: the second change starts only when the first has finished
  const lock = proto.createChangeLock();
  const order = [];
  const mk = (name, ms) => proto.createSession({ tools: TOOLS, changeLock: lock, changesAllowed: () => true, askAllow: async () => "once", callTool: async () => { order.push(`${name} start`); await new Promise((r) => setTimeout(r, ms)); order.push(`${name} end`); return { ok: true, data: {} }; } });
  const one = mk("one", 60), two = mk("two", 1);
  await init(one, "App one"); await init(two, "App two");
  const [r1, r2] = await Promise.all([one.handleLine(callLine(1, "poke", { by: "none" })), two.handleLine(callLine(1, "poke", { by: "none" }))]);
  assert.deepEqual(order, ["one start", "one end", "two start", "two end"]);
  assert.equal(parse(r1).result.isError, false); assert.equal(parse(r2).result.isError, false);
  // the first takes longer than the wait allowed: the second is refused, and does not run later
  order.length = 0;
  const slow = mk("slow", 120), quick = proto.createSession({ tools: TOOLS, changeLock: lock, limits: { changeWaitMs: 30 }, changesAllowed: () => true, askAllow: async () => "once", callTool: async () => { order.push("quick ran"); return { ok: true, data: {} }; } });
  await init(slow, "App slow"); await init(quick, "App quick");
  const [rs, rq] = await Promise.all([slow.handleLine(callLine(1, "poke", { by: "none" })), quick.handleLine(callLine(1, "poke", { by: "none" }))]);
  assert.equal(parse(rs).result.isError, false);
  assert.equal(parse(rq).result.content[0].text, "Another change is still running in GeoStrix. Try again in a moment.");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(order, ["slow start", "slow end"], "the refused change never ran");
  // the lock is free again afterwards
  const after = mk("after", 1); await init(after, "App after");
  assert.equal(parse(await after.handleLine(callLine(1, "poke", { by: "none" }))).result.isError, false);
  // a change that fails inside the app says so without the inside story
  const bad = proto.createSession({ tools: TOOLS, changesAllowed: () => true, askAllow: async () => "once", callTool: async () => { throw new Error("at C:\\secret\\stack.js"); } });
  await init(bad);
  const e = parse(await bad.handleLine(callLine(1, "poke", { by: "none" }))).result;
  assert.equal(e.isError, true); assert.equal(e.content[0].text, "The change could not be made.");
});

// ---- the host on a real pipe
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "gx-mcp3932-")); }
const hosts = []; // stopped at the end whatever happened, so a failing check cannot leave a pipe open (and the run hanging)
test.after(() => { for (const h of hosts) { try { h.stop(); } catch { /* stopped */ } } });
function makeHost(userDataDir, { answers = [], prefs = {} } = {}) {
  const store = { mcp: prefs.mcp }; const asked = []; const sent = [];
  let host;
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => { sent.push([ch, msg]); if (ch === "mcp-request") setImmediate(() => host.respond(msg.id, { ok: true, data: { ok: true, changed: msg.name } })); } } };
  hosts.push(host = createHost({ userDataDir, tools: TOOLS, getWindow: () => win, askAllow: async (c, opts) => { asked.push({ c, ...opts }); return answers.length ? answers.shift() : "once"; }, readPrefs: () => store, writePrefs: (p) => Object.assign(store, p) }));
  return { host, store, asked, sent };
}
const lineClient = (pipe, hello) => new Promise((resolve, reject) => {
  const sock = net.connect(pipe); let buf = ""; const waiters = [];
  sock.setEncoding("utf8");
  sock.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiters.shift()?.(l); } });
  sock.on("connect", () => { if (hello) sock.write(`${hello}\n`); resolve({ sock, ask: (msg) => new Promise((res) => { waiters.push(res); sock.write(`${msg}\n`); }), closed: new Promise((r) => sock.on("close", r)) }); });
  sock.on("error", reject);
});
const connect = async (host) => { const ep = JSON.parse(fs.readFileSync(host._endpointFile, "utf8")); return lineClient(ep.pipe, `GEOSTRIX-MCP ${ep.token}`); };

test("#3932 the host: the changes switch works only while access is on, goes off with it, and is kept for the next launch only with 'remember'", async () => {
  const dir = tempDir();
  const a = makeHost(dir);
  assert.deepEqual(a.host.setChanges(true), { ok: false, error: "AI App Access is off." });
  assert.equal(a.host.status().changes, false);
  await a.host.setEnabled(true, false);
  assert.equal(a.host.status().changes, false, "off by default");
  assert.deepEqual(a.host.setChanges(true), { ok: true, changes: true });
  assert.equal(a.host.status().changes, true); assert.equal(a.store.mcp.allowChanges, false, "not remembered without 'remember'");
  // a change reaches the window only while it is on
  const c = await connect(a.host);
  await c.ask(rpc(1, "initialize", { clientInfo: { name: "Claude Desktop" } }));
  assert.equal(a.asked[0].changes, true);
  const ok = parse(await c.ask(callLine(2, "poke", { by: "none" }))).result;
  assert.equal(ok.isError, false); assert.equal(a.sent.filter(([ch]) => ch === "mcp-request").length, 1);
  assert.equal(a.host.status().activity.at(-1).change, true);
  a.host.setChanges(false);
  assert.equal(parse(await c.ask(callLine(3, "poke", { by: "none" }))).result.content[0].text, proto.CHANGES_OFF);
  assert.equal(a.sent.filter(([ch]) => ch === "mcp-request").length, 1, "the refused one never reached the window");
  // switching access off turns changes off; switching it on again starts with changes off
  a.host.setChanges(true);
  await a.host.setEnabled(false, false); await c.closed;
  assert.equal(a.host.status().changes, false);
  await a.host.setEnabled(true, false);
  assert.equal(a.host.status().changes, false, "on again: changes start off");
  a.host.stop();
  // with 'remember': kept, and on again at the next launch; changing 'remember' while on keeps the switch as it is
  const b = makeHost(dir);
  await b.host.setEnabled(true, true); b.host.setChanges(true);
  assert.deepEqual([b.store.mcp.enabled, b.store.mcp.allowChanges], [true, true]);
  await b.host.setEnabled(true, false);
  assert.deepEqual([b.store.mcp.enabled, b.store.mcp.allowChanges, b.host.status().changes], [false, false, true]);
  await b.host.setEnabled(true, true);
  assert.equal(b.store.mcp.allowChanges, true);
  b.host.stop();
  assert.equal(b.store.mcp.allowChanges, true, "quitting (stop) does not forget the remembered switch");
  const next = makeHost(dir, { prefs: { mcp: b.store.mcp } });
  await next.host.resumeIfRemembered();
  assert.deepEqual([next.host.status().enabled, next.host.status().changes], [true, true]);
  next.host.stop();
  const noChanges = makeHost(dir, { prefs: { mcp: { remember: true, enabled: true, allowChanges: false } } });
  await noChanges.host.resumeIfRemembered();
  assert.deepEqual([noChanges.host.status().enabled, noChanges.host.status().changes], [true, false]);
  noChanges.host.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("#3932 the host: 'always allow' is kept per kind; an app always allowed to read is asked about changes on its first change, not at connect", async () => {
  const dir = tempDir();
  const a = makeHost(dir, { answers: ["always"], prefs: { mcp: { allowed: ["Claude Desktop"] } } });
  await a.host.setEnabled(true, false); a.host.setChanges(true);
  const c = await connect(a.host);
  assert.match(await c.ask(rpc(1, "initialize", { clientInfo: { name: "Claude Desktop" } })), /"result"/);
  assert.equal(a.asked.length, 0, "a remembered reader is not asked at connect");
  assert.equal(parse(await c.ask(callLine(2, "peek", {}))).result.isError, false);
  assert.equal(a.asked.length, 0);
  assert.equal(parse(await c.ask(callLine(3, "poke", { by: "none" }))).result.isError, false);
  assert.deepEqual(a.asked.map((q) => [q.c, q.changes, q.again]), [["Claude Desktop", true, true]]);
  assert.deepEqual(a.store.mcp.allowedChanges, ["Claude Desktop"]);
  a.host.stop(); await c.closed;
  // next time: remembered for changes too, no question at all
  const b = makeHost(dir, { answers: ["refuse"], prefs: { mcp: a.store.mcp } });
  await b.host.setEnabled(true, false); b.host.setChanges(true);
  const c2 = await connect(b.host);
  await c2.ask(rpc(1, "initialize", { clientInfo: { name: "Claude Desktop" } }));
  assert.equal(parse(await c2.ask(callLine(2, "poke", { by: "none" }))).result.isError, false);
  assert.equal(b.asked.length, 0);
  // Forget clears both kinds
  b.host.forgetClients();
  assert.deepEqual([b.store.mcp.allowed, b.store.mcp.allowedChanges], [[], []]);
  b.host.stop(); await c2.closed;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("#3932 wiring: the IPC from the main window only, the bridge, the second switch disabled while access is off, the status bar, the three native questions", () => {
  const main = read("../electron/main.js"), pre = read("../electron/preload.js"), desk = read("../src/lib/desktop.js"), modal = read("../src/components/AiAccessModal.jsx"), app = read("../src/App.jsx");
  assert.match(main, /ipcMain\.handle\("mcp-set-changes", \(e, req\) => \(fromMainWindow\(e\) \? mcp\(\)\.setChanges\(!!req\?\.on\) : \{ ok: false, error: "Not allowed\." \}\)\)/);
  assert.match(main, /opts\.again \? \[L\("Allow this AI app to make changes in the project\?"\)/);
  assert.match(main, /opts\.changes \? \[L\("Allow an AI app to read this project and make changes in it\?"\)/);
  assert.match(main, /defaultId: 2, cancelId: 2/, "the safe answer stays the default");
  for (const lang of ["es", "pt", "fr", "ar"]) assert.match(main, new RegExp(`\\n  ${lang}: \\{ "GeoStrix Help"[^\\n]*"Allow this AI app to make changes in the project\\?": "[^"]+"[^\\n]*"It can read holes, assays, logs and sections, and it can also colour`), lang);
  assert.match(pre, /mcpSetChanges: \(on\) => ipcRenderer\.invoke\("mcp-set-changes", \{ on \}\)/);
  assert.match(desk, /export const mcpSetChanges = async \(on\) => \(d\?\.mcpSetChanges \? d\.mcpSetChanges\(on\) : NO_MCP\)/);
  assert.match(modal, /checked=\{!!st\?\.changes\} disabled=\{!isDesktop \|\| !on\}/);
  assert.match(modal, /tr\("Allow AI apps to make changes"\)/);
  assert.match(modal, /a\.change \? tr\(" \(change\)"\)/);
  assert.match(app, /ai\.changes \? \(names \? tr\("AI app: \{names\}, can make changes", \{ names \}\) : tr\("AI app access: on, can make changes"\)\)/);
});
