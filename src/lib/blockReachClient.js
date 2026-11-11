// TASKS.csv #1579 — UI side of the reach worker: one worker for the dialog's life, the newest request wins (an older answer is dropped),
// and the same code runs here when no worker can start.
import { reachSummary } from "./blockReach.js";
import { reachArgsWithSolid } from "./reachSolid.js"; // TASKS.csv #2422

export function makeReachClient() {
  let worker = null, nextId = 0, sentSolid = null; // sentSolid: the key of the solid mesh this worker already holds (#2422)
  const pending = new Map(), newest = new Map(); // newest: channel -> id of its latest request (#2636)
  const start = () => {
    if (worker || typeof Worker === "undefined") return worker;
    try { worker = new Worker(new URL("./blockReach.worker.js", import.meta.url), { type: "module" }); } catch { worker = null; return null; }
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.failed) p.reject(new Error(e.data.failed)); else p.resolve(e.data.result); };
    worker.onerror = (e) => { e.preventDefault?.(); const all = [...pending.values()]; pending.clear(); worker?.terminate(); worker = null; sentSolid = null; all.forEach((p) => { try { p.resolve(reachSummary(reachArgsWithSolid(p.args))); } catch (err) { p.reject(err); } }); };
    return worker;
  };
  // #2422 — a restricting solid's mesh goes to the worker once per solid; later requests name it by key (the worker keeps the last)
  const lean = (args) => { if (!args?.solid) return args; if (sentSolid === args.solid.key) return { ...args, solid: { key: args.solid.key } }; sentSolid = args.solid.key; return args; };
  return {
    // -> Promise of reachSummary's result; `latest()` says whether this is still the newest request OF ITS CHANNEL when it resolves.
    // TASKS.csv #2636 — one counter for every request made the dialog's 10 m cell-fit request (#1570) supersede the block count sent
    // just before it: the count's answer came back 'not latest' and was dropped, no new count was asked for (its key had not
    // changed), so the dialog kept 'counting' and Run stayed disabled with the CPU idle. Each kind of question now has its own newest.
    request(args, channel = "count") {
      const id = ++nextId;
      newest.set(channel, id);
      const w = start();
      const promise = w ? new Promise((resolve, reject) => { pending.set(id, { resolve, reject, args }); w.postMessage({ id, args: lean(args) }); }) : new Promise((resolve) => resolve(reachSummary(reachArgsWithSolid(args))));
      return { promise, latest: () => newest.get(channel) === id };
    },
    stop() { worker?.terminate(); worker = null; sentSolid = null; pending.clear(); },
  };
}
