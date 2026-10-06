const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  getSidecarToken: () => ipcRenderer.invoke("sidecar-token"), // TASKS.csv #321
  ensureSidecar: () => ipcRenderer.invoke("sidecar-ensure"), // TASKS.csv #440
  isSidecarRunning: () => ipcRenderer.invoke("sidecar-running"), // TASKS.csv #440
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
  updaterCheck: () => ipcRenderer.invoke("updater-check"),
  updaterDownload: () => ipcRenderer.invoke("updater-download"),
  updaterInstall: () => ipcRenderer.invoke("updater-install"),
  onUpdaterEvent: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("updater-event", h); return () => ipcRenderer.removeListener("updater-event", h); },
  dbConnect: (config) => ipcRenderer.invoke("db-connect", config),
  dbDisconnect: (id) => ipcRenderer.invoke("db-disconnect", { id }),
  dbLiveQuery: (id, sql) => ipcRenderer.invoke("db-live-query", { id, sql }),
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
  onSectionData: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("section-data", h); return () => ipcRenderer.removeListener("section-data", h); },
  onMenu: (cb) => { const h = (_e, action) => cb(action); ipcRenderer.on("menu", h); return () => ipcRenderer.removeListener("menu", h); },
});
