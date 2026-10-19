// TASKS.csv #773 — the application menu, as a pure function of the platform so the macOS shape can be checked on any
// OS (test/menuTemplate773.test.mjs). main.js supplies the actions; nothing here touches Electron.
//
// macOS differs from Windows/Linux in ways that are not cosmetic:
//  * The FIRST menu always becomes the app-name menu. Without a dedicated one, "File" was swallowed into it and
//    there was no About / Services / Hide / Quit in the place every Mac app has them.
//  * Cmd+C / Cmd+V / Cmd+X / Cmd+A only reach a text field through menu items that carry those key equivalents.
//    With the old Undo/Redo-only Edit menu, copy and paste did nothing in every input on a Mac. The roles call
//    webContents' own native edit commands, exactly what the focused field would have done, so they don't have the
//    problem TASKS.csv #31 describes (an accelerator winning over the field's own behaviour). Windows/Linux fields
//    handle these keys natively without a menu, so the roles are added on macOS only and nothing changes there.
//  * Cmd+Z / Cmd+Shift+Z: for the same reason a Mac text field gets no native undo unless the menu has the key, so
//    on macOS the Undo/Redo items DO carry accelerators. #31's concern is handled in the renderer instead: the
//    "undo"/"redo" menu actions are focus-aware (App.jsx — a focused text field gets its own undo), and App.jsx's
//    keydown listener leaves Cmd+Z to the menu in the desktop app on a Mac, so one key press is one undo.
function buildMenuTemplate({ isMac, isPackaged, appName, updatesEnabled, checkUpdatesAtStartup, send, sendWithGesture, onToggleStartupCheck, onCheckForUpdates }) {
  const sep = { type: "separator" };
  const about = { label: `About ${appName}`, click: () => send("about") };
  const updateItems = updatesEnabled ? [
    // TASKS.csv #591 — the startup check is network contact the user didn't start (camp satellite links,
    // firewalled laptops, "offline and private"): it can be switched off; the manual check stays
    { label: "Check for Updates at Startup", type: "checkbox", checked: checkUpdatesAtStartup, click: (item) => onToggleStartupCheck(item.checked) },
    { label: "Check for Updates…", click: () => onCheckForUpdates() },
  ] : []; // TASKS.csv #774 — no update feed for this build (macOS), so no menu items that could only fail
  return [
    ...(isMac ? [{
      label: appName,
      submenu: [about, sep, { role: "services" }, sep, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, sep, { role: "quit" }],
    }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Project", accelerator: "CmdOrCtrl+N", click: () => send("new-project") },
        { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => send("open-project") },
        { label: "Save Project", accelerator: "CmdOrCtrl+S", click: () => send("save-project") }, // #553 — to its own file
        { label: "Save Project As…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-project-as") },
        sep,
        { label: "Import CSV…", accelerator: "CmdOrCtrl+I", click: () => sendWithGesture("import-csv") }, // #565 — the current tab's import
        { label: "Import Assays…", click: () => sendWithGesture("import-assays") },
        { label: "Import pXRF…", click: () => sendWithGesture("import-pxrf") },
        sep,
        { label: "Export PDF…", accelerator: "CmdOrCtrl+P", click: () => send("export-pdf") },
        sep,
        // #773 — Quit lives in the app menu on macOS; File ends with Close Window (Cmd+W) as on every Mac app
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      // TASKS.csv #31 — deliberately NO keyboard accelerator on Undo/Redo on Windows/Linux. Electron menu
      // accelerators are global-to-the-window and would win over a focused <input>'s own native Ctrl+Z text-undo
      // (of which this app has many — search fields, name fields, the layout text tool, etc.), which would be a much
      // worse regression than not having a menu shortcut for app-level undo. The real Ctrl+Z/Ctrl+Shift+Z handling
      // lives in App.jsx's own keydown listener instead, which can check document.activeElement and defer to native
      // text-undo when a text field has focus. On macOS see the header: the key has to be on the menu item there.
      label: "Edit",
      submenu: [
        { label: "Undo", ...(isMac ? { accelerator: "Cmd+Z" } : {}), click: () => send("undo") },
        { label: "Redo", ...(isMac ? { accelerator: "Shift+Cmd+Z" } : {}), click: () => send("redo") },
        ...(isMac ? [sep, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" }] : []),
      ],
    },
    {
      label: "View",
      submenu: [
        // TASKS.csv #32 — module-switch accelerators (Ctrl/Cmd+1..4). Previously these four had no
        // keyboard shortcut at all despite being the most-used navigation in the app; added now partly
        // because a "keyboard shortcuts reference" that only had 5 shortcuts to list would barely be
        // worth its own menu entry — these round it out into something actually useful to reference.
        // TASKS.csv #565 — Ctrl+1..8 in the TAB STRIP's order (was 4 of 8 tabs, and Ctrl+2 was the third tab)
        ...[["3D View", "viewer"], ["3D Modelling", "modelling"], ["Geochem", "geochem"], ["Geophysics", "geophysics"], ["Targeting", "targeting"], ["Maps", "maps"], ["Layout", "layout"]]
          .map(([label, id], i) => ({ label, accelerator: `CmdOrCtrl+${i + 1}`, click: () => send(`module-${id}`) })),
        sep,
        // TASKS.csv #464 — development builds only. In the installed app Ctrl+R reloaded the renderer with
        // no prompt (a reload never fires the window close guard): every open workspace tab was thrown
        // away, and a running SimPEG job was orphaned in the sidecar (its poller lived in the page) while
        // new jobs got 409. Nothing a user needs, so they are simply not in the packaged menu.
        ...(isPackaged ? [] : [{ role: "reload" }, { role: "toggledevtools" }, sep]),
        { role: "resetzoom" }, { role: "zoomin" }, { role: "zoomout" },
        ...(isMac ? [sep, { role: "togglefullscreen" }] : []), // #773 — Ctrl+Cmd+F / the green button's menu twin
      ],
    },
    {
      label: "Tools",
      submenu: [
        { label: "Draw a cross-section", accelerator: "CmdOrCtrl+Shift+C", click: () => send("cross-section") }, // #565 — starts Draw section
        { label: "Project CRS (Cartography)…", click: () => send("set-epsg") },
      ],
    },
    // #773 — the standard Mac Window menu (Minimize Cmd+M, Zoom, Bring All to Front, the window list)
    ...(isMac ? [{ role: "windowMenu" }] : []),
    {
      label: "Help",
      // #773 — on macOS this is also where the system's Help search field appears
      ...(isMac ? { role: "help" } : {}),
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "CmdOrCtrl+/", click: () => send("shortcuts") },
        ...updateItems,
        // Bug fix while touching this menu: "About GeoStrix" sent a "menu"/"about" action that nothing
        // on the renderer side ever handled — clicking it silently did nothing. Now shares the same
        // modal as the new Keyboard Shortcuts entry (see ShortcutsModal in App.jsx), just opened to a
        // different tab.
        sep,
        { label: "Report a Problem…", click: () => send("report-problem") }, // TASKS.csv #598
        { label: "Third-party Licences…", click: () => send("licenses") }, // TASKS.csv #639
        ...(isMac ? [] : [about]), // #773 — in the app menu on macOS
      ],
    },
  ];
}

module.exports = { buildMenuTemplate };
