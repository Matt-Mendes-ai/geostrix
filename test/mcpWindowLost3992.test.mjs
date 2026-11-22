// TASKS.csv #3992 (found live by side 3 on #3932 batch 2) — a change call the window never answered (it was reloaded in the middle) held the one-change-at-a-time lock until the host's
// 10-minute wait ran out, and every later change was told "Another change is still running". When the window reloads, navigates away, crashes or closes, every call waiting on it fails at
// once with a plain line, and the change lock is free. The window and the pipe here are stand-ins; the connection is a real pipe through the host.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHost } = require("../electron/mcpHost.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rpc = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gx-mcp3992-"));
  const store = { mcp: undefined }, seen = []; let host, answering = false;
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => { if (ch !== "mcp-request") return; seen.push(msg.name); if (answering) setImmediate(() => host.respond(msg.id, { ok: true, data: { changed: msg.name } })); } } };
  host = createHost({ userDataDir: dir, getWindow: () => win, askAllow: async () => "once", askNetwork: async () => true, isOnline: () => true, readPrefs: () => store, writePrefs: (p) => Object.assign(store, p), limits: { asyncAfterMs: 60, changeWaitMs: 150, progressEveryMs: 20 } });
  await host.setEnabled(true, false); host.setChanges(true);
  const ep = JSON.parse(fs.readFileSync(host._endpointFile, "utf8"));
  const sock = net.connect(ep.pipe); sock.setEncoding("utf8");
  const got = []; let buf = "";
  sock.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { got.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  await new Promise((r) => sock.on("connect", r));
  sock.write(`GEOSTRIX-MCP ${ep.token}\n${rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" } })}\n`);
  const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await sleep(10); return f(); };
  assert.ok(await until(() => got.some((m) => m.id === 1)));
  const call = (id, name, args = {}) => sock.write(`${rpc(id, "tools/call", { name, arguments: args })}\n`);
  return { host, seen, got, call, until, answer: (on) => { answering = on; }, done: () => { sock.destroy(); host.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test("#3992 a window that reloads fails the waiting call at once and frees the change lock", async () => {
  const t = await setup();
  t.call(2, "make_section", { along_hole: "DH-23-001" }); // the window never answers
  assert.ok(await t.until(() => t.seen.length === 1));
  const second = (() => { t.call(3, "make_section", { along_hole: "DH-23-002" }); return 3; })(); // queued behind the first
  await sleep(10);
  const started = await t.until(() => t.got.some((m) => m.id === 2)); // answered 'started' after asyncAfterMs: the call is a job now
  assert.ok(started);
  const job = JSON.parse(t.got.find((m) => m.id === 2).result.content[0].text);
  assert.equal(job.status, "started");
  assert.equal(t.host.windowLost("reloaded"), 1, "one call was waiting on the window");
  t.call(4, "job_status", { job_id: job.job_id });
  assert.ok(await t.until(() => t.got.some((m) => m.id === 4)));
  const j = JSON.parse(t.got.find((m) => m.id === 4).result.content[0].text);
  assert.equal(j.state, "failed"); assert.match(j.error, /^GeoStrix's window was reloaded before it answered, so this call cannot say whether it finished: check the project in GeoStrix\.$/);
  // the lock is free: the next change runs and is answered (the window answers again, as after a reload)
  t.answer(true);
  t.call(5, "make_section", { along_hole: "DH-23-003" });
  assert.ok(await t.until(() => t.got.some((m) => m.id === 5)));
  const r5 = t.got.find((m) => m.id === 5).result;
  assert.equal(r5.isError, false, r5.content[0].text); assert.doesNotMatch(r5.content[0].text, /Another change is still running/);
  void second;
  t.done();
});

test("#3992 the reasons are said plainly; nothing waiting means nothing to do; a late answer from the old window is ignored", async () => {
  const t = await setup();
  assert.equal(t.host.windowLost("reloaded"), 0);
  let id = 10;
  for (const [why, word] of [["reloaded", "was reloaded"], ["crashed", "stopped working"], ["closed", "was closed"], ["anything else", "was reloaded"]]) {
    id++; t.seen.length = 0;
    t.call(id, "colour_holes", { by: "none" });
    assert.ok(await t.until(() => t.seen.length === 1), "the call reached the window");
    assert.equal(t.host.windowLost(why), 1, why);
    assert.ok(await t.until(() => t.got.some((m) => m.id === id)), why);
    assert.match(t.got.find((m) => m.id === id).result.content[0].text, new RegExp(`window ${word} before it answered`), why);
  }
  assert.equal(t.host.respond(999, { ok: true }), false, "an answer to a request that already failed is ignored");
  t.done();
});

test("#3992 main.js tells the host: on a main-frame navigation (a reload), a renderer that dies, and the window closing; same-page navigation is not a reload", () => {
  const main = read("../electron/main.js");
  assert.match(main, /const mcpLost = \(why\) => \{ try \{ mcpHost\?\.windowLost\(why\); \}/);
  assert.match(main, /mainWindow\.webContents\.on\("did-start-navigation", \(e, url, inPlace, isMain\) => \{ if \(\(e\?\.isMainFrame \?\? isMain\) && !\(e\?\.isSameDocument \?\? inPlace\)\) mcpLost\("reloaded"\); \}\);/);
  assert.match(main, /mcpLost\("crashed"\); \/\/ #3992\n\s+const choice = dialog\.showMessageBoxSync/);
  assert.match(main, /mainWindow\.on\("closed", \(\) => \{\n\s+mcpLost\("closed"\); \/\/ #3992\n\s+mainWindow = null;/);
  const host = read("../electron/mcpHost.js");
  assert.match(host, /return \{ start, stop, setEnabled, setChanges, resumeIfRemembered, forgetClients, status, respond, callTool, windowLost,/);
});
