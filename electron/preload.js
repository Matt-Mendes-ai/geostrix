const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  getSidecarToken: () => ipcRenderer.invoke("sidecar-token"), // TASKS.csv #321
  ensureSidecar: () => ipcRenderer.invoke("sidecar-ensure"), // TASKS.csv #440
  isSidecarRunning: () => ipcRenderer.invoke("sidecar-running"), // TASKS.csv #440
  // TASKS.csv #638 — optional add-ons
  addonStatus: (id) => ipcRenderer.invoke("addon-status", id),
  addonNotices: (id) => ipcRenderer.invoke("addon-notices", id), // TASKS.csv #669
  addonCpuCheck: () => ipcRenderer.invoke("addon-cpu-check"), // TASKS.csv #689
  addonInstall: (id) => ipcRenderer.invoke("addon-install", id),
  addonCancelInstall: (id) => ipcRenderer.invoke("addon-cancel-install", id),
  addonUninstall: (id) => ipcRenderer.invoke("addon-uninstall", id),
  addonEnsure: (id) => ipcRenderer.invoke("addon-ensure", id),
  addonConnection: (id) => ipcRenderer.invoke("addon-connection", id),
  addonStop: (id) => ipcRenderer.invoke("addon-stop", id),
  onAddonEvent: (cb) => { const h = (_e, ev) => cb(ev); ipcRenderer.on("addon-event", h); return () => ipcRenderer.removeListener("addon-event", h); },
  openSectionWindow: (payload) => ipcRenderer.invoke("open-section-window", payload),
  sendSectionSnapshot: (payload) => ipcRenderer.invoke("section-snapshot", payload),
  onSectionSnapshot: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("section-snapshot", h); return () => ipcRenderer.removeListener("section-snapshot", h); },
  sendSectionContacts: (payload) => ipcRenderer.invoke("section-contacts", payload),
  onSectionContacts: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("section-contacts", h); return () => ipcRenderer.removeListener("section-contacts", h); },
  exportPDF: (payload) => ipcRenderer.invoke("export-pdf", payload),
  saveFile: (payload) => ipcRenderer.invoke("save-file", payload),
  saveFileTo: (payload) => ipcRenderer.invoke("save-file-to", payload), // TASKS.csv #553
  openFile: (payload) => ipcRenderer.invoke("open-file", payload),
  fetchSRTMTile: (z, x, y) => ipcRenderer.invoke("fetch-srtm-tile", { z, x, y }),
  fetchWebLayerUrl: (url) => ipcRenderer.invoke("fetch-web-layer", { url }),
  remoteSensingFetch: (req) => ipcRenderer.invoke("remote-sensing-fetch", req), // TASKS.csv #784
  updaterCheck: () => ipcRenderer.invoke("updater-check"),
  updaterDownload: () => ipcRenderer.invoke("updater-download"),
  updaterInstall: () => ipcRenderer.invoke("updater-install"),
  onUpdaterEvent: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("updater-event", h); return () => ipcRenderer.removeListener("updater-event", h); },
  dbConnect: (config) => ipcRenderer.invoke("db-connect", config),
  refocusAfterDialog: () => ipcRenderer.send("refocus-after-dialog"), // TASKS.csv #622
  setLanguage: (code) => ipcRenderer.send("set-language", code), // TASKS.csv #786 — the native menu follows the interface language
  // TASKS.csv #598 — Help > Report a problem
  problemReportInfo: () => ipcRenderer.invoke("problem-report-info"),
  captureWindow: () => ipcRenderer.invoke("capture-window"),
  saveProblemReport: (bytes, name) => ipcRenderer.invoke("save-problem-report", { bytes, name }),
  emailSupport: (subject, body) => ipcRenderer.invoke("email-support", { subject, body }),
  showReportFile: (file) => ipcRenderer.invoke("show-report-file", { file }),
  dbPasswordStatus: (config) => ipcRenderer.invoke("db-password-status", config), // TASKS.csv #621
  dbForgetPassword: (config) => ipcRenderer.invoke("db-forget-password", config), // TASKS.csv #621
  dbDisconnect: (id) => ipcRenderer.invoke("db-disconnect", { id }),
  dbLiveQuery: (id, sql, opts = {}) => ipcRenderer.invoke("db-live-query", { id, sql, importStep: opts.importStep === true }), // #665
  dbLiveListTables: (id) => ipcRenderer.invoke("db-live-list-tables", { id }),
  fsListDir: (dirPath) => ipcRenderer.invoke("fs-list-dir", { dirPath }),
  fsListDrives: () => ipcRenderer.invoke("fs-list-drives"),
  fsReadFile: (filePath) => ipcRenderer.invoke("fs-read-file", { filePath }),
  sampleDataPath: () => ipcRenderer.invoke("sample-data-path"),
  autosaveWrite: (payload) => ipcRenderer.invoke("autosave-write", payload),
  autosaveRead: () => ipcRenderer.invoke("autosave-read"),
  autosaveQuarantine: () => ipcRenderer.invoke("autosave-quarantine"), // TASKS.csv #475
  autosaveClear: () => ipcRenderer.invoke("autosave-clear"),
  setDirtyState: (dirty) => ipcRenderer.send("set-dirty-state", dirty),
  getSectionData: () => ipcRenderer.invoke("get-section-data"), // TASKS.csv #617
  copyText: (text) => ipcRenderer.invoke("copy-text", text), // TASKS.csv #589 — no web clipboard permission needed
  onSectionData: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("section-data", h); return () => ipcRenderer.removeListener("section-data", h); },
  onMenu: (cb) => { const h = (_e, action) => cb(action); ipcRenderer.on("menu", h); return () => ipcRenderer.removeListener("menu", h); },
});
