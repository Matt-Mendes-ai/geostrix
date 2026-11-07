// TASKS.csv #1994 — a lidar file read off the UI thread: 10.6 million LAZ points take laz-perf 8-9 s to decode on a desktop.
// The worker gets the File itself (structured-cloned, not copied) and reads it a slice at a time.
import createLazPerf from "laz-perf/lib/worker/laz-perf.js";
import lazWasmUrl from "laz-perf/lib/worker/laz-perf.wasm?url";
import { inspectLidar, readLidar, fileSource } from "./lidar.js";

let lazPerf = null;
self.onmessage = async (e) => {
  const { file, opts } = e.data;
  try {
    const src = fileSource(file);
    const info = await inspectLidar(src);
    if (info.kind !== "LAS" && !lazPerf) lazPerf = await createLazPerf({ locateFile: () => lazWasmUrl });
    let last = 0;
    const res = await readLidar(src, info, opts, { lazPerf, onProgress: (f) => { const now = Date.now(); if (now - last > 200) { last = now; self.postMessage({ progress: f }); } } });
    const c = res.cloud, g = res.grid;
    // typed arrays copied out of their (oversized) buffers, then transferred
    const cloud = { ...c, x: c.x.slice(), y: c.y.slice(), z: c.z.slice(), intensity: c.intensity.slice(), cls: c.cls.slice() };
    self.postMessage({ res: { ...res, cloud } }, [cloud.x.buffer, cloud.y.buffer, cloud.z.buffer, cloud.intensity.buffer, cloud.cls.buffer, g.gSum.buffer, g.gCount.buffer, g.low.buffer]);
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
