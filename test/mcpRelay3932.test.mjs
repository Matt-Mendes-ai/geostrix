// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the change tools end to end, started EXACTLY as Claude Desktop starts the server (powershell.exe on electron/mcp-bridge.ps1
// with the entry's environment, stdio pipes) against the real host on a real pipe. Every change tool is called with 'Allow AI apps to make changes' off (each refused before
// the window, with what to do) and then on (each done through lib/mcpActions.js on a made-up project, with stand-in panes for the module tools and a 'yes' to the download
// box; no network). Windows only (PowerShell), as test/mcpBridgePs3925.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { runChange } from "../src/lib/mcpActions.js";
import { runTool } from "../src/lib/mcpTools.js";
import { viewAction } from "../src/modules/viewer/useMcpViewActions.js";

const require = createRequire(import.meta.url);
const { createHost } = require("../electron/mcpHost.js");
const proto = require("../electron/mcpProtocol.js");
const SCRIPT = decodeURIComponent(new URL("../electron/mcp-bridge.ps1", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const win32 = process.platform === "win32";
const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: "2.0", id, method, params });

// a made-up project with the store functions the actions call
function project() {
  const s = {
    project: { name: "Test project", epsg: 26909, crsSet: true }, desurveyMethod: "minimum_curvature",
    collars: [{ hole_id: "DH-23-001", x: 1000, y: 2000, z: 300, azimuth: 0, dip: -90, length: 100, attrs: { Type: "DD" } }, { hole_id: "DH-23-002", x: 1100, y: 2000, z: 305, azimuth: 90, dip: -60, length: 80, attrs: { Type: "RC" } }],
    survey: [], assayElements: [{ symbol: "Au", unit: "ppm" }],
    assays: [[0, 1, 0.5], [1, 2, 2], [2, 3, 3]].map(([from, to, Au]) => ({ hole_id: "DH-23-001", from, to, values: { Au } })),
    layers: { litho: [{ hole_id: "DH-23-001", from: 0, to: 2, value: "AND" }] }, sections: [], codeDictionary: {},
    layoutPages: [{ id: "p1", name: "Page 1", elements: [] }], activeLayoutPageId: "p1", rasters: [], terrain: null,
  };
  Object.assign(s, {
    undoCheckpoint: () => {}, goToModule: () => {}, setLayoutPageFormat: () => {},
    upsertSection: (x) => { s.sections = [...s.sections, x]; }, deleteSection: (id) => { s.sections = s.sections.filter((x) => x.id !== id); },
    addLayoutPages: (pages) => { const ids = pages.map((_, i) => `new_${i}`); s.layoutPages = [...s.layoutPages, ...pages.map((p, i) => ({ ...p, id: ids[i] }))]; return ids; },
    deleteLayoutPage: () => {}, removeRaster: () => {}, removeTerrain: () => {},
  });
  return s;
}
// the panes that answer the module tools (Layout's makeSheet, StrixViewer, Maps' fetches), as their useModuleAction handlers do
function standInPanes(s) {
  if (!globalThis.window) globalThis.window = new EventTarget();
  const v = { collars: s.collars, layers: s.layers, assayElements: s.assayElements, terrain: null, sections: s.sections, holeColourBy: "", layerVisible: {}, assayVisible: false, assayDisplayElements: [],
    camState: { current: { theta: 0, phi: 1, radius: 100, target: null } }, cameraRef: { current: { __update() {} } }, fitButton() {}, zoomToHole() {}, reopenSection() {}, updateTerrain() {} };
  const set = (k) => (fn) => { v[k] = typeof fn === "function" ? fn(v[k]) : fn; };
  Object.assign(v, { setHoleColourBy: set("holeColourBy"), setLayerVisible: set("layerVisible"), setAssayVisible: set("assayVisible"), setAssayDisplayElements: set("assayDisplayElements"), toggleAssayElement: (x) => { v.assayDisplayElements = [...v.assayDisplayElements, x]; } });
  const on = (e) => {
    const { action, payload: p } = e.detail;
    if (action === "mcp-make-sheet") p.reply({ ok: true, name: "Plan map", ids: ["pm"] });
    else if (action === "mcp-view") p.reply(viewAction({ ...v, sections: s.sections }, p));
    else if (action === "mcp-fetch-satellite") p.reply({ ok: true, name: "Sentinel-2 test scene", ids: ["r1"], pictures: 1, over: "holes", area_cloud_percent: 0 });
    else if (action === "mcp-fetch-terrain") p.reply({ ok: true, name: "Copernicus DEM GLO-30", id: "t1", grid: "10 x 10" });
  };
  window.addEventListener("geostrix-module-action", on);
  return () => window.removeEventListener("geostrix-module-action", on);
}

const CALLS = [ // each change tool with arguments its schema accepts
  ["make_section", { from: { x: 1000, y: 1900 }, to: { x: 1000, y: 2100 }, name: "B-B" }],
  ["make_sheet", { kind: "plan" }],
  ["add_best_intercepts", { element: "Au", cutoff: 1 }],
  ["colour_holes", { by: "field", name: "Type" }],
  ["show_layers", { layers: ["litho"], visible: true }],
  ["set_view", { view: "top" }],
  ["fetch_satellite_image", { max_cloud_percent: 20 }],
  ["fetch_terrain", {}],
];

test("#3932 through the PowerShell relay, as Claude Desktop starts it: every change tool refused with the switch off (the window never sees one), then each done with it on", { skip: !win32 && "PowerShell bridge: Windows only" }, async () => {
  assert.deepEqual(CALLS.map((c) => c[0]).sort(), proto.TOOLS.filter(proto.isChangeTool).map((t) => t.name).sort(), "every change tool is called here");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gx mcp 3932 ")), s = project(), off = standInPanes(s), seen = [], asked = [];
  let host;
  const win = { isDestroyed: () => false, webContents: { send: (ch, msg) => {
    if (ch !== "mcp-request") return;
    seen.push([msg.name, !!msg.change]);
    (msg.change ? runChange(msg.name, msg.args, { getStore: () => s, client: msg.client, settle: async () => {} }) : Promise.resolve(runTool(msg.name, msg.args, s))).then((r) => host.respond(msg.id, r));
  } } };
  const prefs = {};
  host = createHost({ userDataDir: dir, getWindow: () => win, askAllow: async (c, o) => { asked.push(["allow", o?.changes ? "changes" : "read"]); return "once"; }, askNetwork: async (c, t) => { asked.push(["download", t]); return true; }, isOnline: () => true, readPrefs: () => prefs, writePrefs: (p) => Object.assign(prefs, p) });
  try {
    assert.ok((await host.setEnabled(true, false)).ok);
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT], { env: { ...process.env, GEOSTRIX_USER_DATA: dir }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks = []; child.stdout.on("data", (c) => chunks.push(c));
    const exited = new Promise((res) => child.on("exit", (code) => res(code)));
    const lines = () => Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const waitFor = async (n, ms = 20000) => { const end = Date.now() + ms; while (lines().length < n && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); assert.ok(lines().length >= n, `${lines().length} of ${n} answers`); return lines(); };
    let id = 1, n = 0;
    const send = (method, params) => { child.stdin.write(`${rpc(id++, method, params)}\n`); n++; };
    send("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" }, capabilities: {} });
    await waitFor(n);
    send("tools/list");
    const listed = (await waitFor(n)).at(-1).result.tools.map((t) => t.name);
    for (const [name] of CALLS) assert.ok(listed.includes(name), `${name} listed while off`);
    // the switch off: each refused with what to do; a read still works
    for (const [name, args] of CALLS) send("tools/call", { name, arguments: args });
    send("tools/call", { name: "project_summary", arguments: {} });
    const offAnswers = (await waitFor(n)).slice(-CALLS.length - 1);
    offAnswers.slice(0, -1).forEach((a, i) => { assert.equal(a.result.isError, true, CALLS[i][0]); assert.equal(a.result.content[0].text, proto.CHANGES_OFF, CALLS[i][0]); });
    assert.equal(offAnswers.at(-1).result.isError, false);
    assert.deepEqual(seen, [["project_summary", false]], "no change reached the window while off");
    assert.deepEqual(asked, [["allow", "read"]]);
    // on: the app is asked once about changes, each download is asked for, each tool done with a short answer
    assert.ok(host.setChanges(true).ok);
    for (const [name, args] of CALLS) send("tools/call", { name, arguments: args });
    child.stdin.end();
    const onAnswers = (await waitFor(n, 30000)).slice(-CALLS.length);
    onAnswers.forEach((a, i) => {
      assert.equal(a.result.isError, false, `${CALLS[i][0]}: ${a.result.content[0].text}`);
      const d = JSON.parse(a.result.content[0].text);
      assert.equal(d.ok, true, CALLS[i][0]); assert.ok(d.changed, CALLS[i][0]);
      assert.ok(a.result.content[0].text.length < 400, `${CALLS[i][0]}: a short answer`);
    });
    assert.deepEqual(asked, [["allow", "read"], ["allow", "changes"], ["download", "fetch_satellite_image"], ["download", "fetch_terrain"]]);
    assert.deepEqual(seen.slice(1), CALLS.map(([name]) => [name, true]));
    assert.equal(s.sections.at(-1).name, "B-B"); assert.equal(s.layoutPages.at(-1).name, "Best intercepts");
    assert.equal(await exited, 0);
    assert.equal(host.status().activity.filter((a) => a.change && a.ok).length, CALLS.length);
  } finally { off(); host.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
