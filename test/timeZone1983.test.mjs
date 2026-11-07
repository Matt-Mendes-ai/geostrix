// TASKS.csv #1983 — in British Columbia every time the app printed was an hour behind Windows: the bundled ICU has BC's UTC-7 rule
// (America/Vancouver) but cannot map Windows' 'British Columbia Standard Time', so Date fell back to the zone's base offset, UTC-8
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { zoneOverride, ianaForWindowsZone, applyToWebContents } = createRequire(import.meta.url)("../electron/timeZoneFix.js");

test("only an unresolved Windows zone that is listed is forced", () => {
  const bc = () => "British Columbia Standard Time\r\n";
  assert.equal(zoneOverride({ platform: "win32", resolved: undefined, readWindowsZone: bc }), "America/Vancouver");
  assert.equal(zoneOverride({ platform: "win32", resolved: "America/Vancouver", readWindowsZone: bc }), null); // the ICU maps it: leave it
  assert.equal(zoneOverride({ platform: "darwin", resolved: undefined, readWindowsZone: bc }), null);
  assert.equal(zoneOverride({ platform: "win32", resolved: undefined, readWindowsZone: () => "Mars Standard Time" }), null);
  assert.equal(zoneOverride({ platform: "win32", resolved: undefined, readWindowsZone: () => { throw new Error("no tzutil"); } }), null);
  assert.equal(ianaForWindowsZone("  British Columbia Standard Time "), "America/Vancouver");
});

test("America/Vancouver in this ICU is UTC-7 after the November change (BC's permanent daylight time)", () => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", timeZoneName: "longOffset" });
  const off = f.formatToParts(new Date("2026-11-06T12:00:00Z")).find((p) => p.type === "timeZoneName")?.value;
  assert.ok(off === "GMT-07:00" || off === "GMT-08:00", off); // Node's own ICU may be older than Electron's (2026b vs 2026d)
});

test("each window gets Chromium's override; failures are swallowed", () => {
  const sent = [];
  const contents = { debugger: { isAttached: () => false, attach: () => {}, sendCommand: (m, p) => { sent.push([m, p]); return Promise.resolve(); } } };
  assert.equal(applyToWebContents(contents, "America/Vancouver"), true);
  assert.deepEqual(sent, [["Emulation.setTimezoneOverride", { timezoneId: "America/Vancouver" }]]);
  assert.equal(applyToWebContents({ debugger: { isAttached: () => false, attach: () => { throw new Error("busy"); } } }, "America/Vancouver"), false);
  assert.equal(applyToWebContents(contents, null), false);
  const m = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(m, /const FORCED_TIME_ZONE = zoneOverride\(\);\nif \(FORCED_TIME_ZONE\) process\.env\.TZ = FORCED_TIME_ZONE;/);
  assert.match(m, /if \(FORCED_TIME_ZONE\) applyToWebContents\(contents, FORCED_TIME_ZONE\);/);
});
