// TASKS.csv #743 — drive a running GeoStrix window over the DevTools protocol: the verification harness this repo
// actually uses (there is no Playwright here). Start the app with a DevTools port and a throwaway profile, e.g.
//   npx vite --port 5173            (dev only; leave it running)
//   NODE_ENV=development npx electron . --remote-debugging-port=9333 --user-data-dir=<scratch folder>
// (unset NODE_ENV to load dist/ over app://, as an installed copy does), then:
//   node scripts/drive-electron.mjs eval "document.title"
//   node scripts/drive-electron.mjs click 640,360          (mouse click at x,y)
//   node scripts/drive-electron.mjs key Shift+F10          (real key events: F10, ArrowDown/Up, Home, End, Enter, Escape, Tab, ContextMenu)
//   node scripts/drive-electron.mjs type "some text"
//   node scripts/drive-electron.mjs file "input[type=file]" C:\path\to\file.csv
//   node scripts/drive-electron.mjs accept                 (accept a window.confirm / alert, which otherwise freezes the page)
//   node scripts/drive-electron.mjs front                  (bring the window forward: a hidden window throttles timers and rAF)
//   node scripts/drive-electron.mjs shot out.png
// CDP_VIEWPORT=1024x700 emulates that window size during the command. CDP_PORT (default 9333) picks the port; CDP_HASH targets a window by its #/route (e.g. "section" for a section window).
// Git Bash rewrites an argument starting with \\ or //: build such strings inside the page (String.fromCharCode(92)).
import fs from "node:fs";

const port = Number(process.env.CDP_PORT || 9333);
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((p) => p.type === "page" && !p.url.startsWith("devtools") && p.url.endsWith("#/" + (process.env.CDP_HASH || "")));
if (!page) { console.error(`no GeoStrix page on port ${port}${process.env.CDP_HASH ? ` with #/${process.env.CDP_HASH}` : ""}`); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });

const KEYS = { F10: 121, ArrowDown: 40, ArrowUp: 38, Escape: 27, Enter: 13, Tab: 9, ContextMenu: 93, Home: 36, End: 35 };
const [cmd, arg, arg2] = process.argv.slice(2);
// CDP_VIEWPORT=1024x700: emulate that window size for THIS command (an emulation lasts only while the session is attached)
if (process.env.CDP_VIEWPORT) {
  const [width, height] = process.env.CDP_VIEWPORT.split("x").map(Number);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 300)); // let layout settle
}
if (cmd === "eval") {
  const r = await send("Runtime.evaluate", { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r, null, 1));
} else if (cmd === "click") {
  const [x, y] = arg.split(",").map(Number);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  console.log("clicked", x, y);
} else if (cmd === "key") {
  const parts = arg.split("+"), key = parts.pop();
  const modifiers = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Ctrl") ? 2 : 0) | (parts.includes("Shift") ? 8 : 0);
  const vk = KEYS[key] ?? key.toUpperCase().charCodeAt(0);
  for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  if (key === "Enter") await send("Input.dispatchKeyEvent", { type: "char", text: String.fromCharCode(13), modifiers });
  console.log("key", arg);
} else if (cmd === "type") {
  await send("Input.insertText", { text: arg });
  console.log("typed", arg);
} else if (cmd === "file") {
  const doc = await send("DOM.getDocument", {});
  const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: arg });
  const r = await send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [arg2] });
  console.log("file", JSON.stringify(r.result || r.error));
} else if (cmd === "accept") {
  console.log(JSON.stringify(await send("Page.handleJavaScriptDialog", { accept: true })));
} else if (cmd === "front") {
  console.log(JSON.stringify(await send("Page.bringToFront")));
} else if (cmd === "shot") {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(arg, Buffer.from(r.result.data, "base64"));
  console.log("saved", arg);
} else {
  console.error("commands: eval | click | key | type | file | accept | front | shot");
  process.exitCode = 2;
}
ws.close();
