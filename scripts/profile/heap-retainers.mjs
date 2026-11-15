// TASKS.csv #3464 — node scripts/profile/heap-retainers.mjs (the app started with --remote-debugging-port=9741 --js-flags=--expose-gc on a scratch profile; run node with --max-old-space-size=6000): builds a 120k-row project in the test Electron, reprojects it 3 times (generation tags on each rows array's first row),
// takes a heap snapshot over CDP, and prints the retainer path of every old generation's rows array to a GC root.
import fs from "node:fs";
const port = 9741;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((p) => p.type === "page" && !p.url.startsWith("devtools") && p.url.endsWith("#/"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map(); const chunks = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "HeapProfiler.addHeapSnapshotChunk") chunks.push(d.params.chunk); else if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (code) => { const r = await send("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails; };
// the page needs a window.__S() that returns the store (the value with setLayers / reprojectProjectTo): find it in the React tree, as the test drivers do
const prelude = `window.__S = window.__S || function () { const rootEl = document.getElementById("root"); const key = Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$")); let stack = [rootEl[key]], seen = 0; while (stack.length && seen < 200000) { const f = stack.pop(); seen++; if (!f) continue; const v = f.memoizedProps && f.memoizedProps.value; if (v && typeof v === "object" && typeof v.addVoxelModel === "function" && typeof v.setCollars === "function") return v; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } return null; };`;
const setup = `${prelude}\n(async () => { const st = __S(); const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = []; for (let h = 0; h < 1000; h++) for (let d = 0; d < 120; d++) rows.push({ hole_id: 'H' + h, depth: d * 0.25, value: 0.02 + ((h + d) % 50) / 1000 });
  st.setCollars([{ hole_id: 'H0', x: 500000, y: 7500000, z: 600, depth: 30, dip: -90, azimuth: 0 }]);
  st.setLayers((p) => ({ ...p, magsusc: rows })); await w(1500);
  const tag = (n) => { const r = __S().layers.magsusc; if (r && r[0]) r[0].__gen = 'GEN' + n; };
  tag(0);
  for (let n = 1; n <= 3; n++) { await __S().reprojectProjectTo(n % 2 ? 28351 : 28350, { rotateAzimuths: true }); await w(2000); tag(n); }
  for (let i = 0; i < 4; i++) { window.gc(); await w(400); }
  return Math.round(performance.memory.usedJSHeapSize / 1048576); })()`;
console.log("heap MB after setup:", await evalJs(setup));
await send("HeapProfiler.enable");
await send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
const snap = JSON.parse(chunks.join(""));
console.log("snapshot nodes:", snap.snapshot.node_count);
const nf = snap.snapshot.meta.node_fields, ef = snap.snapshot.meta.edge_fields, NF = nf.length, EF = ef.length;
const nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
const tn = nf.indexOf("type"), nn = nf.indexOf("name"), ec = nf.indexOf("edge_count"), sz = nf.indexOf("self_size");
const et = ef.indexOf("type"), en = ef.indexOf("name_or_index"), eto = ef.indexOf("to_node");
const nodeTypes = snap.snapshot.meta.node_types[0], edgeTypes = snap.snapshot.meta.edge_types[0];
const N = snap.snapshot.node_count;
const firstEdge = new Uint32Array(N + 1); for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += nodes[i * NF + ec]; } firstEdge[N] = edges.length / EF;
// reverse edges
const retCount = new Uint32Array(N + 1);
for (let i = 0; i < N; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e++) { const t = edgeTypes[edges[e * EF + et]]; if (t === "weak") continue; retCount[edges[e * EF + eto] / NF]++; }
const retStart = new Uint32Array(N + 1); for (let i = 0; i < N; i++) retStart[i + 1] = retStart[i] + retCount[i];
const retFrom = new Uint32Array(retStart[N]), retEdge = new Uint32Array(retStart[N]), fill = new Uint32Array(N);
for (let i = 0; i < N; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e++) { const t = edgeTypes[edges[e * EF + et]]; if (t === "weak") continue; const to = edges[e * EF + eto] / NF; const k = retStart[to] + fill[to]++; retFrom[k] = i; retEdge[k] = e; }
const nodeName = (i) => `${nodeTypes[nodes[i * NF + tn]]}:${strings[nodes[i * NF + nn]]}`.slice(0, 80);
const edgeName = (e) => { const t = edgeTypes[edges[e * EF + et]], v = edges[e * EF + en]; return t === "element" || t === "hidden" ? `[${v}]` : strings[v]; };
// find the strings GEN0..GEN3 -> nodes (string nodes) -> their retainers = the row object's property -> the row object -> the array
const gens = [0, 1, 2, 3].map((g) => strings.indexOf("GEN" + g));
const rootsOf = new Set(); // GC roots: nodes whose retainers include the synthetic root (index 0)
const out = [];
for (let g = 0; g < 4; g++) {
  if (gens[g] < 0) { out.push(`GEN${g}: not in snapshot (collected)`); continue; }
  const start = []; for (let i = 0; i < N; i++) if (nodes[i * NF + nn] === gens[g] && nodeTypes[nodes[i * NF + tn]] !== "hidden") start.push(i);
  // BFS backwards from the string node to the root
  const prev = new Map(); const q = []; for (const s of start) { prev.set(s, null); q.push(s); }
  let found = null;
  for (let qi = 0; qi < q.length && !found; qi++) {
    const n = q[qi];
    if (n === 0) { found = n; break; }
    for (let k = retStart[n]; k < retStart[n + 1]; k++) { const f = retFrom[k]; if (prev.has(f)) continue; prev.set(f, { to: n, e: retEdge[k] }); if (f === 0) { found = 0; break; } q.push(f); }
  }
  if (found === null) { out.push(`GEN${g}: no path to root (${start.length} string nodes)`); continue; }
  const path = []; let cur = 0;
  while (prev.get(cur)) { const p = prev.get(cur); path.push(`${nodeName(cur)} --${edgeName(p.e)}-->`); cur = p.to; }
  out.push(`GEN${g}: ` + path.slice(0, 30).join("\n    ") + "\n    " + nodeName(cur));
}
console.log(out.join("\n\n"));
ws.close();
