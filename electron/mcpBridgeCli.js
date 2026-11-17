"use strict";
// TASKS.csv #3190 — what an AI app (Claude Desktop, any MCP client) starts to reach the running GeoStrix: the GeoStrix executable run AS NODE (ELECTRON_RUN_AS_NODE=1) on this file. Checked live: a
// GeoStrix.exe started normally by another program gets an immediate end of input on stdin (it is a Windows GUI-subsystem program), so a `--mcp-bridge` switch on the application itself cannot read the client's
// requests; run as Node it has ordinary stdin / stdout and none of Chromium's start-up noise on stdout. The Settings > AI App Access box gives the whole entry (command, this file, the environment).
// GEOSTRIX_USER_DATA names the folder holding mcp/endpoint.json (GeoStrix's user-data folder, which the box writes into the entry); without it the usual place for the platform is tried.
const os = require("os");
const path = require("path");
const { run } = require("./mcpBridge.js");

function defaultUserData() {
  const home = os.homedir();
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "GeoStrix");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "GeoStrix");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "GeoStrix");
}
if (require.main === module) run({ userDataDir: process.env.GEOSTRIX_USER_DATA || defaultUserData() });
module.exports = { defaultUserData };
