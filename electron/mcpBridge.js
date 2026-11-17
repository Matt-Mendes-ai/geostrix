"use strict";
// TASKS.csv #3190 — `GeoStrix.exe --mcp-bridge`: what an AI app (Claude Desktop, any MCP client) starts to talk to the running GeoStrix. It opens no window: it reads the pipe's name and the
// per-launch token from <userData>/mcp/endpoint.json (a user-only file, there only while AI App Access is switched on), connects, says the token, and then copies the client's lines (stdin) to
// GeoStrix and GeoStrix's lines (stdout) back. When GeoStrix is not running or the switch is off it still answers the client, with one error that says what to do, instead of dying silently.
const net = require("net");
const fs = require("fs");
const path = require("path");

const NOT_RUNNING = "GeoStrix is not running, or AI App Access is switched off. In GeoStrix open Tools > AI App Access, switch it on, then ask again.";

function readEndpoint(userDataDir) {
  try { const e = JSON.parse(fs.readFileSync(path.join(userDataDir, "mcp", "endpoint.json"), "utf8")); return typeof e?.pipe === "string" && typeof e?.token === "string" ? e : null; } catch { return null; }
}
// every line the client sends gets the same error answer (a notification gets none)
function answerErrors(stdin, stdout, message) {
  let buf = "";
  stdin.setEncoding("utf8");
  stdin.on("data", (c) => {
    buf += c; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m && m.id !== undefined && m.method) stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message } })}\n`);
    }
  });
}
function run({ userDataDir, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, exit = (c) => process.exit(c), connect = net.connect }) {
  const e = readEndpoint(userDataDir);
  const unavailable = () => { stderr.write(`${NOT_RUNNING}\n`); answerErrors(stdin, stdout, NOT_RUNNING); stdin.on("end", () => exit(1)); };
  if (!e) { unavailable(); return; }
  let up = false;
  const sock = connect(e.pipe);
  sock.on("connect", () => { up = true; sock.write(`GEOSTRIX-MCP ${e.token}\n`); stdin.pipe(sock); sock.pipe(stdout, { end: false }); });
  sock.on("error", () => { if (!up) unavailable(); else exit(1); });
  sock.on("close", () => { if (up) exit(0); });
  stdin.on("end", () => { try { sock.end(); } catch { /* closed */ } });
}

module.exports = { run, readEndpoint, NOT_RUNNING };
