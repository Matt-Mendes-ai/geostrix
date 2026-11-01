// TASKS.csv #1265 — an installed copy refuses the switches that would hand its window and IPC bridge to anything able to start it with an extra argument (a
// changed shortcut, a script): a DevTools port, a proxy or host map, another profile. A development run keeps them: scripts/drive-electron.mjs relies on them.
const REFUSED = /^--(remote-debugging-(port|pipe)|inspect(-brk)?|js-flags|user-data-dir|proxy-server|host-rules|host-resolver-rules)(=|$)/i;
const refusedSwitches = (argv) => (argv || []).filter((a) => REFUSED.test(String(a)));
module.exports = { refusedSwitches };
