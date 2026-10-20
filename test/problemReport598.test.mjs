// TASKS.csv #598 — Help > Report a problem: what goes into the zip, and what doesn't.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProblemReport, problemReportEmail } from "../src/lib/problemReport.js";
import { readZipEntries } from "../src/lib/shapefile.js";

const dec = new TextDecoder();
const info = { app: "0.1.36", os: "Windows 11", packaged: true, memoryGB: 16, sidecarLogTail: "INFO started\nERROR gempy failed" };

test("#598 default report: text, system info, errors, picture and engine log — no project", async () => {
  const shot = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const { bytes, names, version } = buildProblemReport({ what: "  Grade shell froze  ", steps: "Ran it at 5 m", info, screenshot: shot, errors: [{ at: "t1", kind: "error", message: "boom", stack: "at x" }], project: { name: "Treaty", epsg: 26909 }, userAgent: "UA" });
  assert.equal(version, "0.1.36");
  assert.deepEqual(names, ["report.txt", "system-info.json", "recent-errors.txt", "window.png", "python-engine-log.txt"]);
  const z = await readZipEntries(bytes, /.*/);
  const report = dec.decode(z["report.txt"]);
  assert.match(report, /WHAT HAPPENED\nGrade shell froze\n/);
  assert.match(report, /Attached: window\.png, python-engine-log\.txt/);
  const sys = JSON.parse(dec.decode(z["system-info.json"]));
  assert.equal(sys.project, "Treaty"); assert.equal(sys.crs, 26909); assert.equal(sys.userAgent, "UA");
  assert.equal(sys.sidecarLogTail, undefined, "the log is its own file, opt-out-able — not duplicated in system-info");
  assert.match(dec.decode(z["recent-errors.txt"]), /error: boom\nat x/);
  assert.deepEqual([...z["window.png"]], [...shot]);
  assert.match(dec.decode(z["python-engine-log.txt"]), /gempy failed/);
  assert.equal(z["project.geostrix.json"], undefined);
});

test("#598 unticked items stay out; project and attachments only when given", async () => {
  const off = buildProblemReport({ what: "x", info, screenshot: new Uint8Array([1]), includeShot: false, includeLog: false, projectPayload: { collars: [1] } });
  assert.deepEqual(off.names, ["report.txt", "system-info.json", "recent-errors.txt"], "project payload ignored unless includeProject");
  const on = buildProblemReport({ what: "x", info: {}, includeProject: true, projectPayload: { collars: [{ id: "H1" }] }, files: [{ name: "clip.mp4", data: new Uint8Array([9, 9]) }], crashed: true });
  assert.deepEqual(on.names, ["report.txt", "system-info.json", "recent-errors.txt", "attachments/clip.mp4", "project.geostrix.json"]);
  const z = await readZipEntries(on.bytes, /.*/);
  assert.equal(JSON.parse(dec.decode(z["project.geostrix.json"])).collars[0].id, "H1");
  const report = dec.decode(z["report.txt"]);
  assert.match(report, /did not close normally/);
  assert.match(report, /Version: \?/);
  assert.match(dec.decode(z["recent-errors.txt"]), /No errors were recorded/);
});

test("#598 email text asks for the attachment and warns when too big", () => {
  const small = problemReportEmail({ what: "Crash", steps: "", version: "0.1.36", fileName: "GeoStrix-report-20261016-1200.zip", bytes: 1e6 });
  assert.equal(small.subject, "GeoStrix 0.1.36 — problem report");
  assert.match(small.body, /^Crash\n\n---\nPlease attach GeoStrix-report-20261016-1200\.zip/);
  assert.doesNotMatch(small.body, /too big/);
  const big = problemReportEmail({ what: "Crash", steps: "Opened it", version: "0.1.36", fileName: "r.zip", bytes: 45e6 });
  assert.match(big.body, /What I was doing:\nOpened it/);
  assert.match(big.body, /45 MB — too big/);
});
