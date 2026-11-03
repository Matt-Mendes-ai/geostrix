// TASKS.csv #471 — launch the PACKAGED app and prove it actually renders. Three releases shipped broken in
// ways only a real Windows build shows: v0.1.1 / v0.1.2 a blank window (dist/ never packaged), v0.1.19 stuck
// on the splash (a CRLF-changed inline script no longer matched its CSP hash). This starts the built exe with
// a DevTools port, waits for the main page, then asserts over the DevTools protocol that React mounted, the
// splash is gone and no script error was thrown. Usage: node scripts/smoke-electron.mjs <path-to-exe> [port]
// #1332 — a packaged exe refuses a DevTools port and another profile (#1265), which left this check red and blind from v0.1.87 to v0.1.89. So the PACKAGED app.asar, the files a user
// receives, is rendered by the plain Electron binary, which still takes those switches; the guard stays as it is. The packaged exe itself cannot be given a throwaway profile, so on CI
// only it is then started as it ships and has to stay running.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const exe = process.argv[2];
const port = Number(process.argv[3] || 9339);
if (!exe) { console.error("usage: node scripts/smoke-electron.mjs <exe> [port]"); process.exit(2); }
// A throwaway profile: the smoke run must never read or overwrite a real user's autosave / settings.
const profile = mkdtempSync(path.join(os.tmpdir(), "geostrix-smoke-"));
const appAsar = path.join(path.dirname(exe), "resources", "app.asar");
const electronBin = createRequire(import.meta.url)("electron"); // the npm package exports the path of its binary
const childEnv = { ...process.env };
delete childEnv.NODE_ENV; delete childEnv.ELECTRON_RUN_AS_NODE; // "development" would load the Vite server instead of the packaged files
// TASKS.csv #1344 — an installed copy lives under %LOCALAPPDATA%, which the file guard protects; from v0.1.87 to v0.1.93 no sample opened and this
// check, run from a build folder, could not see it. The package's folder stands in for LOCALAPPDATA, so its samples sit where an install's do.
childEnv.LOCALAPPDATA = path.dirname(exe); // its temp folder is a fresh one: the guard lets Temp through, and a build sitting in Temp would hide the bug
childEnv.TEMP = childEnv.TMP = mkdtempSync(path.join(profile, "tmp-"));
let child = spawn(electronBin, [appAsar, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: ["ignore", "pipe", "pipe"], env: childEnv });
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}\n--- app output ---\n${log.slice(-3000)}`); finish(1); };
let done = false;
function finish(code) {
  if (done) return; done = true;
  try { child.kill(); } catch (_) { /* already gone */ }
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* locked; temp */ } process.exit(code); }, 1500);
}
child.on("exit", (c) => { if (!done) fail(`the app exited early (code ${c})`); });

async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("DevTools socket failed")); });
  const out = await new Promise((res) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  return out?.result?.value;
}

let page = null;
for (let i = 0; i < 60 && !page; i++) { // up to ~60 s: a cold CI runner is slow to start Electron
  await wait(1000);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = list.find((p) => p.type === "page" && /index\.html/.test(p.url));
  } catch (_) { /* not listening yet */ }
}
if (!page) fail("no app page appeared on the DevTools port within 60 s");
else {
  // give the renderer up to 20 s to mount and hide the splash
  let state = null;
  for (let i = 0; i < 20; i++) {
    state = await evaluate(page.webSocketDebuggerUrl, `(() => ({
      root: document.getElementById("root")?.children.length || 0,
      splash: !!document.getElementById("splash"),
      text: document.body.innerText.slice(0, 200),
      desktop: !!window.desktop,
      crashed: /GeoStrix crashed|Something went wrong/i.test(document.body.innerText),
    }))()`).catch(() => null);
    if (state && state.root > 0 && !state.splash) break;
    await wait(1000);
  }
  console.log("state:", JSON.stringify(state));
  if (!state) fail("could not evaluate in the page");
  else if (!state.root) fail("React never mounted (#root is empty) — a blank window");
  else if (state.splash) fail("the splash screen never went away");
  else if (!state.desktop) fail("window.desktop (the preload bridge) is missing");
  else if (state.crashed) fail(`the app shows an error screen: ${state.text}`);
  else if (!/3D View/.test(state.text)) fail(`unexpected first screen: ${state.text}`);
  else {
    console.log("SMOKE OK: the packaged app renders.");
    // #1344 — a bundled sample file reads through the same guard a user's click goes through
    const sample = await evaluate(page.webSocketDebuggerUrl, `(async () => { const p = await window.desktop.sampleDataPath(); if (!p.ok) return "no sample folder: " + p.error; const sep = p.path.includes("\\\\") ? "\\\\" : "/"; const r = await window.desktop.fsReadFile(p.path + sep + "harry_property" + sep + "collars.csv"); return r.ok ? "ok " + (r.data?.length || r.data?.byteLength || 0) : r.error; })()`).catch((e) => String(e));
    console.log("sample:", sample);
    const samplesOk = /^ok [1-9]/.test(String(sample));
    if (samplesOk) console.log("SMOKE OK: the bundled samples read from inside a protected folder.");
    if (!samplesOk) fail(`a bundled sample cannot be read: ${sample}`);
    else if (!process.env.CI) finish(0);
    else {
      // never outside CI: with no profile switch allowed, this would open the real profile of whoever ran it
      done = true; child.kill(); await wait(1500); done = false;
      child = spawn(exe, [], { stdio: "ignore" });
      child.on("exit", (c) => { if (!done) fail(`the packaged exe exited early (code ${c})`); });
      await wait(20000);
      if (!done) { console.log("SMOKE OK: the packaged exe starts and stays running."); finish(0); }
    }
  }
}
