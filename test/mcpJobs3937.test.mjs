// TASKS.csv #3937 (found by side 2 building #3932) — a download can outlast an AI app's own request timeout. A change still running after asyncAfterMs is answered at once
// ("started", a job id), the app checks on it with the read tool job_status, and an app that sent a progressToken is sent notifications/progress meanwhile. A change that is
// quick is answered as before. No network here: the window, the box and the clock are stand-ins.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const { createHost } = require("../electron/mcpHost.js");
const rpc = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const parse = (t) => JSON.parse(t);
const call = (id, name, args = {}, meta) => rpc(id, "tools/call", { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const init = (s, name = "Claude Desktop") => s.handleLine(rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name } }));
const LIM = { ...proto.LIMITS, asyncAfterMs: 40, progressEveryMs: 15, changeWaitMs: 400 };

function session({ run, jobs, emit, limits = LIM } = {}) {
  const calls = [];
  const s = proto.createSession({
    changesAllowed: () => true, askAllow: async () => "once", askNetwork: async () => true, limits, ...(jobs ? { jobs } : {}), ...(emit ? { emit } : {}),
    callTool: async (n, a, meta) => { calls.push(n); return run ? run(n, a, meta) : { ok: true, data: { changed: "raster", name: "S2 2026-11-01" } }; },
  });
  return { s, calls };
}

test("#3937 a quick change is answered as before: the result, no job", async () => {
  const { s } = session();
  await init(s);
  const r = parse(await s.handleLine(call(2, "fetch_terrain"))).result;
  assert.equal(r.isError, false);
  assert.deepEqual(JSON.parse(r.content[0].text), { changed: "raster", name: "S2 2026-11-01" });
  const none = parse(await s.handleLine(call(3, "job_status"))).result;
  assert.equal(none.isError, false);
  assert.equal(JSON.parse(none.content[0].text).jobs[0].state, "done", "even a quick one is in the list");
});

test("#3937 a slow change is answered 'started' with a job id; job_status says running, then done with what it made", async () => {
  let finish; const gate = new Promise((r) => { finish = r; });
  const { s } = session({ run: async () => { await gate; return { ok: true, data: { changed: "terrain", nodes: 13600 } }; } });
  await init(s);
  const t0 = Date.now();
  const r = parse(await s.handleLine(call(2, "fetch_terrain"))).result;
  assert.ok(Date.now() - t0 < 400, "answered at once, not when the download ends");
  assert.equal(r.isError, false);
  const started = JSON.parse(r.content[0].text);
  assert.equal(started.status, "started"); assert.equal(started.tool, "fetch_terrain"); assert.match(started.job_id, /^job-\d+-[0-9a-f]{4}$/);
  assert.match(started.message, /GeoStrix shows when it's done/); assert.match(started.message, /job_status/);
  const running = JSON.parse(parse(await s.handleLine(call(3, "job_status", { job_id: started.job_id }))).result.content[0].text);
  assert.equal(running.state, "running"); assert.equal(running.job_id, started.job_id); assert.equal(running.result, undefined);
  finish(); await sleep(20);
  const done = JSON.parse(parse(await s.handleLine(call(4, "job_status", { job_id: started.job_id }))).result.content[0].text);
  assert.equal(done.state, "done"); assert.deepEqual(done.result, { changed: "terrain", nodes: 13600 });
});

test("#3937 a slow change that fails or is refused later is a failed job with the plain line; nothing from inside the app leaks", async () => {
  const { s } = session({ run: async () => { await sleep(80); return { ok: false, error: "The terrain could not be fetched: C:\\Users\\x\\dem.tif" }; } });
  await init(s);
  const started = JSON.parse(parse(await s.handleLine(call(2, "fetch_terrain"))).result.content[0].text);
  await sleep(120);
  const j = JSON.parse(parse(await s.handleLine(call(3, "job_status", { job_id: started.job_id }))).result.content[0].text);
  assert.equal(j.state, "failed"); assert.match(j.error, /could not be fetched/); assert.ok(!/Users/.test(j.error), "scrubbed");
});

test("#3937 the change stays one at a time while a job runs; a second waits, then is told it is busy", async () => {
  let finish; const gate = new Promise((r) => { finish = r; });
  const { s, calls } = session({ run: async (n) => { if (n === "fetch_terrain") await gate; return { ok: true, data: { changed: n } }; }, limits: { ...LIM, asyncAfterMs: 100, changeWaitMs: 40 } });
  await init(s);
  const started = JSON.parse(parse(await s.handleLine(call(2, "fetch_terrain"))).result.content[0].text);
  assert.equal(started.status, "started");
  const second = parse(await s.handleLine(call(3, "make_section", { along_hole: "DH-23-001" }))).result;
  assert.equal(second.isError, true); assert.match(second.content[0].text, /Another change is still running/);
  assert.deepEqual(calls, ["fetch_terrain"], "the second never reached the window");
  finish(); await sleep(20);
  assert.equal(parse(await s.handleLine(call(4, "make_section", { along_hole: "DH-23-001" }))).result.isError, false, "free again");
});

test("#3937 a change still waiting its turn when the answer is due is answered 'started' too (queued), and runs when the one before ends", async () => {
  let finish; const gate = new Promise((r) => { finish = r; });
  const { s, calls } = session({ run: async (n) => { if (n === "fetch_terrain") await gate; return { ok: true, data: { changed: n } }; }, limits: { ...LIM, asyncAfterMs: 30, changeWaitMs: 400 } });
  await init(s);
  assert.equal(JSON.parse(parse(await s.handleLine(call(2, "fetch_terrain"))).result.content[0].text).status, "started");
  const q = JSON.parse(parse(await s.handleLine(call(3, "make_section", { along_hole: "DH-23-001" }))).result.content[0].text);
  assert.equal(q.status, "started");
  assert.equal(JSON.parse(parse(await s.handleLine(call(4, "job_status", { job_id: q.job_id }))).result.content[0].text).state, "queued");
  finish(); await sleep(40);
  const j = JSON.parse(parse(await s.handleLine(call(5, "job_status", { job_id: q.job_id }))).result.content[0].text);
  assert.equal(j.state, "done"); assert.deepEqual(calls, ["fetch_terrain", "make_section"], "in order, one at a time");
});

test("#3937 job_status: an app sees only its own jobs; an unknown id and a long id are refused; the schema is strict; the activity lists it", async () => {
  const jobs = proto.createJobs();
  let finish; const gate = new Promise((r) => { finish = r; });
  const a = session({ jobs, run: async () => { await gate; return { ok: true, data: { changed: "raster" } }; } });
  const b = session({ jobs });
  await init(a.s, "Claude Desktop"); await init(b.s, "Other App");
  const started = JSON.parse(parse(await a.s.handleLine(call(2, "fetch_satellite_image"))).result.content[0].text);
  const theirs = parse(await b.s.handleLine(call(2, "job_status", { job_id: started.job_id }))).result;
  assert.equal(theirs.isError, true); assert.match(theirs.content[0].text, /No job/);
  assert.deepEqual(JSON.parse(parse(await b.s.handleLine(call(3, "job_status"))).result.content[0].text), { jobs: [] });
  assert.equal(JSON.parse(parse(await a.s.handleLine(call(3, "job_status"))).result.content[0].text).jobs.length, 1);
  finish(); await sleep(20);
  const def = proto.TOOLS.find((t) => t.name === "job_status");
  assert.equal(def.annotations.readOnlyHint, true); assert.equal(proto.isChangeTool(def), false, "a read tool: no switch needed");
  assert.equal(proto.refuseArgs(def, { job_id: "x".repeat(41) })?.message, "'job_id' is too long (at most 40 characters).");
  assert.equal(proto.refuseArgs(def, { job_id: "C:\\a" })?.code, "path");
  assert.equal(proto.refuseArgs(def, { other: 1 })?.message, "Unknown argument 'other'.");
  const off = proto.createSession({ changesAllowed: () => false, askAllow: async () => "once", callTool: async () => ({ ok: true, data: {} }) });
  await init(off);
  assert.equal(parse(await off.handleLine(call(2, "job_status"))).result.isError, false, "readable with the changes switch off");
});

test("#3937 the job list keeps the last 20", () => {
  const jobs = proto.createJobs({ kept: 3 });
  const ids = [1, 2, 3, 4, 5].map(() => jobs.create("fetch_terrain", "App").id);
  assert.equal(jobs.get(ids[0], "App"), null); assert.ok(jobs.get(ids[4], "App")); assert.equal(jobs.mine("App").length, 3);
  assert.equal(proto.LIMITS.jobsKept, 20); assert.equal(proto.LIMITS.asyncAfterMs, 20000, "well under an AI app's usual 60 s request timeout");
});

test("#3937 progress: an app that sent a progressToken is told it is still working, rising, until the answer; no token, no notifications", async () => {
  const lines = [];
  let finish; const gate = new Promise((r) => { finish = r; });
  const slow = async () => { await sleep(120); finish(); return { ok: true, data: { changed: "raster" } }; };
  const withTok = session({ run: slow, emit: (l) => lines.push(parse(l)), limits: { ...LIM, asyncAfterMs: 200 } });
  await init(withTok.s);
  const r = parse(await withTok.s.handleLine(call(2, "fetch_terrain", {}, { progressToken: "tok-1" }))).result;
  assert.equal(r.isError, false); assert.equal(JSON.parse(r.content[0].text).changed, "raster", "done inside the wait: the result itself");
  assert.ok(lines.length >= 2, `${lines.length} notifications`);
  for (const [i, n] of lines.entries()) { assert.equal(n.method, "notifications/progress"); assert.equal(n.id, undefined, "a notification has no id"); assert.equal(n.params.progressToken, "tok-1"); assert.equal(n.params.progress, i + 1); assert.match(n.params.message, /working on it/); }
  const n0 = lines.length; await sleep(60); assert.equal(lines.length, n0, "stopped with the answer");
  const quiet = []; const noTok = session({ run: slow, emit: (l) => quiet.push(l), limits: { ...LIM, asyncAfterMs: 200 } });
  await init(noTok.s); await noTok.s.handleLine(call(2, "fetch_terrain")); assert.equal(quiet.length, 0, "no token: nothing sent");
  const bad = []; const badTok = session({ run: slow, emit: (l) => bad.push(l), limits: { ...LIM, asyncAfterMs: 200 } });
  await init(badTok.s); await badTok.s.handleLine(call(2, "fetch_terrain", {}, { progressToken: { a: 1 } })); assert.equal(bad.length, 0, "a token that is not a text or a number is ignored");
  void gate;
});

test("#3937 on a real pipe: the host answers 'started' at once, sends progress on the same connection, and job_status reads the host's list", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gx-mcp3937-"));
  const store = { mcp: undefined };
  let host; let release;
  const gate = new Promise((r) => { release = r; });
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => { if (ch === "mcp-request") gate.then(() => host.respond(msg.id, { ok: true, data: { changed: "terrain", nodes: 1200 } })); } } };
  host = createHost({ userDataDir: dir, getWindow: () => win, askAllow: async () => "once", askNetwork: async () => true, isOnline: () => true, readPrefs: () => store, writePrefs: (p) => Object.assign(store, p), limits: LIM });
  await host.setEnabled(true, false); host.setChanges(true);
  const ep = JSON.parse(fs.readFileSync(host._endpointFile, "utf8"));
  const sock = net.connect(ep.pipe); sock.setEncoding("utf8");
  const got = []; let buf = "";
  sock.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { got.push(parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  await new Promise((r) => sock.on("connect", r));
  const send = (m) => sock.write(`${m}\n`);
  const until = async (f) => { for (let i = 0; i < 200 && !f(); i++) await sleep(10); return f(); };
  send(`GEOSTRIX-MCP ${ep.token}`); send(rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" } }));
  assert.ok(await until(() => got.some((m) => m.id === 1)));
  send(call(2, "fetch_terrain", {}, { progressToken: 7 }));
  assert.ok(await until(() => got.some((m) => m.id === 2)), "an answer although the window has not finished");
  const started = JSON.parse(got.find((m) => m.id === 2).result.content[0].text);
  assert.equal(started.status, "started");
  const prog = got.filter((m) => m.method === "notifications/progress");
  assert.ok(prog.length >= 1 && prog.every((m) => m.params.progressToken === 7), "progress came on the same connection before the answer");
  send(call(3, "job_status", { job_id: started.job_id }));
  assert.ok(await until(() => got.some((m) => m.id === 3)));
  assert.equal(JSON.parse(got.find((m) => m.id === 3).result.content[0].text).state, "running");
  release();
  await sleep(40);
  send(call(4, "job_status", { job_id: started.job_id }));
  assert.ok(await until(() => got.some((m) => m.id === 4)));
  const done = JSON.parse(got.find((m) => m.id === 4).result.content[0].text);
  assert.equal(done.state, "done"); assert.deepEqual(done.result, { changed: "terrain", nodes: 1200 });
  const st = host.status().activity;
  assert.ok(st.some((a) => a.tool === "fetch_terrain" && a.ok && a.change), "the activity list has the change when it ended");
  sock.destroy(); host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

test("#3937 the tool list says so: the download tools mention the 'started' answer and job_status; the relay's shipped list is the same file", () => {
  for (const n of ["fetch_satellite_image", "fetch_terrain"]) { const d = proto.TOOLS.find((t) => t.name === n).description; assert.match(d, /'started' with a job_id/); assert.match(d, /job_status/); }
  const ps = fs.readFileSync(new URL("../electron/mcp-bridge.ps1", import.meta.url), "utf8");
  assert.match(ps, /mcpToolDefs\.json/, "the bridge serves the tool list from the shipped file, so job_status is in it");
  const names = proto.TOOLS.filter(proto.isChangeTool).map((t) => t.name);
  for (const n of ["make_section", "make_sheet", "add_best_intercepts", "fetch_satellite_image", "fetch_terrain", "colour_holes", "show_layers", "set_view"]) assert.ok(names.includes(n), `${n}: the batch 1 change tools are unchanged`);
});
