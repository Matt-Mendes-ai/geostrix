// TASKS.csv #471 — launch the PACKAGED app and prove it actually renders. Three releases shipped broken in
// ways only a real Windows build shows: v0.1.1 / v0.1.2 a blank window (dist/ never packaged), v0.1.19 stuck
// on the splash (a CRLF-changed inline script no longer matched its CSP hash). This starts the built exe with
// a DevTools port, waits for the main page, then asserts over the DevTools protocol that React mounted, the
// splash is gone and no script error was thrown. Usage: node scripts/smoke-electron.mjs <path-to-exe> [port]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const exe = process.argv[2];
const port = Number(process.argv[3] || 9339);
if (!exe) { console.error("usage: node scripts/smoke-electron.mjs <exe> [port]"); process.exit(2); }
// A throwaway profile: the smoke run must never read or overwrite a real user's autosave / settings.
const profile = mkdtempSync(path.join(os.tmpdir(), "geostrix-smoke-"));
const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: ["ignore", "pipe", "pipe"] });
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
  else { console.log("SMOKE OK: the packaged app renders."); finish(0); }
}
