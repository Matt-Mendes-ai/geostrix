// TASKS.csv #1494 — how long the BUILT app takes to start on this computer: dist/ over app://, as an installed copy loads it.
// Each run spawns Electron on a scratch profile (never the user's) and times it from the spawn to the first frame painted
// with the ribbon in the page. The first run on a new profile is the cold one; the rest reuse it. Matt's target: 3 s.
//   npx vite build && node scripts/measure-startup.mjs [runs=5] [profileDir]
// Close other heavy programs first: a busy machine adds hundreds of ms. scripts/check-bundle-size.mjs keeps the
// startup JavaScript under the budget these measurements set.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = path.join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const runs = Number(process.argv[2]) || 5;
const profile = process.argv[3] || mkdtempSync(path.join(tmpdir(), "geostrix-startup-"));
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once() {
  const env = { ...process.env };
  delete env.NODE_ENV; // development would load the Vite server instead of dist/
  const t0 = performance.now();
  const child = spawn(exe, [".", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], { cwd: root, env, stdio: "ignore" });
  try {
    let page = null;
    while (!page && performance.now() - t0 < 60000) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page" && /^app:/.test(t.url)); } catch { /* not listening yet */ }
      if (!page) await sleep(25);
    }
    if (!page) throw new Error("the app page did not appear within 60 s");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0;
    const wait = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
    const evaluate = (expression) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } })); }).then((d) => d.result?.result?.value);
    // the ribbon's first tab button, then one animation frame so it has been painted
    const probe = `(() => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "3D View") ? new Promise((r) => requestAnimationFrame(() => r(true))) : false)()`;
    let ready = false;
    while (!ready && performance.now() - t0 < 60000) { ready = await evaluate(probe); if (!ready) await sleep(20); }
    ws.close();
    if (!ready) throw new Error("the ribbon did not appear within 60 s");
    return Math.round(performance.now() - t0);
  } finally {
    child.kill();
    await sleep(1500);
  }
}

const times = [];
for (let i = 0; i < runs; i++) times.push(await once());
const warm = times.slice(1).sort((a, b) => a - b);
console.log(`profile ${profile}`);
console.log(`cold (first run): ${times[0]} ms`);
if (warm.length) console.log(`warm: ${times.slice(1).join(", ")} ms — median ${warm[Math.floor(warm.length / 2)]} ms, worst ${warm.at(-1)} ms`);
