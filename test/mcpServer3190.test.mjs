// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — AI App Access: the optional, local, read-only MCP server. Tools (src/lib/mcpTools.js), protocol and guards (electron/mcpProtocol.js), the pipe with its
// token (electron/mcpHost.js), the bridge (electron/mcpBridge.js) and the wiring. Made-up holes (DH-23-001 ...) and numbers throughout; every figure below is worked by hand.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import { runTool, TOOL_NAMES, refusal, scrubbed, MAX_ROWS } from "../src/lib/mcpTools.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const { createHost } = require("../electron/mcpHost.js");
const bridge = require("../electron/mcpBridge.js");
const TOOLS = require("../electron/mcpToolDefs.json");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---- a synthetic project: three holes, a section, a lithology log, Au / Cu assays and one standard
function snapshot() {
  const collars = [
    { hole_id: "DH-23-001", x: 1000, y: 2000, z: 300, azimuth: 90, dip: 90, length: 100, attrs: { type: "DD", year: 2023, note: "see C:\\Users\\someone\\notes.txt for the log", db_password: "hunter2" } },
    { hole_id: "DH-23-002", x: 1100, y: 2000, z: 305, azimuth: 90, dip: 60, length: 80, attrs: { type: "RC", year: 2023 } },
    { hole_id: "DH-23-003", x: 5000, y: 5000, z: 310, azimuth: 0, dip: 90, length: 50, attrs: { type: "DD", year: 2024 } },
  ];
  const survey = [{ hole_id: "DH-23-001", depth: 0, azimuth: 90, dip: 90 }, { hole_id: "DH-23-001", depth: 100, azimuth: 90, dip: 90 }];
  const a = (hole_id, from, to, Au, Cu, extra = {}) => ({ hole_id, from, to, values: { Au, Cu }, ...extra });
  const assays = [
    a("DH-23-001", 0, 1, 0.5, 100), a("DH-23-001", 1, 2, 2, 200), a("DH-23-001", 2, 3, 3, 300), a("DH-23-001", 3, 4, 0.2, 50),
    a("DH-23-002", 0, 1, 1, 10), a("DH-23-002", 1, 2, 4, 20),
    a("STD-01", 0, 1, 99, 99),
  ];
  const layers = { litho: [{ hole_id: "DH-23-001", from: 0, to: 2, value: "AND" }, { hole_id: "DH-23-001", from: 2, to: 4, value: "RHY" }, { hole_id: "DH-23-002", from: 0, to: 2, value: "AND" }], alt: [], vein: [{ hole_id: "DH-23-001", from: 1, to: 2, value: "Q" }] };
  const sections = [{ id: "sec1", name: "Line 1000N", ax: 1000, ay: 1900, bx: 1000, by: 2100, azimuth: 0, corridor: 25 }];
  return { project: { name: "Test project", epsg: 26909, crsSet: true, dataCredit: "Made-up credit", currency: "CAD" }, collars, survey, layers, assays, assayElements: [{ symbol: "Au", unit: "ppm" }, { symbol: "Cu", unit: "ppm" }], sections, codeDictionary: { litho: { and: { code: "AND", desc: "Andesite" } } }, desurveyMethod: "minimum_curvature" };
}
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const call = (name, args = {}, snap = snapshot()) => runTool(name, args, snap);

test("the tools: summary, holes (paged, filtered), hole, layers", () => {
  const snap = deepFreeze(snapshot()); // read-only: a tool that wrote to it would throw in strict mode
  const s = call("project_summary", {}, snap);
  assert.ok(s.ok); assert.equal(s.data.counts.holes, 3); assert.equal(s.data.counts.assay_intervals, 6); assert.equal(s.data.counts.qaqc_intervals_left_out, 1);
  assert.deepEqual(s.data.elements.map((e) => e.symbol), ["Au", "Cu"]); assert.equal(s.data.crs_epsg, 26909);
  const p1 = call("list_holes", { limit: 2 }, snap).data;
  assert.equal(p1.total, 3); assert.equal(p1.returned, 2); assert.equal(p1.next_offset, 2);
  const p2 = call("list_holes", { limit: 2, offset: 2 }, snap).data;
  assert.equal(p2.returned, 1); assert.equal(p2.next_offset, null);
  assert.equal(p1.rows[0].dip, -90); // down is negative, as the app prints it (#3878)
  const rc = call("list_holes", { field: "type", value: "rc" }, snap).data;
  assert.deepEqual(rc.rows.map((r) => r.hole_id), ["DH-23-002"]);
  const h = call("get_hole", { hole_id: "DH-23-001" }, snap).data;
  assert.equal(h.survey.stations, 2); assert.equal(h.logged_intervals.litho.intervals, 2); assert.equal(h.assays.intervals, 4); assert.deepEqual(h.assays.elements, ["Au", "Cu"]);
  const L = call("list_layers", {}, snap).data.layers;
  assert.deepEqual(L.map((l) => l.key), ["litho", "vein"]);
  assert.equal(L[0].codes.find((c) => c.code === "AND").meaning, "Andesite");
  const rows = call("get_layer_rows", { layer: "litho", hole_id: "DH-23-001" }, snap).data;
  assert.deepEqual(rows.rows.map((r) => r.value), ["AND", "RHY"]);
});

test("assays leave the QA/QC sample out; a missing hole, element or layer is said, not guessed", () => {
  const r = call("get_assays", { hole_id: "DH-23-001", elements: ["Au"] }).data;
  assert.equal(r.total, 4); assert.deepEqual(r.rows.map((x) => x.grades.Au), [0.5, 2, 3, 0.2]); assert.equal(r.units.Au, "ppm");
  assert.equal(call("get_assays", { elements: ["Au"], from: 2.5, to: 100 }).data.rows.every((x) => x.to > 2.5), true);
  assert.ok(!call("get_assays", {}).data.rows.some((x) => x.hole_id === "STD-01"));
  for (const [name, args, word] of [["get_hole", { hole_id: "NOPE" }, "No hole"], ["get_assays", { elements: ["Zz"] }, "No element"], ["get_layer_rows", { layer: "nope", hole_id: "DH-23-001" }, "No layer"], ["get_section", { section: "nope" }, "No section"]]) {
    const x = call(name, args); assert.equal(x.ok, false); assert.match(x.error, new RegExp(word));
  }
});

test("grade statistics by hand: Au of DH-23-001 and DH-23-002", () => {
  // values 0.5, 2, 3, 0.2, 1, 4 (each 1 m): mean 10.7 / 6 = 1.7833; sorted 0.2 0.5 1 2 3 4 -> median 1.5; p90 index 4.5 -> 3 + 0.5 x (4 - 3) = 3.5
  const s = call("grade_stats", { element: "Au" }).data.all;
  assert.equal(s.count, 6); assert.equal(s.mean, 1.7833); assert.equal(s.median, 1.5); assert.equal(s.percentiles.p90, 3.5); assert.equal(s.maximum, 4); assert.equal(s.metres, 6);
  const d = call("grade_stats", { element: "Au", domain_layer: "litho" }).data.by_domain.domains;
  // mid-depths: 0.5 AND, 1.5 AND, 2.5 RHY, 3.5 RHY; DH-23-002: 0.5 AND, 1.5 AND, so AND = 0.5, 2, 1, 4 (mean 1.875), RHY = 3, 0.2 (mean 1.6)
  assert.equal(d.find((x) => x.code === "AND").mean, 1.875); assert.equal(d.find((x) => x.code === "RHY").mean, 1.6);
});

test("best intercepts: the composite at a cut-off, by hand", () => {
  // DH-23-001 at 1 ppm: 1-2 (2) and 2-3 (3) are above, 0.5 and 0.2 are not: 1-3 m, 2 m at 2.5. DH-23-002 at 1 ppm: 0-2 m at (1 + 4) / 2 = 2.5. Ranked by grade x length: both 5, so either first
  const r = call("best_intercepts", { element: "Au", cutoff: 1 }).data;
  const a = r.rows.find((x) => x.hole_id === "DH-23-001"), b = r.rows.find((x) => x.hole_id === "DH-23-002");
  assert.deepEqual([a.from, a.to, a.length, a.average_grade], [1, 3, 2, 2.5]); assert.deepEqual([b.from, b.to, b.length, b.average_grade], [0, 2, 2, 2.5]);
  assert.equal(call("best_intercepts", { element: "Au", cutoff: 1, hole_id: "DH-23-002" }).data.total, 1);
  assert.equal(call("best_intercepts", { element: "Au", cutoff: 3.9 }).data.rows[0].hole_id, "DH-23-002");
  assert.equal(call("best_intercepts", { element: "Au" }).ok, false); // no cut-off
});

test("sections: the holes in the corridor with their distance along and offset, and their intercepts", () => {
  const l = call("list_sections").data.sections; assert.equal(l[0].name, "Line 1000N"); assert.equal(l[0].length_m, 200);
  const g = call("get_section", { section: "line 1000n", element: "Au", cutoff: 1 }).data;
  // DH-23-001 is vertical at the line (x 1000): along 100 m (from y 1900 to 2000), offset 0; DH-23-002 is 100 m east, outside the 25 m corridor; DH-23-003 is far away
  assert.deepEqual(g.holes.map((h) => h.hole_id), ["DH-23-001"]); assert.equal(g.holes[0].distance_along_section, 100); assert.equal(Math.abs(g.holes[0].collar_offset_from_line), 0);
  assert.deepEqual(g.intercepts.rows.map((x) => x.hole_id), ["DH-23-001"]);
});

test("the caps: no more than 200 rows a call, the reply kept under its byte budget", () => {
  const snap = snapshot();
  snap.collars = Array.from({ length: 1000 }, (_, i) => ({ hole_id: `DH-24-${String(i).padStart(4, "0")}`, x: i, y: i, z: 0, azimuth: 0, dip: 60, length: 100, attrs: { comment: "x".repeat(400) } }));
  const r = call("list_holes", { limit: 5000 }, snap).data;
  assert.ok(r.returned <= MAX_ROWS && r.total === 1000 && r.next_offset === r.returned, `returned ${r.returned}`);
  assert.match(r.note, /At most 200 rows/);
  assert.ok(JSON.stringify(r).length <= 100000, `${JSON.stringify(r).length} bytes`);
});

test("refusals: a path, a credential, an unknown tool, no project; nothing secret in a reply", () => {
  for (const bad of [{ hole_id: "C:\\Users\\x\\a.csv" }, { hole_id: "\\\\server\\share\\a" }, { hole_id: "/etc/passwd" }, { hole_id: "../../secret" }, { hole_id: "file:///c:/a" }, { hole_id: "~/a" }, { hole_id: "%APPDATA%\\x" }]) {
    const x = call("get_hole", bad); assert.equal(x.ok, false, JSON.stringify(bad)); assert.match(x.error, /paths are never accepted/i);
  }
  for (const bad of [{ password: "x" }, { hole_id: "DH-23-001", api_key: "k" }, { nested: { secretToken: "t" } }]) assert.match(call("get_hole", bad).error, /never accepts credentials/i);
  assert.match(refusal({ x: "C:\\a" }), /paths/); assert.equal(refusal({ hole_id: "DH-23-001", element: "Au", limit: 5 }), null);
  assert.equal(call("delete_everything").ok, false); assert.match(call("nope").error, /Unknown tool/);
  assert.match(runTool("project_summary", {}, null).error, /No project is open/);
  // the collar's own field holding a path / a password never reaches the AI app
  const h = JSON.stringify(call("get_hole", { hole_id: "DH-23-001" }).data);
  assert.ok(!/someone|hunter2|db_password|C:\\\\Users/.test(h), h);
  assert.match(h, /\[path removed\]/);
  assert.deepEqual(scrubbed({ ok: 1, dbPassword: "x", text: "in /home/geo/a.csv" }), { ok: 1, text: "in [path removed]" });
  assert.deepEqual(TOOL_NAMES.sort(), TOOLS.filter((t) => !proto.isChangeTool(t) && t.name !== "job_status").map((t) => t.name).sort(), "the schemas and the implementation list the same read tools"); // #3932 — the change tools are lib/mcpActions.js's (test/mcpTools3932); #3937 — job_status is answered by the protocol itself, from the host's job list (test/mcpJobs3937)
});

// ---- the protocol and its second set of guards
const FAKE = (over = {}) => { const log = []; const s = proto.createSession({ callTool: async (n, a) => { log.push([n, a]); return { ok: true, data: { rows: [1, 2], hello: "x" }, rows: 2 }; }, askAllow: async () => "once", onActivity: (e) => log.push(["activity", e]), ...over }); return { s, log, calls: () => log.filter((l) => l[0] !== "activity") }; };
const rpc = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const parse = (t) => JSON.parse(t);
const init = (s) => s.handleLine(rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" }, capabilities: {} }));

test("protocol: initialize, ask first, list the tools, call one", async () => {
  const f = FAKE();
  assert.equal(parse(await f.s.handleLine(rpc(0, "tools/list"))).error.code, -32002); // before initialize
  const i = parse(await init(f.s));
  assert.equal(i.result.protocolVersion, "2025-06-18"); assert.deepEqual(Object.keys(i.result.capabilities), ["tools"]); assert.equal(i.result.serverInfo.name, "geostrix");
  assert.equal(await f.s.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })), null);
  assert.deepEqual(parse(await f.s.handleLine(rpc(2, "ping"))).result, {});
  assert.equal(parse(await f.s.handleLine(rpc(3, "tools/list"))).result.tools.length, TOOLS.length);
  const c = parse(await f.s.handleLine(rpc(4, "tools/call", { name: "project_summary", arguments: {} })));
  assert.equal(c.result.isError, false); assert.equal(JSON.parse(c.result.content[0].text).hello, "x");
  assert.equal(parse(await f.s.handleLine(rpc(5, "resources/list"))).error.code, -32601);
  assert.equal(parse(await f.s.handleLine("{nope")).error.code, -32700);
  assert.equal(parse(await f.s.handleLine("[1,2]")).error.code, -32600);
});

test("protocol: a refused app gets nothing; the client's name is cleaned", async () => {
  const f = FAKE({ askAllow: async () => "refuse" });
  assert.equal(parse(await init(f.s)).error.code, -32000);
  assert.equal(await f.s.handleLine(rpc(2, "tools/list")), null); // closed
  assert.equal(proto.cleanClientName("<script>x</script> Evil\u0000 App"), "scriptxscript Evil App");
  assert.equal(proto.cleanClientName(""), "An AI app");
});

test("protocol refusals: paths and credentials never reach the project; schema; caps", async () => {
  const f = FAKE(); await init(f.s);
  const tryCall = async (name, args) => parse(await f.s.handleLine(rpc(9, "tools/call", { name, arguments: args })));
  for (const [name, args, re] of [
    ["get_hole", { hole_id: "C:\\Users\\a\\b.csv" }, /paths are never accepted/i],
    ["get_hole", { hole_id: "../x" }, /paths are never accepted/i],
    ["get_hole", { hole_id: "DH-23-001", password: "p" }, /never accepts credentials/i],
    ["get_hole", { hole_id: "DH-23-001", token: "t" }, /never accepts credentials/i],
    ["get_hole", { hole_id: "DH-23-001", extra: 1 }, /Unknown argument/],
    ["get_hole", {}, /'hole_id' is required/],
    ["get_hole", { hole_id: 5 }, /must be text/],
    ["list_holes", { limit: 5000 }, /at most 200/],
    ["list_holes", { limit: 0 }, /at least 1/],
    ["list_holes", { offset: -1 }, /at least 0/],
    ["list_holes", { limit: 1.5 }, /whole number/],
    ["get_assays", { elements: Array.from({ length: 9 }, () => "Au") }, /too many items/],
    ["get_hole", { hole_id: "x".repeat(65) }, /too long/],
    ["list_holes", { field: "a", value: "x".repeat(5000) }, /too large/],
  ]) { const r = await tryCall(name, args); assert.equal(r.result.isError, true, `${name} ${JSON.stringify(args).slice(0, 60)}`); assert.match(r.result.content[0].text, re); }
  assert.equal(f.calls().length, 0, "none of them reached the project");
  assert.equal(parse(await f.s.handleLine(rpc(9, "tools/call", { name: "write_file", arguments: {} }))).error.code, -32602);
  assert.equal(f.calls().length, 0);
});

test("protocol: the reply is scrubbed and capped; calls a minute are limited", async () => {
  const big = FAKE({ callTool: async () => ({ ok: true, data: { blob: "y".repeat(200000) } }) }); await init(big.s);
  const r = parse(await big.s.handleLine(rpc(2, "tools/call", { name: "project_summary", arguments: {} })));
  assert.equal(r.result.isError, true); assert.match(r.result.content[0].text, /too large/);
  const dirty = FAKE({ callTool: async () => ({ ok: true, data: { fine: "ok", db_password: "p", note: "at C:\\Data\\x.txt and /home/geo/y" } }) }); await init(dirty.s);
  const d = JSON.parse(parse(await dirty.s.handleLine(rpc(2, "tools/call", { name: "project_summary", arguments: {} }))).result.content[0].text);
  assert.deepEqual(d, { fine: "ok", note: "at [path removed] and [path removed]" });
  const lim = FAKE({ limits: { ...proto.LIMITS, callsPerMinute: 3 } }); await init(lim.s);
  const out = []; for (let i = 0; i < 5; i++) out.push(parse(await lim.s.handleLine(rpc(10 + i, "tools/call", { name: "project_summary", arguments: {} }))).result);
  assert.deepEqual(out.map((x) => x.isError), [false, false, false, true, true]); assert.match(out[3].content[0].text, /at most 3 a minute/);
  assert.equal(lim.calls().length, 3);
  const failing = FAKE({ callTool: async () => { throw new Error("C:\\secret\\stack"); } }); await init(failing.s);
  const e = parse(await failing.s.handleLine(rpc(2, "tools/call", { name: "project_summary", arguments: {} }))).result;
  assert.equal(e.isError, true); assert.ok(!/secret/.test(e.content[0].text), "nothing from inside the app (a path, a stack) goes out");
});

// ---- the host on a real pipe, with the token, and the bridge
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "gx-mcp-")); }
function makeHost(userDataDir, { answer = "once", prefs = {}, snap = snapshot() } = {}) {
  const store = { mcp: prefs.mcp };
  let host; const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => { sent.push([ch, msg]); if (ch === "mcp-request") setImmediate(() => host.respond(msg.id, runTool(msg.name, msg.args, snap))); } } };
  host = createHost({ userDataDir, getWindow: () => win, askAllow: async () => answer, readPrefs: () => store, writePrefs: (p) => Object.assign(store, p) });
  return { host, store, sent };
}
const lineClient = (pipe, hello) => new Promise((resolve, reject) => {
  const sock = net.connect(pipe); let buf = ""; const waiters = [];
  sock.setEncoding("utf8");
  sock.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiters.shift()?.(l); } });
  sock.on("connect", () => { if (hello) sock.write(`${hello}\n`); resolve({ sock, ask: (msg) => new Promise((res) => { waiters.push(res); sock.write(`${JSON.stringify(msg)}\n`); }), closed: new Promise((r) => sock.on("close", r)) }); });
  sock.on("error", reject);
});

test("the host: off until started; a token; the endpoint file; the first connection asked; stop removes it", async () => {
  const dir = tempDir();
  const { host, store } = makeHost(dir);
  assert.equal(host.status().enabled, false); assert.ok(!fs.existsSync(host._endpointFile));
  const r = await host.setEnabled(true, false);
  assert.ok(r.ok); assert.equal(store.mcp.enabled, false, "not remembered unless asked"); assert.equal(store.mcp.remember, false);
  const ep = JSON.parse(fs.readFileSync(host._endpointFile, "utf8"));
  assert.match(ep.token, /^[0-9a-f]{64}$/); assert.ok(ep.pipe);
  assert.ok(!/tcp|:\d{2,5}$/.test(ep.pipe) && (process.platform === "win32" ? ep.pipe.startsWith("\\\\.\\pipe\\") : ep.pipe.endsWith(".sock")), "a pipe or a socket, no port");
  // no token / a wrong token: dropped, nothing answered
  const bad = await lineClient(ep.pipe, "GEOSTRIX-MCP deadbeef"); await bad.closed;
  const none = await lineClient(ep.pipe, null); none.sock.write(`${rpc(1, "initialize", {})}\n`); await none.closed;
  assert.equal(host.status().clients.length, 0);
  // the right token
  const c = await lineClient(ep.pipe, `GEOSTRIX-MCP ${ep.token}`);
  await c.ask(JSON.parse(rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" } })));
  const sum = parse(await c.ask(JSON.parse(rpc(2, "tools/call", { name: "project_summary", arguments: {} }))));
  assert.equal(JSON.parse(sum.result.content[0].text).counts.holes, 3);
  const refused = parse(await c.ask(JSON.parse(rpc(3, "tools/call", { name: "get_hole", arguments: { hole_id: "C:\\a" } }))));
  assert.equal(refused.result.isError, true);
  const st = host.status();
  assert.equal(st.clients[0].name, "Claude Desktop"); assert.equal(st.calls, 2); assert.equal(st.activity.at(-1).refused, "path"); assert.equal(st.activity[0].tool, "project_summary");
  host.stop(); await c.closed;
  assert.ok(!fs.existsSync(host._endpointFile)); assert.equal(host.status().enabled, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the host: 'remember' keeps it on for the next launch, otherwise it resumes off; 'always allow' is remembered; a refusal closes", async () => {
  const dir = tempDir();
  const a = makeHost(dir, { answer: "always" });
  await a.host.setEnabled(true, true);
  assert.deepEqual([a.store.mcp.enabled, a.store.mcp.remember], [true, true]);
  const ep = JSON.parse(fs.readFileSync(a.host._endpointFile, "utf8"));
  const c = await lineClient(ep.pipe, `GEOSTRIX-MCP ${ep.token}`);
  await c.ask(JSON.parse(rpc(1, "initialize", { clientInfo: { name: "Some Client" } })));
  assert.deepEqual(a.store.mcp.allowed, ["Some Client"]);
  a.host.stop();
  const b = makeHost(dir, { answer: "refuse", prefs: { mcp: a.store.mcp } });
  assert.ok((await b.host.resumeIfRemembered()).ok); assert.equal(b.host.status().enabled, true);
  const ep2 = JSON.parse(fs.readFileSync(b.host._endpointFile, "utf8")); assert.notEqual(ep2.token, ep.token, "a new token every launch");
  const c2 = await lineClient(ep2.pipe, `GEOSTRIX-MCP ${ep2.token}`);
  assert.equal((await c2.ask(JSON.parse(rpc(1, "initialize", { clientInfo: { name: "Some Client" } })))).includes('"result"'), true, "allowed before: not asked again, though this host would refuse");
  b.host.stop();
  const off = makeHost(dir, { prefs: { mcp: { remember: false, enabled: false } } });
  assert.deepEqual(await off.host.resumeIfRemembered(), { ok: true, off: true }); assert.equal(off.host.status().enabled, false);
  const no = makeHost(dir, { answer: "refuse" }); await no.host.setEnabled(true, false);
  const ep3 = JSON.parse(fs.readFileSync(no.host._endpointFile, "utf8"));
  const c3 = await lineClient(ep3.pipe, `GEOSTRIX-MCP ${ep3.token}`);
  assert.match(await c3.ask(JSON.parse(rpc(1, "initialize", { clientInfo: { name: "Other" } }))), /did not allow/);
  no.host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

test("the bridge copies lines both ways; with GeoStrix off it still answers, with what to do", async () => {
  const dir = tempDir();
  const { host } = makeHost(dir); await host.setEnabled(true, false);
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough(); let exited = null;
  bridge.run({ userDataDir: dir, stdin, stdout, stderr, exit: (c) => { exited = c; } });
  const got = new Promise((res) => { let b = ""; const lines = []; stdout.setEncoding("utf8"); stdout.on("data", (c) => { b += c; let i; while ((i = b.indexOf("\n")) >= 0) { lines.push(b.slice(0, i)); b = b.slice(i + 1); if (lines.length === 2) res(lines.map(parse)); } }); });
  stdin.write(`${rpc(1, "initialize", { clientInfo: { name: "Bridge Test" } })}\n${rpc(2, "tools/call", { name: "list_holes", arguments: { limit: 1 } })}\n`);
  const [r1, r2] = await got;
  assert.equal(r1.id, 1); assert.equal(JSON.parse(r2.result.content[0].text).returned, 1);
  host.stop(); await new Promise((r) => setTimeout(r, 50)); assert.equal(exited, 0);
  // not running: the endpoint file is gone
  const stdin2 = new PassThrough(), stdout2 = new PassThrough(), stderr2 = new PassThrough();
  bridge.run({ userDataDir: dir, stdin: stdin2, stdout: stdout2, stderr: stderr2, exit: () => {} });
  const reply = new Promise((res) => stdout2.once("data", (c) => res(parse(String(c).trim()))));
  stdin2.write(`${rpc(7, "initialize", {})}\n`);
  const e = await reply; assert.equal(e.id, 7); assert.match(e.error.message, /AI App Access is switched off/);
  assert.match(String(stderr2.read()), /Tools > AI App Access/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("wiring: main (bridge mode, no lock, IPC from the main window only, menu, quit), preload, desktop.js, App.jsx; nothing in the startup bundle", () => {
  const m = read("../electron/main.js");
  assert.ok(!/MCP_BRIDGE|--mcp-bridge/.test(m), "no switch on the application itself: a GUI exe gets no stdin (checked live)");
  assert.match(m, /const args = \[path\.join\(app\.getAppPath\(\), "electron", "mcpBridgeCli\.js"\)\], env = \{ ELECTRON_RUN_AS_NODE: "1", GEOSTRIX_USER_DATA: app\.getPath\("userData"\) \};/);
  assert.match(m, /const fromMainWindow = \(e\) => !!mainWindow && !mainWindow\.isDestroyed\(\) && e\.sender === mainWindow\.webContents;/);
  for (const ch of ["mcp-status", "mcp-set-enabled", "mcp-stop", "mcp-forget-clients"]) assert.match(m, new RegExp(`ipcMain\\.handle\\("${ch}", \\((e|e, req)\\) => \\(fromMainWindow\\(e\\)`));
  assert.match(m, /ipcMain\.handle\("mcp-config", \(e\) => \{[^\n]*\n\s+if \(!fromMainWindow\(e\)\) return null;/);
  assert.match(m, /ipcMain\.on\("mcp-respond", \(e, msg\) => \{ if \(fromMainWindow\(e\)/);
  assert.match(m, /label: L\("AI App Access…"\), click: \(\) => mainWindow\?\.webContents\.send\("menu", "ai-access"\)/);
  assert.match(m, /mcpHost\?\.stop\(\)/);
  assert.match(m, /defaultId: 2, cancelId: 2/, "the safe button is the default of the question");
  assert.match(m, /m\?\.remember && m\?\.enabled\) mcp\(\)\.resumeIfRemembered\(\)/);
  assert.ok(!/listen\(\s*\d/.test(read("../electron/mcpHost.js")) && !/0\.0\.0\.0|127\.0\.0\.1|localhost/.test(read("../electron/mcpHost.js")), "no TCP port anywhere");
  const pre = read("../electron/preload.js");
  for (const f of ["mcpStatus", "mcpSetEnabled", "mcpStop", "mcpForgetClients", "mcpConfig", "mcpRespond", "onMcpStatus", "onMcpRequest"]) assert.match(pre, new RegExp(`${f}:`));
  const d = read("../src/lib/desktop.js");
  assert.match(d, /const \{ runTool \} = await import\("\.\/mcpTools\.js"\);/);
  const app = read("../src/App.jsx");
  assert.ok(!/from "\.\/lib\/mcpTools\.js"/.test(app) && !/^import .*mcpTools/m.test(d), "the tools are a lazy chunk");
  assert.match(app, /React\.lazy\(\(\) => import\("\.\/components\/AiAccessModal\.jsx"\)\)/);
  assert.match(app, /else if \(action === "ai-access"\) setAiAccessOpen\(true\);/);
  assert.match(app, /ai\?\.enabled && /);
  const pkg = JSON.parse(read("../package.json")); assert.ok(!Object.keys(pkg.dependencies || {}).some((k) => /modelcontextprotocol/.test(k)), "no SDK: the protocol part is electron/mcpProtocol.js");
});

test("the CLI entry, run as a real child process on real stdio, reaches the host; a client that ends right after its last line is still answered", async () => {
  const { spawn } = await import("node:child_process");
  const dir = tempDir();
  const { host } = makeHost(dir); await host.setEnabled(true, false);
  const cli = new URL("../electron/mcpBridgeCli.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const child = spawn(process.execPath, [decodeURIComponent(cli)], { env: { ...process.env, GEOSTRIX_USER_DATA: dir }, stdio: ["pipe", "pipe", "pipe"] });
  let out = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (c) => { out += c; });
  child.stdin.write([rpc(1, "initialize", { clientInfo: { name: "Child Client" } }), rpc(2, "tools/call", { name: "project_summary", arguments: {} }), ""].join("\n"));
  child.stdin.end(); // the last line is sent and the input ends at once: the answers must still come back
  const code = await new Promise((res) => child.on("exit", res));
  const lines = out.split("\n").filter(Boolean).map(parse);
  assert.equal(code, 0); assert.deepEqual(lines.map((l) => l.id), [1, 2]);
  assert.equal(JSON.parse(lines[1].result.content[0].text).counts.holes, 3);
  assert.equal(out.split("\n").filter((l) => l && !l.startsWith("{")).length, 0, "nothing but JSON lines on stdout");
  host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});
