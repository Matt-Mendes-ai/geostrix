// Getting work out of GeoStrix and keeping it: the export formats and what each carries, and saving, autosave, recovery, Undo and the language switch, written from the notes the app
// itself carries (see src/help/content.js for the page format).
export default [
  {
    id: "export-formats",
    area: "Getting started",
    title: "Export: what goes where (Leapfrog, Micromine, GIS, Google Earth)",
    summary: "What each export contains and what to choose for the program you are moving the work to. The drillhole tables go out as CSV (one file per table, in a zip), or as a Shapefile, a GeoPackage, a DXF or GOCAD files from the Export button on the 3D View ribbon (or a right-click on the Collars button in the sidebar); File has the whole project as KMZ for Google Earth, as a Geoscience ANALYST .geoh5 and as an Open Mining Format .omf, and Export PDF for the Layout. Block models and surfaces have their own exports.",
    notFor: [
      "None of the exports carries your Layout pages or the project's settings: a project file is the way to keep and move those.",
      "OMF and .geoh5 files carry no coordinate system: the numbers are the project's own coordinates, and the program you open them in must be told the coordinate system. The file's note, or the message after the export, says which one.",
      "An export is a copy at that moment. Nothing updates it when the project changes; export again.",
    ],
    fields: [
      { name: "Export all drillhole tables (.zip of CSV)…", what: "The Export button on the 3D View ribbon, or a right-click on the Collars button in the sidebar. One CSV per table: collars.csv (one row per hole, with an epsg column that names the project's coordinate system, and the hole's own fields as columns), survey.csv, one CSV per log layer, assays.csv (one column per element, its unit in the name) and the custom layers, plus provenance.txt, which says the tool and version, the date, the coordinate system, the dip convention and what each file holds. The files are clean tables: row 1 is the column names.", choose: "This is the way into Leapfrog, Micromine, Datamine, a database and back into GeoStrix: each of them imports collar, survey and interval tables. Check provenance.txt before you map the columns." },
      { name: "Export CSV table (imports back)…", what: "One table of the layer you right-click, in the shape GeoStrix imports again. A comment line with the tool and the coordinate system is optional in the composites and best-intercepts tables (a tick beside them); plain tables are never prefixed.", choose: "Use it for one table, or to move a table between two projects." },
      { name: "Dips are written negative = down", what: "Every table writes a downward hole with a negative dip and azimuths as project-grid bearings, which is what most mining programs expect and is the importer's default (Negative = down, grid north).", choose: "When the other program reads positive-down, flip the sign there. Do not edit the numbers by hand." },
      { name: "Export Shapefile (.zip) / Export GeoPackage (.gpkg)", what: "The layer as GIS features with its fields as columns (the hole's own fields too, one column each). The coordinate system is written with the file (a .prj beside a Shapefile).", choose: "Use GeoPackage rather than Shapefile when field names are long: a Shapefile cuts them at ten characters." },
      { name: "Export DXF (.dxf) / Export GOCAD (.vs / .pl)", what: "Hole traces and surfaces as CAD geometry, with no attribute tables. A DXF names the project's coordinate system and the data owner's credit in comment lines at the top (a DXF has no field for them), and a GOCAD file in its header.", choose: "Use them for a CAD or a modelling program that wants geometry only. The comment lines say which coordinate system the numbers are in." },
      { name: "File > Export Project as KMZ…", what: "The whole project for Google Earth, in latitude and longitude: every layer that has a map position, in folders that follow the project, with the colours, classes and labels the 3D View draws it with; the collars (and their fields) and the traces sit at their elevation, underground.", choose: "Use it to show the drilling to someone with only Google Earth. The project needs a coordinate system; a local grid has no place on the globe." },
      { name: "File > Export Project as Geoscience ANALYST (.geoh5)…", what: "Drillholes with their intervals, the surfaces, points and block models in a geoh5 file, written by GeoStrix without Geoscience ANALYST. The coordinate system is not written.", choose: "Open it in your copy of Geoscience ANALYST and check one hole against the 3D View before you rely on it." },
      { name: "File > Export Project as OMF (.omf)…", what: "Open Mining Format, the file Leapfrog, Micromine and Datamine exchange: the drillholes as two line sets (the paths with the depth at each vertex, and the logged intervals with the assay elements, the density and the other numbers), the collars as points, and the surfaces and block models. Holes are named: the hole id is carried with every path vertex, interval and collar (as OMF mapped data, so a click on a trace reads it and a filter by hole works), the collar's own fields (hole type, year, property, prospect) sit on the Collars points, and text logs (lithology codes, a density's method) are carried the same way. Columns are named for what they hold ('Ag (g/t)', 'Pb (%)', 'Assays: from (m)'). The project's description says the coordinate system, which OMF has no field for, and the data credit.", choose: "Use it when the other program reads OMF and you want everything at once. Check one hole's name and one assay against the 3D View before you rely on it." },
      { name: "File > Export PDF…", what: "The Layout pages as a vector PDF, each page at its own paper size.", choose: "See the Layout page for the paper, the title block and the credit." },
      { name: "Block models, surfaces and slices", what: "A block model's package (UBC mesh and model, an .omf of the blocks, observed and predicted data, GeoTIFF slices and provenance.txt), a surface's mesh and a slice's sections have their own export beside them.", choose: "Choose the format by the program: OMF for Leapfrog, Micromine and Datamine; the UBC mesh and model for UBC and SimPEG." },
    ],
    warnings: [
      { says: "An OMF carries no coordinate system: these are the project's coordinates (the project's coordinate system).", means: "The file has numbers only; the program reading it will not know the coordinate system.", do: "Set the coordinate system in the other program from what the message says." },
      { says: "n text column(s) of the drillhole logs are not in the OMF (it holds numbers): the list.", means: "OMF cannot carry text such as lithology or alteration codes.", do: "Export the CSV tables as well and bring the codes from them." },
      { says: "Nothing in this project can go to an OMF yet: drillholes, points, lines, surfaces and block models do.", means: "The project has none of the kinds of data an OMF can hold.", do: "Import or build one of them first." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample (the empty 3D View offers it).",
        "Click Export on the 3D View ribbon, or right-click the Collars button in the sidebar, and choose Export all drillhole tables (.zip of CSV)…",
        "Open the zip: read provenance.txt, then collars.csv, and look at its epsg column and the hole fields.",
        "File > Export Project as OMF… and read the message: what was written, what was left out, and the coordinate system to set in the other program.",
        "In the other program, import the OMF or the CSV tables and check one hole against the 3D View.",
      ],
    },
    related: ["save-recovery", "layout", "omf", "block-models", "import-drillholes"],
  },
  {
    id: "save-recovery",
    area: "Getting started",
    title: "Save, autosave and recovery; Undo",
    summary: "How your work is kept. Save Project writes the project to its own file; the status bar says when the last autosave ran; if GeoStrix closes without saving, the next start offers to restore the autosaved work. Undo (Ctrl+Z) takes back the last edits to the data and the interpretation. The Language list at the right end of the status bar changes the words of the interface.",
    notFor: [
      "The autosave is a safety copy for a crash, not a saved project: it does not replace Save Project, and you choose its file.",
      "Undo does not cover rasters, terrain, block models or generated surfaces: delete and rebuild them. It also starts again from nothing when a coordinate system is changed for the whole project.",
      "Database passwords are never saved with a project, and are only remembered on this computer if you turn that on.",
    ],
    fields: [
      { name: "Save Project / Save Project As…", what: "Ctrl+S writes the project to its own file (a .geostrix.json); Save Project As… asks for a new name and keeps the old file as it was. The project file holds the data, the models, the Layout pages and the settings of the project.", choose: "Save to a folder you back up, and save before you run a long calculation. Use Save As… to keep a copy before a change you may regret." },
      { name: "Autosave", what: "Every 60 seconds, only if there is unsaved work that has changed since the last autosave, GeoStrix writes a recovery copy in its own folder on this computer. The status bar shows Autosaved with the time, and it clears when the work is saved. While a recovery banner is waiting for your answer the older copy is kept, and new work is still written beside it.", choose: "Do not rely on it for anything you can save yourself; it is there for a power cut or a crash." },
      { name: "Recovered unsaved work", what: "After a crash or a forced close, the next start shows a banner: Recovered unsaved work from a previous session, with the project's name and when it was autosaved. Restore opens it in tabs, marked unsaved; Discard… deletes the recovery copy after asking.", choose: "Restore first and save it under a new name, then compare it with the last saved file before you discard anything." },
      { name: "Undo and Redo", what: "Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z) cover collars, surveys, logs, assays, surface samples, sections, planned holes, design lines and strings, explicit surfaces, map layers and interpretation lines, and Layout pages. Rasters, terrain, block models and generated surfaces are not undoable. In a text box, Ctrl+Z undoes the typing there first. Changes to how things look (colours, which holes are checked, which layers are shown) are not undone: the Undo button's tooltip says so, and the first Ctrl+Z after such a change only tells you so instead of undoing a data step. Undo starts again from nothing when a project is reopened.", choose: "Before you delete a block model or a surface you want back, save the project first." },
      { name: "Language", what: "The Language list at the right end of the status bar, at the foot of the window, changes the interface between English, Español, Português (Brasil), Français and العربية (right to left). It is remembered on this computer. Project data and the text of exported files stay in English.", choose: "Share a project with a colleague in another language freely: only the interface changes, not the data." },
    ],
    warnings: [
      { says: "Recovered unsaved work from a previous session — \"name\" (autosaved when).", means: "GeoStrix closed without saving, and the autosave from before the close is waiting.", do: "Restore, then Save Project As… under a new name; discard the copy only when you have checked it." },
      { says: "Undo history is cleared.", means: "A change to the whole project, such as moving every object to another coordinate system, cannot be taken back step by step.", do: "Save a copy of the project before such a change." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample (the empty 3D View offers it), and make a small edit to the data (for example change a collar's value in its table).",
        "Wait for the status bar to show Autosaved with the time.",
        "Press Ctrl+Z and see the edit taken back; press Ctrl+Shift+Z to bring it again.",
        "File > Save Project As… and give the project a name; the status bar's autosave note clears.",
        "Change the Language to see the interface in another language, and back again.",
      ],
    },
    related: ["export-formats", "first-project", "layout"],
  },
];
