// TASKS.csv #1276 — how many cross-section windows may be open. Each is a full renderer process: 134-191 MB measured, and 11 open took
// the app from 0.76 GB to 2.9 GB, so a 26-section fence opened one by one would exhaust an 8 GB laptop at about 20. A window
// past the cap is refused, not swapped for an older one, which may hold a half-drawn line. Since #1303 sections are tabs in one
// window, and this counts the windows a person pops out to compare sections. Pure: tested without Electron.
const GB = 1024 ** 3;

function maxSectionWindows(totalMemBytes) {
  const gb = Number(totalMemBytes) / GB;
  if (!Number.isFinite(gb) || gb <= 0) return 6;
  return Math.max(4, Math.min(16, Math.round(gb * 0.75)));
}

// TASKS.csv #1303 — open sections, as tabs: they share one renderer. Measured on Woodjam: see the row.
function maxSectionTabs(totalMemBytes) {
  const gb = Number(totalMemBytes) / GB;
  if (!Number.isFinite(gb) || gb <= 0) return 40;
  return Math.max(20, Math.min(100, Math.round(gb * 5)));
}

module.exports = { maxSectionWindows, maxSectionTabs };
