// TASKS.csv #1042 — saveFile never throws and announces each export's result (shown by App's ExportToast), unless the
// caller reports it: quiet true (nothing announced) or "success" (a failure is still announced)
import test from "node:test";
import assert from "node:assert/strict";

const events = [];
let next = null;
globalThis.window = {
  desktop: { isDesktop: true, saveFile: async () => { const r = next; if (r instanceof Error) throw r; return r; } },
  dispatchEvent: (e) => { events.push(e.detail); return true; },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { saveFile } = await import("../src/lib/desktop.js");

test("#1042 a written file is announced with its path; a cancel is not; a rejected write becomes { ok: false, error } and is announced", async () => {
  events.length = 0;
  next = { ok: true, filePath: "C:\\out\\a.csv" };
  assert.deepEqual(await saveFile({ suggestedName: "a.csv", content: "x" }), next);
  next = { ok: false }; // cancelled in the dialog
  await saveFile({ suggestedName: "b.csv", content: "x" });
  next = new Error("EBUSY: resource busy or locked");
  const r = await saveFile({ suggestedName: "c.csv", content: "x" });
  assert.equal(r.ok, false); assert.match(r.error, /EBUSY/);
  assert.deepEqual(events.map((e) => [e.ok, e.name]), [[true, "a.csv"], [false, "c.csv"]]);
  assert.equal(events[0].filePath, "C:\\out\\a.csv");
});

test("#1042 quiet: true announces nothing; quiet: 'success' still announces a failure", async () => {
  events.length = 0;
  next = { ok: true, filePath: "x" }; await saveFile({ suggestedName: "q1", quiet: true });
  next = { ok: false, error: "locked" }; await saveFile({ suggestedName: "q2", quiet: true });
  next = { ok: true, filePath: "y" }; await saveFile({ suggestedName: "s1", quiet: "success" });
  next = { ok: false, error: "locked" }; await saveFile({ suggestedName: "s2", quiet: "success" });
  assert.deepEqual(events.map((e) => e.name), ["s2"]);
});

test("#1097 an exported CSV starts with a UTF-8 BOM (once); other files and binary content do not", async () => {
  const sent = [];
  globalThis.window.desktop.saveFile = async (o) => { sent.push(o.content); return { ok: true, filePath: o.suggestedName }; };
  await saveFile({ suggestedName: "a.csv", content: "x,y" });
  await saveFile({ suggestedName: "b.CSV", content: "﻿x,y" });
  await saveFile({ suggestedName: "c.kml", content: "<kml/>" });
  await saveFile({ suggestedName: "d.csv", content: "QUJD", encoding: "base64" });
  assert.deepEqual(sent, ["﻿x,y", "﻿x,y", "<kml/>", "QUJD"]);
});
