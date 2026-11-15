// Help pages for bringing drillhole data in and checking it: a first-project walk-through, the drillhole import dialog (collars, surveys, interval
// layers), the assay import, the density layer and the drillhole data QA/QC (see src/help/content.js for the page format).
export default [
  {
    id: "first-project",
    area: "Getting started",
    title: "First project",
    summary: "The first things most people do: bring in the collars, the downhole surveys, the logs, assays and densities, then check them before modelling anything. This page walks through that on the bundled Macpass sample (Yukon: 559 holes, 32,546 assay intervals and 32,498 bulk densities, no logs), which is used with the permission of its owner, Fireweed Metals Corp.",
    notFor: [
      "It does not choose a coordinate system, a desurvey method or a cut-off for you. Each of those has its own page or dialog.",
      "A sample is not your project: open it to see how the tools behave, then start a new project for your own files.",
    ],
    fields: [
      { name: "File > Open Sample Project > Macpass", what: "Opens the bundled sample with its collars, surveys, assays and densities loaded, and says where the data came from. The data owner's credit stays on the status bar while the project is open, and prints on a Layout page where the {credits} text is.", choose: "Use it to try the steps below before importing your own files; the sample's README lists what is real in it." },
      { name: "Your own files", what: "Drop collars, surveys and logs on the 3D view (or use the buttons in the sidebar), and open Geochem to import assays.", choose: "Bring in the collars first, then the surveys, then the logs, so each file finds its holes." },
    ],
    warnings: [],
    howto: {
      sample: "Macpass",
      steps: [
        "Open File > Open Sample Project and choose the Macpass zinc-lead-silver sample. Read the notices it opens with: the number of holes, assay intervals and densities, and the owner's credit.",
        "Look at the sidebar. Collars and Survey are loaded; the Specific gravity layer holds the bulk densities; Lithology, Alteration and the other logs are empty because the sample has none.",
        "Click Data QC in the 3D View's ribbon. Read the errors first, then the warnings and notes: they say what is left out of the sample, such as holes with no assays and intervals with no density.",
        "Open Geochem to see the Ag, Pb and Zn assays. Silver is in ppm, lead and zinc in per cent: the units are set when the assays are imported (see Import assays).",
        "To start your own project, use File > New Project, then import your collars, surveys, logs and assays in that order, and run Data QC again.",
      ],
    },
    related: ["import-drillholes", "import-assays", "import-density", "data-qc"],
  },
  {
    id: "import-drillholes",
    area: "3D View",
    title: "Import drillhole data",
    summary: "Brings a table into the 3D view as collars (one row per hole), survey stations (depth, azimuth and dip) or an interval layer such as lithology, alteration, veins, geotechnical logs or density. The dialog opens when you drop a file or use a layer's upload button, guesses what the table is from its column names, and shows a preview before anything is imported.",
    notFor: [
      "Assays go through Geochem's assay import, which asks about units, empty cells and detection limits; a table that looks like assays is handed there.",
      "A table with X, Y and a measurement and no hole column is a survey of points (magnetics, gravity); import it under Geophysics > Point survey.",
      "A shapefile or GeoPackage of lines and polygons is a map layer, not a drillhole table.",
    ],
    fields: [
      { name: "What kind of data is this?", what: "The layer the rows go to: Collars, Survey, Lithology, Alteration, Veins, Specific gravity, a custom layer and so on. The dialog pre-selects its best guess.", choose: "Change it when the guess is wrong. A name such as sg.csv or litho.csv is used as a hint, but the columns decide." },
      { name: "Column mapping", what: "Which column of the file fills each field of the layer (Hole ID, From, To, Value; X, Y, Z, Length, Azimuth and Dip for collars; Depth, Azimuth and Dip for survey stations). Mapped columns are highlighted in the preview.", choose: "Check the mapped columns against the preview. A guess is shown with a note; if a required field has no column, pick one." },
      { name: "Dip sign convention", what: "Whether a downward dip is negative (the usual convention in drilling) or positive.", choose: "Look at a hole you know: a drill hole going down should read as down in the 3D view after the import. If it points up, the other convention is the right one." },
      { name: "Azimuths in this file are measured from", what: "True north, grid north or magnetic north. GeoStrix converts them to the project's grid north, using the declination (for magnetic azimuths, from the survey date) and the grid convergence at each hole.", choose: "Take it from the survey's own documentation. Pick the survey date when the azimuths are magnetic." },
      { name: "Units", what: "Metres or Feet for depths and lengths in the file; feet are converted to metres on the way in.", choose: "Choose Feet only when the depths themselves are in feet." },
      { name: "Extra fields (optional)", what: "Other columns of the file kept on each row, listed under Identify. The dialog fills the list with the columns the layer does not take (a method flag, a comment); remove any you do not want, or add more.", choose: "Keep the columns that matter for later checks, such as a density's method or a log's recovery." },
    ],
    warnings: [
      { says: "{n} column(s) of the file were not imported: {cols}. Add one under Extra fields in the import dialog to keep it.", means: "The columns named carry values that no field of the layer took.", do: "Add the ones you need under Extra fields and import again, or leave them if you do not need them." },
      { says: "{n} survey hole ids have no matching collar", means: "The survey names holes that are not in the collar table, so those stations cannot be placed.", do: "Import the collars first, or fix the hole ids (a leading zero, a dash or a letter case is a common difference)." },
      { says: "rows of {file} were left out", means: "Rows with no hole id, no From, no value or no code are left out and counted, with the reason.", do: "Open Data QC for the counts by file, correct the file and import it again." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample, then use + Add layer in the sidebar and choose Specific gravity.",
        "Pick the sg.csv file from the sample's folder. The dialog opens with Specific gravity selected, the hole, From, To and value columns mapped, and method, low_recovery and comment listed under Extra fields.",
        "Read the preview, then import. The notice says how many rows loaded, that this layer is the density the tonnes use, and how many are of each method.",
        "Click a density interval with Identify to read its value, in t/m³, and its method.",
      ],
    },
    related: ["import-density", "import-assays", "data-qc"],
  },
  {
    id: "import-assays",
    area: "Geochem",
    title: "Import assays",
    summary: "Brings assay results into Geochem as intervals with one value per element. A table with a column for each element is wide format; a table with one row per analyte is long format. The dialog lists the element columns it recognizes, lets you tick the ones to import, asks what a blank cell and a negative value mean, and keeps the units with each element.",
    notFor: [
      "It does not convert one lab's units to another's or decide detection limits for you; it keeps the values as reported and asks about the codes a lab uses.",
      "Collars, surveys and logs are not assays: import them in the 3D View (see Import drillhole data).",
    ],
    fields: [
      { name: "Wide format (column per element) / Long format (row per analyte)", what: "Whether each element has its own column, or each row names an analyte and gives its value.", choose: "Look at the preview: one row per sample interval with Ag_ppm, Pb_pct and Zn_pct columns is wide; one row per sample and analyte is long." },
      { name: "Hole ID / From / To / Sample ID", what: "The columns that place each result: the hole, the start and end of the interval, and the sample's own id.", choose: "Map a Sample ID when the file has one: it is how check samples and QC links find their sample later." },
      { name: "Elements (ticked list) and the units shown beside each", what: "Each recognized column is a tick box with its element and unit (ppm, ppb or per cent, from the column name such as Ag_ppm or Pb_pct). A column blank in every row is left unticked.", choose: "Check that every element has the unit the lab reported: silver in ppm and lead and zinc in per cent is typical of a base-metal table, and the unit is not guessed from the values." },
      { name: "Not assayed (leave blank)", what: "For negative values no larger than their column's own values (-0.005 in a column of small numbers). Below detection stores half the limit and flags the value with a less-than sign; Not assayed leaves the value blank.", choose: "Take it from the lab's certificate: a negative value usually codes a result below the detection limit." },
      { name: "Not assayed — left out of grades (intercepts, composites, statistics) and reported as unsampled metres", what: "The choice for blank cells: a blank is a sample that was not assayed for that element, so it is left out of the grades and counted as unsampled metres, rather than read as zero.", choose: "Choose A real measured zero only when the lab reported zero." },
      { name: "QC columns (optional)", what: "Sample type, parent sample, CRM or standard name, lab certificate and analytical method, kept with each row for the QC charts in Geochem.", choose: "Map them when the file has them; a table that holds only check-sample links can be imported as QC links." },
    ],
    warnings: [
      { says: "No element columns recognized — add one manually below.", means: "No column name looks like an element with a unit.", do: "Add the columns by hand with the element's symbol (such as Cu), or rename the columns in the file (Cu_ppm)." },
      { says: "Tick or add at least one element to import.", means: "No element is selected.", do: "Tick the elements you want." },
      { says: "{codes} negative value(s) no bigger than their column's own values", means: "Assays cannot be negative, so the values are codes.", do: "Choose what they mean (below detection, or not assayed)." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample and go to Geochem: its Ag, Pb and Zn assays are already in, with the units kept with each element.",
        "To import your own table, use the import button in Geochem and pick the file.",
        "Check the preview and the ticked elements and their units, then answer the questions about blanks, negatives and zeros.",
        "Import. The notice says how many rows loaded and how many holes and intervals they cover; run Data QC after to see what the table leaves out.",
      ],
    },
    related: ["import-drillholes", "data-qc"],
  },
  {
    id: "import-density",
    area: "3D View",
    title: "Import density (Specific gravity)",
    summary: "The Specific gravity layer is the project's density, in tonnes per cubic metre (t/m³, the same number as g/cc). It is the density the Grade-tonnage dialog and the tonnages of solids take their tonnes from, as a length-weighted mean of its intervals. Import it as a table of intervals: hole, From, To and a density value.",
    notFor: [
      "A column of densities in kg/m³ is not t/m³: divide it by 1000 in the file first. The dialog warns when the middle value of the mapped column is far from a rock's density.",
      "It does not tell a measured density from a calculated one on its own. Keep the method column as an extra field, and the import notice and Data QC count the values of each method.",
      "It is not a downhole density log read every few centimetres; a log like that goes to Geophysics > Downhole logs.",
    ],
    fields: [
      { name: "Value (numeric)", what: "The column holding the density. The Specific gravity layer shows it with the unit t/m³ in the legend and in Identify.", choose: "Map the bulk density, not a weight or a count." },
      { name: "Extra fields (optional)", what: "Other columns kept with each density: a method (measured, regressed, laboratory), a low-recovery flag, a comment.", choose: "Keep a method column: a calculated density is not a measurement, and Data QC and the notice say how many are of each kind." },
      { name: "Rows", what: "Which rows of the file to import, when a row filter is offered.", choose: "Leave every row unless the file mixes density methods you want to keep apart." },
    ],
    warnings: [
      { says: "This layer is the density the tonnes use (t/m³): {n} intervals, {min} to {max}.", means: "The import says what the layer is for, the number of intervals, and their range.", do: "Check the range against what you expect for the rock; then see the counts by method that follow." },
      { says: "The middle value of this column is {m}, which is not a density in t/m³ (usually 1.5 to 6)", means: "The mapped column is probably in kg/m³ or is not a density at all.", do: "Divide the column by 1000 in the file, or map the right column, before importing." },
      { says: "{n} assayed interval(s) in {h} hole(s) that have densities have no Specific gravity interval overlapping them", means: "A tonnage over these intervals has no measured density.", do: "Measure or import densities for them, or choose a density by hand in Grade-tonnage." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample: its 32,498 bulk densities are the Specific gravity layer.",
        "Open the layer's panel in the sidebar: it says that the layer is the project's density and where it is used.",
        "Click an interval with Identify: the value carries its unit (t/m³) and its method.",
        "Run Data QC and read the Specific gravity lines: the counts by method and the assayed intervals with no density.",
      ],
    },
    related: ["import-drillholes", "data-qc"],
  },
  {
    id: "data-qc",
    area: "3D View",
    title: "Drillhole data QA/QC",
    summary: "Checks collar coordinates, survey trajectories, assays and every logged layer for the problems that quietly distort a modelled surface, before you model. It lists issues as errors, warnings and notes, worst first, and fixes nothing: you correct the files and import again. It also says what the project lacks, such as having no log of any kind.",
    notFor: [
      "It does not prove the data is right: a clean list means the checks found nothing, not that the holes are correct.",
      "A warning is a question, not a verdict. A bend in a hole can be a real deflection, a short gap between samples can be core that was not cut.",
    ],
    fields: [
      { name: "Dogleg over", what: "The survey bend rate, in degrees per 30 m, above which a bend is warned about. A hole's bends are one row (its sharpest, with how many there are). A bend of under 2° is within what a survey tool reads and is not counted; 20° per 30 m or more, over at least 5°, is an error.", choose: "Ordinary deviated holes bend 3 to 7° per 30 m; set the level from your own drilling, and treat a short spacing rated over 10 m with care." },
      { name: "Collar vs terrain over", what: "How far a collar's elevation may differ from the terrain surface (in metres) before it is listed. The button beside it sets those collars to the terrain, and it can be undone.", choose: "Choose a level above your terrain model's own error; a coarse model flags honest collars." },
      { name: "Filter by category", what: "Shows only the issues of one category: Collars, Survey, a layer, Assays, Specific gravity and so on.", choose: "Work through one category at a time." },
      { name: "Export CSV", what: "Saves every issue with its severity, category, hole and message, and a header with the project, coordinate system, desurvey method and thresholds.", choose: "Use it to hand the list to the person who owns the data." },
      { name: "Re-run", what: "Runs the checks again on the data as it is now.", choose: "Run it after correcting a file and importing it again." },
    ],
    warnings: [
      { says: "Dogleg {dl}° over {dMD} m between {depth} m and {depth2} m", means: "Two survey stations bend more than the level allows. Close stations scale a small angle up into a large rate, so the rate is taken over at least 10 m.", do: "Check the stations for a typo or a bad shot; a real deflection (a wedge) is fine." },
      { says: "No lithology, alteration, vein, structure or other log is in the project", means: "The holes carry assays or densities only, so there are no logged contacts for the modelling tools to build from.", do: "Import the logs, or model from assays and shells only." },
      { says: "{n} unsampled gap(s) of more than {d} m lie between samples inside the sampled range", means: "Core between two samples was not assayed, or its results are not in the table.", do: "Check the lab's sample list for those metres." },
      { says: "{n} of {m} holes with a collar have no assays", means: "These holes are in the collar table but have no assay rows.", do: "Check whether they were assayed, and whether the hole ids match." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample and click Data QC in the 3D View's ribbon.",
        "Read the counts at the top: errors, warnings and notes. The list is worst first, with the survey bends after the other warnings.",
        "Filter by category to read the Survey bends, then the Specific gravity and Assays lines.",
        "Click Export CSV to save the list, or Re-run after changing a file.",
      ],
    },
    related: ["import-drillholes", "import-assays", "import-density"],
  },
];
