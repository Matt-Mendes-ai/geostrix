// TASKS.csv #3100 — a downloaded BC sample converted off the main process (Harry's database join takes ~35 s, Silvertip's tables ~7 s;
// on the main process the window would stop answering). workerData: { id, zipPath, userRoot, tmpDir } -> { ok, files, source } | { ok: false, error }
"use strict";
const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const { convertDownload } = require("./sampleSources.js");
try {
  const { id, zipPath, userRoot, tmpDir } = workerData;
  const r = convertDownload(id, fs.readFileSync(zipPath), userRoot, tmpDir);
  parentPort.postMessage({ ok: true, ...r });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e?.message || String(e) });
}
