// TASKS.csv #3925 — Claude could not connect: the AI-app entry ran GeoStrix.exe with ELECTRON_RUN_AS_NODE=1, and the packaged build's RunAsNode fuse is
// off (kept off). The bridge is now electron/mcp-bridge.ps1, run by Windows PowerShell. Here it is started EXACTLY as an AI app starts it (powershell.exe,
// the entry's arguments and environment, stdio pipes) against the real host (electron/mcpHost.js) on a real pipe, in a throwaway folder: initialize
// answered in a few seconds, a tool's UTF-8 text arrives byte for byte, a client that ends right after its last line is still answered; GeoStrix not
// running (no endpoint, or a stale one) gets one plain MCP error per request, fast, and the bridge ends with its input. Windows only (PowerShell).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHost } = require("../electron/mcpHost.js");
const SCRIPT = decodeURIComponent(new URL("../electron/mcp-bridge.ps1", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const win32 = process.platform === "win32";
const TEXT = "Évora — 日本 ü ç ñ ✓"; // what a tool answer carries, past ASCII

const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "gx mcp ps ")); // a space in the path, as under 'Program Files'
// the entry mcp-config gives (command, args, env), run as an AI app runs it
function startBridge(userDataDir) {
  const t0 = Date.now();
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT], { env: { ...process.env, GEOSTRIX_USER_DATA: userDataDir }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const chunks = []; child.stdout.on("data", (c) => chunks.push(c));
  let err = ""; child.stderr.setEncoding("utf8"); child.stderr.on("data", (c) => { err += c; });
  const exited = new Promise((res) => child.on("exit", (code) => res(code)));
  const lines = () => Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean);
  const waitLines = async (n, ms = 15000) => { const end = Date.now() + ms; while (lines().length < n && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return lines(); };
  return { child, exited, lines, waitLines, err: () => err, t0 };
}
function fakeHost(dir) {
  let host;
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => { if (ch === "mcp-request") setImmediate(() => host.respond(msg.id, { ok: true, data: { name: TEXT, tool: msg.name } })); } } };
  const store = {};
  host = createHost({ userDataDir: dir, getWindow: () => win, askAllow: async () => "once", readPrefs: () => store, writePrefs: (p) => Object.assign(store, p) });
  return host;
}

test("#3925 the PowerShell bridge, started as an AI app starts it, finishes initialize in a few seconds and relays a tool's UTF-8 text byte for byte", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  const dir = tempDir(), host = fakeHost(dir);
  assert.ok((await host.setEnabled(true, false)).ok);
  const b = startBridge(dir);
  b.child.stdin.write(`${rpc(1, "initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "Test Client" }, capabilities: {} })}\n`);
  const first = await b.waitLines(1);
  const secs = (Date.now() - b.t0) / 1000;
  const init = JSON.parse(first[0]);
  assert.equal(init.id, 1); assert.ok(init.result?.serverInfo, first[0]);
  assert.ok(secs < 8, `initialize answered in ${secs.toFixed(1)} s`);
  // a notification (no answer), then a tool call; the input ends right after it: the answer must still come back
  b.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${rpc(2, "tools/call", { name: "project_summary", arguments: {} })}\n`);
  b.child.stdin.end();
  const code = await b.exited;
  const all = b.lines();
  assert.deepEqual(all.map((l) => JSON.parse(l).id), [1, 2]);
  const text = JSON.parse(all[1]).result.content[0].text;
  assert.equal(JSON.parse(text).name, TEXT, "UTF-8 intact");
  assert.equal(code, 0);
  assert.equal(all.filter((l) => !l.startsWith("{")).length, 0, "nothing but JSON lines on stdout");
  host.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

// #3964: the bridge now answers initialize and tools/list itself (so the AI app shows it Running) and keeps going; a tool call is what
// needs GeoStrix, and gets the plain error (test/mcpBridgeAlways3964 has the rest)
test("#3925 GeoStrix not running: no endpoint, or one left by a GeoStrix that is gone: a tool call gets one plain MCP error, fast; ends with its input; nothing started", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  for (const stale of [false, true]) {
    const dir = tempDir();
    if (stale) { fs.mkdirSync(path.join(dir, "mcp")); fs.writeFileSync(path.join(dir, "mcp", "endpoint.json"), JSON.stringify({ pipe: "\\\\.\\pipe\\geostrix-mcp-000000000000", token: "x".repeat(64), pid: 999999 })); }
    const b = startBridge(dir);
    b.child.stdin.write(`${rpc(7, "initialize", { clientInfo: { name: "Test Client" } })}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${rpc("a", "tools/list")}\n${rpc("c", "tools/call", { name: "project_summary", arguments: {} })}\n`);
    const got = await b.waitLines(3);
    const secs = (Date.now() - b.t0) / 1000;
    b.child.stdin.end();
    const code = await b.exited;
    const msgs = got.map((l) => JSON.parse(l));
    assert.deepEqual(msgs.map((m) => m.id), [7, "a", "c"], stale ? "stale endpoint" : "no endpoint");
    assert.ok(msgs[0].result?.serverInfo); assert.ok(msgs[1].result?.tools?.length > 0);
    assert.equal(msgs[2].error.code, -32000); assert.match(msgs[2].error.message, /^GeoStrix is not running, or AI App Access is switched off\./);
    assert.ok(secs < 8, `answered in ${secs.toFixed(1)} s`);
    assert.equal(code, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("#3925 the entry mcp-config gives: powershell.exe on the bundled script, every fuse left as it is, the script shipped in resources", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const m = read("../electron/main.js");
  assert.match(m, /const script = app\.isPackaged \? path\.join\(process\.resourcesPath, "mcp-bridge\.ps1"\) : path\.join\(app\.getAppPath\(\), "electron", "mcp-bridge\.ps1"\);/);
  assert.match(m, /command = "powershell\.exe", args = \["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script\]/);
  const winBranch = m.slice(m.indexOf('if (process.platform === "win32") {\n    const script'), m.indexOf("\n  }\n", m.indexOf('if (process.platform === "win32") {\n    const script')));
  assert.ok(winBranch.length > 100);
  assert.doesNotMatch(winBranch, /ELECTRON_RUN_AS_NODE|process\.execPath/, "the fuse stays off: nothing on Windows asks to run the exe as Node");
  const pkg = JSON.parse(read("../package.json"));
  assert.ok(pkg.build.extraResources.some((r) => r.from === "electron/mcp-bridge.ps1" && r.to === "mcp-bridge.ps1"));
  assert.deepEqual(pkg.build.electronFuses, { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true, grantFileProtocolExtraPrivileges: false }, "every fuse as it was");
  assert.match(read("../scripts/sign-release.ps1"), /Sign-File \(Join-Path \$app "resources\\mcp-bridge\.ps1"\)/);
});
