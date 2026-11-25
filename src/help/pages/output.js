// Getting work out of GeoStrix and keeping it: the export formats and what each carries, and saving, autosave, recovery, Undo and the language switch, written from the notes the app
// itself carries (see src/help/content.js for the page format).
// TASKS.csv #3899 (T4) — rewritten to the rule of plan_fable 3.2: short summaries and fields, the detail behind "More".
export default [
  {
    id: "export-formats",
    area: "Getting started",
    title: "Export: what goes where (Leapfrog, Micromine, GIS, Google Earth)",
    // TASKS.csv #3979 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "What each export holds, and which to pick for the program you use.",
    picture: { drop: ["holes", "table"], alt: "Drill holes become files another program reads." },
    cautions: ["OMF and .geoh5 carry no coordinate system: tell the other program."],
    instead: [{ text: "Layout pages, settings", to: "Save Project", page: "save-recovery" }],
    keys: ["File > Export Project as OMF (.omf)…", "Export Shapefile (.zip) / Export GeoPackage (.gpkg)", "File > Export Project as KMZ…", "Export all drillhole tables (.zip of CSV)…"],
    summary: "What each export holds, and which to choose for the program you are moving the work to.",
    more: "The drillhole tables go out from the Export button on StrixViewer's ribbon (or a right-click on Collars in the sidebar): CSV in a zip, Shapefile, GeoPackage, DXF or GOCAD. File has the whole project as KMZ, Geoscience ANALYST .geoh5 and OMF, and Export PDF for the Layout. Block models and surfaces have their own exports.",
    notFor: [
      "No export carries the Layout pages or the project's settings: save the project for those.",
      "OMF and .geoh5 carry numbers only, no coordinate system: tell the other program which one (the export's message says).",
      "An export is a copy at that moment; export again after a change.",
    ],
    fields: [
      { name: "Export all drillhole tables (.zip of CSV)…", gist: "every table, as CSV", what: "One CSV per table (collars, survey, each log, assays) and provenance.txt.", more: "How to choose: The way into Leapfrog, Micromine, Datamine or a database; read provenance.txt before mapping columns. collars.csv has an epsg column and the hole's own fields; assays.csv has one column per element with its unit in the name; provenance.txt gives the tool, version, date, coordinate system and dip convention. Row 1 is the column names." },
      { name: "Export CSV table (imports back)…", what: "One table of the layer you right-click, in the shape GeoStrix imports.", more: "How to choose: For one table, or to move a table between projects." },
      { name: "Generated surfaces: right-click to export", what: "A surface a tool makes goes out as OBJ, DXF, GOCAD TSurf or OMF.", more: "How to choose: By the program that will read it. Each file carries a stamp naming the tool, its version and the settings used, and the coordinates are the project's." },
      { name: "Dips are written negative = down", what: "Every table writes a downward dip as negative and azimuths as grid bearings.", more: "How to choose: If the other program reads positive-down, flip the sign there, not by hand." },
      { name: "Export Shapefile (.zip) / Export GeoPackage (.gpkg)", gist: "GIS programs", what: "The layer as GIS features, its fields as columns, with its coordinate system.", more: "How to choose: GeoPackage when field names are long: a Shapefile cuts them at ten characters." },
      { name: "Export DXF (.dxf) / Export GOCAD (.vs / .pl)", what: "Hole traces and surfaces as geometry only; the coordinate system is in a comment line.", more: "How to choose: For a CAD or modelling program that wants geometry." },
      { name: "File > Export Project as KMZ…", gist: "Google Earth", what: "The whole project for Google Earth, in folders, with its colours and classes.", choose: "To show the drilling to someone with only Google Earth; needs a coordinate system, not a local grid.", more: "Collars and traces sit at their elevation, underground; every layer with a map position is included." },
      { name: "File > Export Project as Geoscience ANALYST (.geoh5)…", what: "Drillholes, surfaces, points and block models in a geoh5 file; no coordinate system.", choose: "Check one hole against StrixViewer before you rely on it." },
      { name: "File > Export Project as OMF (.omf)…", gist: "Leapfrog, Micromine, Datamine", what: "Open Mining Format, the file Leapfrog, Micromine and Datamine exchange.", more: "How to choose: When the other program reads OMF and you want everything at once. Drillholes as two line sets (paths with depths; intervals with the assays, density and other numbers), collars as points with their fields, surfaces and block models. The hole id is carried on every vertex, interval and collar; columns are named for what they hold ('Ag (g/t)'). The description gives the coordinate system and the data credit. Check one hole's name and one assay against StrixViewer." },
      { name: "File > Export PDF…", what: "The Layout pages as a vector PDF, each at its paper size." },
      { name: "Block models, surfaces and slices", what: "Each has its own export beside it.", more: "How to choose: OMF for Leapfrog, Micromine and Datamine; the UBC mesh and model for UBC and SimPEG." },
    ],
    warnings: [
      { says: "An OMF carries no coordinate system: these are the project's coordinates (the project's coordinate system).", do: "Set that coordinate system in the other program." },
      { says: "n text column(s) of the drillhole logs are not in the OMF (it holds numbers): the list.", do: "Export the CSV tables too and bring the codes from them." },
      { says: "Nothing in this project can go to an OMF yet: drillholes, points, lines, surfaces and block models do.", do: "Import or build one of them first." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample (the empty StrixViewer offers it).",
        "Click Export on StrixViewer's ribbon and choose Export all drillhole tables (.zip of CSV)…",
        "Open the zip: read provenance.txt, then collars.csv.",
        "File > Export Project as OMF… and read the message: what was written, what was left out, the coordinate system.",
        "In the other program, import the file and check one hole against StrixViewer.",
      ],
    },
    related: ["save-recovery", "layout", "omf", "block-models", "import-drillholes"],
  },
  {
    id: "save-recovery",
    area: "Getting started",
    title: "Save, autosave and recovery; Undo",
    // TASKS.csv #3979 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "Save keeps your work; autosave keeps a crash copy; Ctrl+Z undoes.",
    picture: { help: "save", alt: "A file for the saved project, a clock for the autosave copy, and an arrow for undo." },
    cautions: ["Autosave is a crash copy, not a saved project.", "Undo does not cover rasters, terrain, block models or generated surfaces.", "Database passwords are never saved with a project."],
    keys: ["Save Project / Save Project As…", "Recovered unsaved work", "Undo and Redo"],
    summary: "Save Project keeps your work in its own file; autosave keeps a recovery copy for a crash; Ctrl+Z undoes the last edit.",
    more: "The status bar says when the last autosave ran; after a crash the next start offers to restore it. The Language list at the right of the status bar changes the interface's words.",
    notFor: [
      "The autosave is a safety copy for a crash, not a saved project.",
      "Undo does not cover rasters, terrain, block models or generated surfaces, and starts again after a project-wide coordinate change.",
      "Database passwords are never saved with a project.",
    ],
    fields: [
      { name: "Save Project / Save Project As…", gist: "Ctrl+S writes the project file", what: "Ctrl+S writes the project (.geostrix.json); Save As… writes a copy under a new name.", more: "How to choose: Save to a backed-up folder, and before a long calculation. The project file holds the data, the models, the Layout pages and the project's settings." },
      { name: "Autosave", what: "Every 60 seconds, when work has changed, a recovery copy is written on this computer.", more: "How to choose: For a crash or a power cut, not instead of saving. The status bar shows Autosaved with the time, cleared when you save. While a recovery banner waits for an answer, the older copy is kept and new work is written beside it." },
      { name: "Recovered unsaved work", gist: "after a crash: Restore, then Save As", what: "After a crash, a banner offers Restore (opens it, unsaved) or Discard….", more: "How to choose: Restore, save it under a new name, then compare before discarding anything." },
      { name: "Undo and Redo", gist: "Ctrl+Z, Ctrl+Shift+Z", what: "Ctrl+Z and Ctrl+Shift+Z undo and redo edits to the data and interpretation.", more: "How to choose: Save before deleting a block model or surface you may want back. Covered: collars, surveys, logs, assays, surface samples, sections, planned holes, design lines and strings, explicit surfaces, map layers, interpretation lines and Layout pages. Rasters, terrain, block models and generated surfaces are not undoable, nor is how things look (colours, checked holes, shown layers). In a text box, Ctrl+Z undoes the typing first. Undo starts again when a project is reopened." },
      { name: "Language", what: "Changes the interface's language; remembered on this computer.", more: "How to choose: Share projects freely: the data and exported files stay in English. English, Español, Português (Brasil), Français and العربية (right to left), at the right end of the status bar." },
    ],
    warnings: [
      { says: "Recovered unsaved work from a previous session — \"name\" (autosaved when).", do: "Restore, then Save Project As… under a new name; discard only after checking." },
      { says: "Undo history is cleared.", means: "A project-wide change (a new coordinate system) cannot be undone step by step.", do: "Save a copy before such a change." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample (the empty StrixViewer offers it) and change a collar's value in its table.",
        "Wait for the status bar to show Autosaved with the time.",
        "Press Ctrl+Z to take the edit back, Ctrl+Shift+Z to bring it again.",
        "File > Save Project As… and give it a name; the autosave note clears.",
      ],
    },
    related: ["export-formats", "first-project", "layout"],
  },
];
