// TASKS.csv #3964 (Matt: "I want it to always stay connected, like qgis") — the PowerShell bridge never ends while the AI app holds it open: it
// answers initialize / tools/list itself from electron/mcpToolDefs.json, reaches GeoStrix per tools/call (endpoint.json read each time), says
// a plain error when GeoStrix is closed and keeps running, and connects again after GeoStrix restarts. Started EXACTLY as an AI app starts it
// (powershell.exe, the entry's arguments, stdio pipes) against the real host (electron/mcpHost.js) on a real pipe, in a throwaway folder.
// Windows only (PowerShell).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHost } = require("../electron/mcpHost.js");
const proto = require("../electron/mcpProtocol.js");
const SCRIPT = decodeURIComponent(new URL("../electron/mcp-bridge.ps1", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const win32 = process.platform === "win32";
const NOT_RUNNING = /^GeoStrix is not running, or AI App Access is switched off\. In GeoStrix open Tools > AI App Access/;
const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "gx mcp 3964 "));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function startBridge(userDataDir) {
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT], { env: { ...process.env, GEOSTRIX_USER_DATA: userDataDir }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const chunks = []; child.stdout.on("data", (c) => chunks.push(c));
  let exitCode; const exited = new Promise((res) => child.on("exit", (code) => { exitCode = code; res(code); }));
  const lines = () => Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const answer = async (id, ms = 20000) => { const end = Date.now() + ms; for (;;) { const a = lines().find((m) => m.id === id); if (a || Date.now() > end) return a; await sleep(25); } };
  const send = (line) => child.stdin.write(`${line}\n`);
  return { child, exited, lines, answer, send, running: () => exitCode === undefined };
}
// a GeoStrix: tools answer at once, except 'hold_me' (never answered: to cut a call off mid-way)
function fakeHost(dir, { allow = "once" } = {}) {
  let host;
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => { if (ch === "mcp-request" && msg.name !== "list_holes") setImmediate(() => host.respond(msg.id, { ok: true, data: { tool: msg.name } })); } } };
  const store = {}, asked = [];
  host = createHost({ userDataDir: dir, getWindow: () => win, askAllow: async (c) => { asked.push(c); return allow; }, readPrefs: () => store, writePrefs: (p) => Object.assign(store, p) });
  return { host, asked };
}
const init = (id) => rpc(id, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Test Client" }, capabilities: {} });
const call = (id, name = "project_summary") => rpc(id, "tools/call", { name, arguments: {} });

test("#3964 GeoStrix closed: Running (initialize and the shipped tool list answered here), a clear error on a call, and the bridge keeps going", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  const dir = tempDir(), b = startBridge(dir);
  b.send(init(1)); b.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })); b.send(rpc(2, "tools/list")); b.send(rpc(3, "ping")); b.send(call(4)); b.send(rpc(5, "resources/list"));
  const i = await b.answer(1), l = await b.answer(2), p = await b.answer(3), c = await b.answer(4), r = await b.answer(5);
  // the same initialize answer GeoStrix itself gives
  const s = proto.createSession({ callTool: async () => ({ ok: true }), askAllow: async () => "once" });
  assert.deepEqual(i.result, JSON.parse(await s.handleLine(init(1))).result);
  assert.deepEqual(l.result.tools, proto.TOOLS, "the shipped tool list, as the installed GeoStrix serves it");
  assert.deepEqual(p.result, {});
  assert.equal(c.error.code, -32000); assert.match(c.error.message, NOT_RUNNING);
  assert.equal(r.error.code, -32601, "what GeoStrix answers for a method it has not");
  await sleep(1500);
  assert.ok(b.running(), "still running after the error");
  b.send(call(6)); const c2 = await b.answer(6);
  assert.match(c2.error.message, NOT_RUNNING, "asked again: the same answer, still running");
  b.child.stdin.end(); assert.equal(await b.exited, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("#3964 opened later: the next call works with no restart; GeoStrix restarted (new pipe and token): the next call works; a call cut off says so", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  const dir = tempDir(), b = startBridge(dir);
  b.send(init(1)); await b.answer(1);
  b.send(call(2)); assert.match((await b.answer(2)).error.message, NOT_RUNNING, "closed");
  const g1 = fakeHost(dir); assert.ok((await g1.host.setEnabled(true, false)).ok);
  b.send(call(3)); const a3 = await b.answer(3);
  assert.equal(a3.result?.isError, false, JSON.stringify(a3)); assert.equal(JSON.parse(a3.result.content[0].text).tool, "project_summary");
  assert.deepEqual(g1.asked, ["Test Client"], "GeoStrix asked the user about the app by its own name");
  b.send(rpc(4, "tools/list")); assert.deepEqual((await b.answer(4)).result.tools.map((t) => t.name), proto.TOOLS.map((t) => t.name), "GeoStrix's own list once connected");
  b.send(call(5, "list_holes")); await sleep(1500); // never answered by this GeoStrix ...
  g1.host.stop(); // ... which quits
  const a5 = await b.answer(5); assert.match(a5.error.message, NOT_RUNNING, "the cut-off call is answered");
  b.send(call(6)); assert.match((await b.answer(6)).error.message, NOT_RUNNING, "closed again");
  const g2 = fakeHost(dir); assert.ok((await g2.host.setEnabled(true, false)).ok); // a new launch: new pipe, new token
  b.send(call(7)); const a7 = await b.answer(7);
  assert.equal(a7.result?.isError, false, JSON.stringify(a7));
  assert.ok(b.running());
  b.child.stdin.end(); assert.equal(await b.exited, 0);
  g2.host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

test("#3964 the user does not allow the app: its words come back, and the bridge keeps running", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  const dir = tempDir(), g = fakeHost(dir, { allow: "refuse" }), b = startBridge(dir);
  assert.ok((await g.host.setEnabled(true, false)).ok);
  b.send(init(1)); await b.answer(1);
  b.send(call(2)); const a = await b.answer(2);
  assert.equal(a.error.message, "The user did not allow this AI app to read the project.");
  await sleep(500); assert.ok(b.running());
  b.child.stdin.end(); assert.equal(await b.exited, 0);
  g.host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

test("#3964 the AI app quits (its input ends, or it is killed outright): no powershell.exe is left behind", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  const dir = tempDir(), g = fakeHost(dir);
  assert.ok((await g.host.setEnabled(true, false)).ok);
  // an AI app (a node process) that starts the bridge, connects it, then is killed without closing anything
  const client = spawn(process.execPath, ["-e", `
    const { spawn } = require("node:child_process");
    const b = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ${JSON.stringify(SCRIPT)}], { env: { ...process.env, GEOSTRIX_USER_DATA: ${JSON.stringify(dir)} }, stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
    b.stdout.on("data", (c) => { if (String(c).includes('"id":2')) console.log("PID " + b.pid); });
    b.stdin.write(${JSON.stringify(`${init(1)}\n${call(2)}\n`)});
    setInterval(() => {}, 1000);`], { stdio: ["ignore", "pipe", "inherit"] });
  let out = ""; client.stdout.on("data", (c) => { out += c; });
  const end = Date.now() + 20000; while (!/PID \d+/.test(out) && Date.now() < end) await sleep(50);
  const pid = Number(out.match(/PID (\d+)/)[1]);
  assert.ok(alive(pid), "the bridge is running and connected");
  execFileSync("taskkill", ["/PID", String(client.pid), "/F"]); // the AI app is gone: the bridge's input is closed under it
  const until = Date.now() + 10000; while (alive(pid) && Date.now() < until) await sleep(100);
  assert.equal(alive(pid), false, "the bridge ended with its AI app");
  g.host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

test("#3964 the tool list ships beside the bridge; #3925's decisions kept", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const pkg = JSON.parse(read("../package.json"));
  assert.ok(pkg.build.extraResources.some((r) => r.from === "electron/mcpToolDefs.json" && r.to === "mcpToolDefs.json"));
  assert.ok(pkg.build.extraResources.some((r) => r.from === "electron/mcp-bridge.ps1" && r.to === "mcp-bridge.ps1"));
  assert.equal(pkg.build.electronFuses.runAsNode, false);
  const ps = read("../electron/mcp-bridge.ps1");
  assert.match(ps, /Join-Path \$PSScriptRoot 'mcpToolDefs\.json'/);
  assert.match(ps, /Join-Path \$UserData 'mcp\\endpoint\.json'/, "the endpoint file as it is");
  assert.match(ps, /"GEOSTRIX-MCP \$\(\$ep\.token\)"/, "the per-launch token as it is");
  assert.doesNotMatch(ps, /Invoke-WebRequest|Net\.WebClient|TcpClient|Start-Process/, "nothing on the network, nothing started");
  assert.doesNotMatch(read("../electron/main.js"), /--mcp-bridge/);
});
