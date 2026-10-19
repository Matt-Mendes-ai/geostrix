// TASKS.csv #638 — optional add-ons (first: the geoML predictive-modelling engine, GPL-3.0, addons/geoml). An add-on is a
// separate program GeoStrix downloads only when the user asks for it: a zip on GitHub Releases whose SHA-256 is pinned
// in addons/<id>/release.json (shipped inside the app), so a corrupt or tampered download is refused. It is unpacked
// into userData/addons/<id>/<version>/ and started on first use with a per-launch token, like the Python engine.
// GEOSTRIX_ADDON_<ID>_EXE (a path to the add-on's exe, or "python.exe|run_addon.py") overrides the installed copy for
// development and testing.
const fs = require("fs");
const path = require("path");
const os = require("os"); // #698
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");
const nodeNet = require("net");

// TASKS.csv #645 — the add-on takes the first free port of a short fixed range instead of always 8766: a second
// GeoStrix (a development copy beside an installed one — packaged builds are single-instance) or any other program
// on 8766 made the add-on fail to bind, and the app then talked to the OTHER add-on ("Missing or wrong add-on
// token"). A range, not "any port", so the build-time CSP can still name every port the renderer may reach.
const ADDON_PORTS = Array.from({ length: 10 }, (_, i) => 8766 + i);
const portFree = (port) => new Promise((resolve) => {
  const srv = nodeNet.createServer();
  srv.once("error", () => resolve(false));
  srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
});
async function pickPort(preferred) {
  for (const p of [preferred, ...ADDON_PORTS.filter((q) => q !== preferred)]) if (await portFree(p)) return p;
  return null;
}

function createAddonManager({ app, net, send, platform = process.platform }) {
  const running = {}; // id -> { proc, token, port }
  const installs = {}; // id -> { request, cancelled }

  const releaseInfo = (id) => {
    for (const base of [path.join(process.resourcesPath || "", "addons"), path.join(__dirname, "..", "addons")]) {
      try {
        const info = JSON.parse(fs.readFileSync(path.join(base, id, "release.json"), "utf8"));
        // development builds only: test an add-on zip before it is published (never in an installed GeoStrix)
        const U = `GEOSTRIX_ADDON_${id.toUpperCase()}`;
        if (!app.isPackaged && process.env[`${U}_URL`]) Object.assign(info, { url: process.env[`${U}_URL`], sha256: process.env[`${U}_SHA256`] || info.sha256 });
        return info;
      } catch { /* next */ }
    }
    return null;
  };
  const root = (id) => path.join(app.getPath("userData"), "addons", id);
  const installedDir = (id, info) => path.join(root(id), info.version);
  const exePath = (id, info) => path.join(installedDir(id, info), info.exe);
  const devOverride = (id) => process.env[`GEOSTRIX_ADDON_${id.toUpperCase()}_EXE`] || null;
  // TASKS.csv #775 — release.json's "platform" (a process.platform value) is the one OS its zip was built for. On any
  // other (the macOS build) the add-on is reported as not built for this computer instead of downloading a Windows
  // zip it can't run. A development override (GEOSTRIX_ADDON_<ID>_EXE) still runs on any OS.
  const builtForHere = (info) => !info.platform || info.platform === platform;
  const OTHER_OS = "This add-on is only built for Windows so far.";

  function status(id) {
    const info = releaseInfo(id);
    if (!info) return { id, available: false, reason: "This GeoStrix build doesn't know this add-on." };
    const dev = devOverride(id);
    if (!dev && !builtForHere(info)) return { id, available: true, name: info.name, version: info.version, licence: info.licence, installed: false, otherPlatform: true, reason: OTHER_OS, url: null }; // #775
    const installed = !!dev || fs.existsSync(exePath(id, info));
    let sizeOnDisk = null;
    return { id, available: true, name: info.name, version: info.version, licence: info.licence, downloadBytes: info.bytes, installedBytes: info.installedBytes,
      installed, dev: !!dev, running: !!running[id], installing: !!installs[id], url: info.url, sizeOnDisk };
  }

  // TASKS.csv #666 — plain words for a file-system failure while installing
  function diskError(e, where) {
    if (e?.code === "ENOSPC") return new Error(`The disk is full — the add-on could not be written to ${path.dirname(where)}. Free some space and try again.`);
    if (e?.code === "EACCES" || e?.code === "EPERM" || e?.code === "EBUSY") return new Error(`GeoStrix could not write to ${path.dirname(where)} (${e.code}: the folder is locked or read-only — an antivirus scan or a sync tool can do this). Try again in a minute.`);
    return e instanceof Error ? e : new Error(String(e));
  }
  function download(url, dest, onProgress, state, redirects = 0) {
    return new Promise((resolve, reject) => {
      const req = net.request({ url, redirect: "manual" });
      state.request = req;
      req.on("redirect", (code, method, redirectUrl) => {
        if (redirects > 5) { req.abort(); reject(new Error("Too many redirects.")); return; }
        req.abort();
        download(redirectUrl, dest, onProgress, state, redirects + 1).then(resolve, reject);
      });
      req.on("response", (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) return; // handled by "redirect"
        if (res.statusCode !== 200) { reject(new Error(`Download failed: HTTP ${res.statusCode}`)); return; }
        const total = Number(res.headers["content-length"]) || 0;
        const out = fs.createWriteStream(dest);
        const hash = crypto.createHash("sha256");
        let got = 0, failed = false;
        // TASKS.csv #666 — a failed WRITE (disk full, folder locked) had no listener: an uncaught main-process exception
        // and an install that then blamed the published checksum. Now it stops the download and says what happened;
        // and the response pauses while the file catches up (back-pressure) instead of buffering in memory.
        out.on("error", (e) => { if (failed) return; failed = true; try { req.abort(); } catch (_) { /* gone */ } reject(diskError(e, dest)); });
        res.on("data", (chunk) => {
          if (state.cancelled || failed) return;
          hash.update(chunk); got += chunk.length; onProgress(got, total);
          if (!out.write(chunk)) { res.pause(); out.once("drain", () => res.resume()); }
        });
        // the end callback is handed the stream's error when a write failed after the last chunk arrived
        res.on("end", () => {
          if (failed) return;
          out.end((err) => {
            if (failed) return;
            if (err) { failed = true; reject(diskError(err, dest)); return; }
            if (state.cancelled) reject(new Error("Cancelled.")); else resolve(hash.digest("hex"));
          });
        });
        res.on("error", (e) => { out.destroy(); reject(e); });
      });
      req.on("error", reject);
      req.end();
    });
  }

  async function install(id) {
    const info = releaseInfo(id);
    if (!info?.url || !info.sha256) throw new Error("This add-on has no published download yet.");
    if (!builtForHere(info)) throw new Error(OTHER_OS); // #775
    if (installs[id]) throw new Error("Already installing.");
    // Windows can't load a DLL whose full path passes 260 characters (MAX_PATH), and the add-on nests deep (scikit-learn,
    // VTK): checked before downloading 600 MB, rather than failing on the first model with "filename too long"
    const longest = installedDir(id, info).length + 1 + (info.longestPath || 125);
    if (process.platform === "win32" && longest > 250) throw new Error(`GeoStrix's data folder (${app.getPath("userData")}) has too long a path for this add-on on Windows (${longest} of 250 characters). Please let us know on GitHub.`);
    fs.mkdirSync(root(id), { recursive: true });
    // TASKS.csv #666 — the zip and the unpacked folder are both on disk at the peak (553 MB + 1,758 MB for 0.1.0):
    // say so before downloading rather than failing half-way with a full disk.
    const need = (Number(info.bytes) || 0) + (Number(info.installedBytes) || 0);
    if (need > 0 && typeof fs.statfsSync === "function") {
      try {
        const st = fs.statfsSync(root(id)), free = Number(st.bavail) * Number(st.bsize);
        if (Number.isFinite(free) && free < need * 1.05) {
          const gb = (b) => (b / 1e9).toFixed(1);
          throw Object.assign(new Error(`The add-on needs about ${gb(need)} GB free while it installs, and ${root(id)} has ${gb(free)} GB. Free ${gb(need * 1.05 - free)} GB and try again.`), { noSpace: true });
        }
      } catch (e) { if (e.noSpace) throw e; /* statfs unavailable for this path: go on, the write handler still catches a full disk */ }
    }
    const state = (installs[id] = { cancelled: false, request: null });
    const zip = path.join(root(id), `${info.version}.zip.part`);
    try {
      let last = 0;
      const sha = await download(info.url, zip, (got, total) => {
        const now = Date.now();
        if (now - last > 250 || got === total) { last = now; send({ id, phase: "download", got, total: total || info.bytes || 0 }); }
      }, state);
      if (sha !== info.sha256.toLowerCase()) throw new Error("The downloaded file doesn't match its published checksum — it was not installed. Try again later.");
      send({ id, phase: "unpack" });
      const dir = installedDir(id, info);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      // Windows 10 (1803+) ships bsdtar, which reads zip files. Called by its full path: a GNU tar earlier on PATH (Git's
      // usr/bin) reads "C:" as a remote tape host and can't open zips at all.
      const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
      if (process.platform === "win32" && !fs.existsSync(tar)) throw new Error("This version of Windows has no built-in zip extractor (tar.exe, Windows 10 1803 or later).");
      await new Promise((resolve, reject) => execFile(tar, ["-xf", zip, "-C", dir], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err) => (err ? reject(new Error(`Unpacking failed: ${err.message}`)) : resolve())));
      if (!fs.existsSync(exePath(id, info))) throw new Error("The add-on was unpacked but its program is missing.");
      // older versions of this add-on are removed once the new one is in place
      for (const v of fs.readdirSync(root(id))) if (v !== info.version && !v.endsWith(".log")) fs.rmSync(path.join(root(id), v), { recursive: true, force: true });
      delete installs[id];
      send({ id, phase: "done" });
      return status(id);
    } finally {
      fs.rmSync(zip, { force: true });
      delete installs[id];
    }
  }

  // TASKS.csv #669 — Help > Licences shows what an installed add-on ships: build_addon.py writes SOURCE.txt and
  // THIRD-PARTY-LICENCES.txt next to the add-on's program. Read-only; nothing here is sent anywhere.
  function notices(id) {
    const info = releaseInfo(id);
    if (!info) return { id, available: false };
    const dev = devOverride(id);
    const exe = dev || exePath(id, info);
    const base = { id, available: true, name: info.name, version: info.version, licence: info.licence, installed: fs.existsSync(exe) };
    if (!base.installed) return base;
    const dir = path.dirname(exe);
    const read = (f, cap) => {
      try {
        const p = path.join(dir, f);
        if (fs.statSync(p).size > cap) return null; // a file this large is not the one build_addon.py writes
        return fs.readFileSync(p, "utf8");
      } catch { return null; }
    };
    return { ...base, source: read("SOURCE.txt", 64 * 1024), licences: read("THIRD-PARTY-LICENCES.txt", 8 * 1024 * 1024), licenceText: read("LICENSE", 256 * 1024) };
  }

  // TASKS.csv #689 — TensorFlow's Windows wheels need AVX, which some budget Celeron / Pentium chips lack: ask Windows
  // (IsProcessorFeaturePresent, PF_AVX_INSTRUCTIONS_AVAILABLE = 39, which also requires the OS to have enabled it)
  // BEFORE a 553 MB download. One PowerShell call per session, cached. avx: true / false, or null when unknown
  // (not Windows, or the query failed) — the panel only warns, because an old Windows build may not know feature 39.
  let cpuPromise = null;
  function cpuCheck() {
    if (cpuPromise) return cpuPromise;
    cpuPromise = new Promise((resolve) => {
      // development builds only: pretend the processor has no AVX, to see the warning (never in an installed GeoStrix)
      if (!app.isPackaged && process.env.GEOSTRIX_ADDON_CPU_AVX === "0") { resolve({ avx: false }); return; }
      if (process.platform !== "win32") { resolve({ avx: null }); return; }
      const ps = path.join(process.env.SystemRoot || "C:\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const script = "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern bool IsProcessorFeaturePresent(uint f);' -Name K -Namespace GeoStrixCpu; [GeoStrixCpu.K]::IsProcessorFeaturePresent(39)";
      execFile(ps, ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
        const out = String(stdout || "").trim();
        resolve({ avx: err ? null : out === "True" ? true : out === "False" ? false : null });
      });
    });
    return cpuPromise;
  }

  function cancelInstall(id) {
    const s = installs[id];
    if (!s) return false;
    s.cancelled = true;
    try { s.request?.abort(); } catch { /* already done */ }
    return true;
  }

  function stop(id) {
    const r = running[id];
    if (r?.proc && !r.proc.killed) { try { r.proc.kill(); } catch { /* gone */ } }
    delete running[id];
  }

  function uninstall(id) {
    stop(id);
    fs.rmSync(root(id), { recursive: true, force: true });
    return status(id);
  }

  // TASKS.csv #698 — TensorFlow uses every core by default, so a 1-2 minute model competed with the window on a 4-core
  // laptop. Half the cores, at most 4 — the same cap the Python engine gets (main.js blasThreadEnv) — unless the user
  // set these variables themselves.
  function addonThreadEnv() {
    const n = String(Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
    const env = {};
    ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "TF_NUM_INTRAOP_THREADS"].forEach((k) => { if (!process.env[k]) env[k] = n; });
    if (!process.env.TF_NUM_INTEROP_THREADS) env.TF_NUM_INTEROP_THREADS = "2";
    return env;
  }
  async function ensure(id) {
    if (running[id]) return { running: true, port: running[id].port, spawned: false };
    const info = releaseInfo(id);
    if (!info) throw new Error("Unknown add-on.");
    const dev = devOverride(id);
    if (!dev && !builtForHere(info)) throw new Error(OTHER_OS); // #775
    let cmd, args = [];
    if (dev && dev.includes("|")) { [cmd, ...args] = dev.split("|"); }
    else { cmd = dev || exePath(id, info); }
    if (!fs.existsSync(cmd)) throw new Error("The add-on isn't installed.");
    // TASKS.csv #698 — the add-on takes ~590 MB once TensorFlow is loaded and up to ~1.9 GB while a model runs; on an
    // 8 GB laptop beside GeoStrix and the Python engine it used to fail minutes in with "stopped unexpectedly (out of
    // memory?)". Refuse up front when the computer plainly lacks the room, and say what it has.
    const freeGb = os.freemem() / 1e9;
    if (freeGb < 1.5) throw new Error(`The predictive add-on needs about 2 GB of free memory while a model runs, and this computer has ${freeGb.toFixed(1)} GB free right now. Close other programs (web browsers use a lot) and try again.`);
    const token = crypto.randomBytes(32).toString("hex");
    const port = await pickPort(ADDON_PORTS.includes(info.port) ? info.port : ADDON_PORTS[0]);
    if (port == null) throw new Error(`Ports ${ADDON_PORTS[0]}-${ADDON_PORTS[ADDON_PORTS.length - 1]} are all in use, so the add-on cannot start. Close other programs using them and try again.`);
    let logFd = null;
    try {
      fs.mkdirSync(root(id), { recursive: true });
      logFd = fs.openSync(path.join(root(id), "addon.log"), "a");
      fs.writeSync(logFd, `\n=== ${id} add-on start ${new Date().toISOString()} (GeoStrix ${app.getVersion()}) ===\n`);
    } catch { logFd = null; }
    const proc = spawn(cmd, args, {
      cwd: path.dirname(args.length ? args[args.length - 1] : cmd),
      env: { ...process.env, GEOSTRIX_ADDON_TOKEN: token, GEOSTRIX_ADDON_PORT: String(port), TF_CPP_MIN_LOG_LEVEL: "2", ...addonThreadEnv() },
      windowsHide: true,
      stdio: logFd !== null ? ["ignore", logFd, logFd] : "ignore",
    });
    running[id] = { proc, token, port };
    proc.on("exit", () => { if (running[id]?.proc === proc) delete running[id]; send({ id, phase: "stopped" }); });
    proc.on("error", () => { if (running[id]?.proc === proc) delete running[id]; });
    return { running: true, port, spawned: true };
  }

  const connection = (id) => (running[id] ? { port: running[id].port, token: running[id].token } : null);
  const stopAll = () => Object.keys(running).forEach(stop);
  return { status, notices, cpuCheck, install, cancelInstall, uninstall, ensure, stop, connection, stopAll };
}

module.exports = { createAddonManager, ADDON_PORTS };
