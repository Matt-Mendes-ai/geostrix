// TASKS.csv #2241 (review #2174) — the Python engine's port: the first free one from 8765 on 127.0.0.1, so a second GeoStrix on the same
// computer runs its own engine instead of failing against the first one's. Plain Node (no Electron), so it can be tested.
const net = require("net");

function portFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

async function pickSidecarPort(start = 8765, span = 40) {
  for (let p = start; p < start + span; p++) if (await portFree(p)) return p;
  return start; // nothing free nearby: the start port, whose failure the app already reports
}

module.exports = { portFree, pickSidecarPort };
