// TASKS.csv #1983 — every time the app printed was one hour behind Windows in British Columbia (4:10 PM shown at 5:10 PM,
// 2026-11-06). Measured: Windows' zone is "British Columbia Standard Time" (UTC-7 all year, BC's permanent daylight time); the
// bundled ICU (78.2, tzdata 2026d) has the rule (America/Vancouver reads 5:15 PM) but no mapping from that Windows zone, so
// Intl's resolved time zone is undefined and Date falls back to the zone's base offset, UTC-8 — in the renderer and in Node.
// Setting TZ does not reach Chromium's renderers on Windows, so the main process sets Node's TZ and each window gets
// Chromium's own time-zone override. Only Windows zones the ICU cannot map are listed; anything else is left alone.
// Pure apart from tzutil: tested without Electron.
const WINDOWS_ZONE_FALLBACK = {
  "British Columbia Standard Time": "America/Vancouver",
};

function ianaForWindowsZone(id) {
  return WINDOWS_ZONE_FALLBACK[String(id || "").trim()] || null;
}

// the IANA zone to force, or null when nothing needs fixing (the ICU resolves the zone, not Windows, unknown zone)
function zoneOverride({ platform = process.platform, resolved = Intl.DateTimeFormat().resolvedOptions().timeZone, readWindowsZone } = {}) {
  if (platform !== "win32" || resolved) return null;
  let id = null;
  try { id = readWindowsZone ? readWindowsZone() : require("child_process").execFileSync("tzutil", ["/g"], { encoding: "utf8", timeout: 3000, windowsHide: true }); } catch { return null; }
  return ianaForWindowsZone(id);
}

// Chromium's override for one window; best effort (a window someone opened DevTools on first still works, a few seconds behind)
function applyToWebContents(contents, zone) {
  if (!zone || !contents?.debugger) return false;
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    contents.debugger.sendCommand("Emulation.setTimezoneOverride", { timezoneId: zone }).catch(() => {});
    return true;
  } catch { return false; }
}

module.exports = { WINDOWS_ZONE_FALLBACK, ianaForWindowsZone, zoneOverride, applyToWebContents };
