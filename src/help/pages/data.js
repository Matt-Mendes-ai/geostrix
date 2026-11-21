// Help pages for bringing drillhole data in and checking it: a first-project walk-through, the drillhole import dialog (collars, surveys, interval
// layers), the assay import, the density layer and the drillhole data QA/QC (see src/help/content.js for the page format).
// TASKS.csv #3899 (T4) — rewritten to the rule of plan_fable 3.2: short summaries and fields, the detail behind "More", two diagrams.
import { MINE_DESIGN_ENABLED } from "../../lib/features.js"; // TASKS.csv #3897 — no pointer to a switched-off tool
export default [
  {
    id: "first-project",
    area: "Getting started",
    title: "First project",
    summary: "The usual first steps: bring in collars, surveys, logs, assays and densities, check them, then look at them in 3D.",
    diagram: { id: "workflow", alt: "The usual order of work: add data, check it, look in 3D, sections and logs, lay out a page, export." },
    more: "The walk-through uses the bundled Macpass sample (Yukon: 559 holes, 32,546 assay intervals and 32,498 bulk densities, no logs), used with the permission of its owner, Fireweed Metals Corp. The owner's credit stays on the status bar while the sample is open and prints where a Layout page has the {credits} text.",
    notFor: [
      "It does not choose a coordinate system, a desurvey method or a cut-off: each has its own dialog.",
      "A sample is not your project: open it to try the tools, then start a new project for your files.",
    ],
    fields: [
      { name: "File > Open Sample Project > Macpass", what: "Opens the sample with its collars, surveys, assays and densities loaded.", choose: "Try the steps below on it before importing your own files." },
      { name: "Your own files", what: "Drop collars, surveys and logs on the 3D view; import assays in Geochem.", choose: "Collars first, then surveys, then logs, so each file finds its holes." },
    ],
    warnings: [],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample (File > Open Sample Project) and read the notices it opens with.",
        "In the sidebar, Collars and Survey are loaded and the Specific gravity layer holds the densities; the logs are empty.",
        "Click Data QC in StrixViewer's ribbon and read the errors first, then the warnings.",
        "Open Geochem to see the Ag, Pb and Zn assays. Silver is in g/t, lead and zinc in per cent.",
        "For your own project: File > New Project, import collars, surveys, logs and assays, then run Data QC again.",
      ],
    },
    related: ["import-drillholes", "import-assays", "import-density", "data-qc"],
  },
  {
    id: "import-drillholes",
    area: "StrixViewer",
    title: "Import drillhole data",
    summary: "Brings a table in as collars, survey stations or an interval layer (lithology, alteration, density…). It guesses the columns and previews before importing.",
    diagram: { id: "filesWhere", alt: "Which file goes where: collars, survey and logs to StrixViewer, assays to Geochem, densities to the density layer." },
    more: "The dialog opens when you drop a file on the 3D view or use a layer's upload button. A file name such as sg.csv or litho.csv is a hint; the columns decide.",
    notFor: [
      "Assays go through Geochem's assay import; a table that looks like assays is handed there.",
      "X, Y and a value with no hole column is a point survey: import it under Geophysics > Point survey.",
      "A shapefile or GeoPackage of lines and polygons is a map layer.",
    ],
    fields: [
      { name: "What kind of data is this?", what: "The layer the rows go to; the dialog pre-selects its best guess.", choose: "Change it when the guess is wrong." },
      { name: "Column mapping", what: "Which column fills each field of the layer; mapped columns are highlighted in the preview.", choose: "Check them against the preview; pick a column for any required field left empty." },
      { name: "Dip sign convention", what: "Whether a downward dip is negative (the usual drilling convention) or positive.", choose: "Import, look at a hole you know: if it points up, choose the other convention." },
      { name: "Azimuths in this file are measured from", what: "True, grid or magnetic north; GeoStrix converts them to the project's grid north.", choose: "Take it from the survey's documentation; give the survey date for magnetic azimuths.", more: "Magnetic azimuths are corrected by the declination at the survey date, and every azimuth by the grid convergence at its hole." },
      { name: "Units", what: "Metres or feet for the depths and lengths; feet are converted to metres." },
      { name: "Extra fields (optional)", what: "Other columns kept on each row and shown by Identify.", choose: "Keep what later checks need, such as a density's method or a log's recovery." },
    ],
    warnings: [
      { says: "3 column(s) of the file were not imported: method, low_recovery, comment. Add one under Extra fields in the import dialog to keep it.", do: "Add the ones you need under Extra fields and import again." },
      { says: "2 survey hole ids have no matching collar (NB23-014, NB23-015): their 312 stations cannot be desurveyed and won't render.", do: "Import the collars first, or fix the ids (a leading zero, a dash or the letter case)." },
      { says: "Replaced the earlier survey of NB23-001, NB23-002 and 20 more — Ctrl+Z to undo.", means: "A hole's new stations replace its earlier survey.", do: "Ctrl+Z undoes it if that was not meant.", more: "A file that starts at or below where the earlier survey ends is added below it instead (the notice then says Added below…). An identical survey changes nothing, and says so." },
      { says: "14 rows of sg.csv were left out (no hole id, no From, no value or no code).", do: "Open Data QC for the counts by file, correct the file and import again." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample, then + Add layer in the sidebar > Specific gravity.",
        "Pick sg.csv from the sample's folder (sample_data\\yk_macpass in GeoStrix's resources folder).",
        "Check the preview and the Extra fields, then import; the notice gives the rows loaded and the counts by method.",
        "Click a density interval with Identify to read its value (t/m³) and method.",
      ],
    },
    related: ["import-density", "import-assays", "data-qc"],
  },
  {
    id: "import-assays",
    area: "Geochem",
    title: "Import assays",
    summary: "Brings assay results into Geochem, one value per element per interval, keeping each element's unit and asking what blanks and negatives mean.",
    more: "A table with a column per element is wide format; a table with one row per analyte is long format. It does not convert between labs' units or set detection limits for you: it keeps the values as reported.",
    notFor: [
      "Collars, surveys and logs are not assays: import them in StrixViewer (see Import drillhole data).",
    ],
    fields: [
      { name: "Wide format (column per element) / Long format (row per analyte)", what: "Whether each element has its own column, or each row names an analyte.", choose: "One row per interval with Ag_ppm, Pb_pct… columns is wide." },
      { name: "Hole ID / From / To / Sample ID", what: "The columns that place each result.", choose: "Map a Sample ID when there is one: check samples and QC links find their sample by it." },
      { name: "Elements (ticked list) and the units shown beside each", what: "Each recognized column with its element and unit, read from the column name.", choose: "Check every unit against the certificate: the unit is never guessed from the values." },
      { name: "Not assayed (leave blank)", what: "What a small negative value means: below detection (half the limit, flagged <) or not assayed.", choose: "Take it from the lab's certificate." },
      { name: "Not assayed — left out of grades (intercepts, composites, statistics) and reported as unsampled metres", what: "A blank cell is a sample not assayed for that element, not a zero.", choose: "Choose A real measured zero only when the lab reported zero." },
      { name: "QC columns (optional)", what: "Sample type, parent sample, standard, certificate and method, kept for Geochem's QC charts.", choose: "Map them when the file has them." },
    ],
    warnings: [
      { says: "No element columns recognized — add one manually below.", do: "Add the columns by symbol (Cu), or name them Cu_ppm in the file." },
      { says: "Tick or add at least one element to import.", do: "Tick the elements you want." },
      { says: "3 negative value(s) no bigger than their column's own values (-0.005; -100 in a column of 100 to 500). Assays can't be negative, so these are codes. What do they mean?", do: "Choose below detection or not assayed." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample and go to Geochem: its Ag, Pb and Zn assays are in, each with its unit.",
        "For your own table, use Geochem's import button and pick the file.",
        "Check the ticked elements and units, answer the questions about blanks and negatives, then import.",
        "Run Data QC to see what the table leaves out.",
      ],
    },
    related: ["import-drillholes", "data-qc"],
  },
  {
    id: "import-density",
    area: "StrixViewer",
    title: "Import density (Specific gravity)",
    summary: "The Specific gravity layer is the project's density in t/m³ (the same number as g/cc): the density tonnages are taken from.",
    more: "Grade-tonnage and the tonnages of solids use a length-weighted mean of its intervals. Import it as intervals: hole, From, To and a value.",
    notFor: [
      "Densities in kg/m³ are not t/m³: divide by 1000 in the file first. The dialog warns when the column is far from a rock's density.",
      "It does not tell a measured density from a calculated one: keep the method column as an extra field.",
      "A downhole density log read every few centimetres goes to Geophysics > Downhole logs.",
    ],
    fields: [
      { name: "Value (numeric)", what: "The column holding the density, shown in t/m³.", choose: "Map the bulk density, not a weight or a count." },
      { name: "Extra fields (optional)", what: "Other columns kept with each density: method, low-recovery flag, comment.", choose: "Keep the method: the notice and Data QC count each method." },
      { name: "Rows", what: "Which rows to import, when a row filter is offered.", choose: "All of them, unless the file mixes methods you want apart." },
    ],
    warnings: [
      { says: "This layer is the density the tonnes use (t/m³): 32,498 intervals, 1.4 to 7.6.", do: "Check the range against the rock you expect." },
      { says: "The middle value of this column is 2,710, which is not a density in t/m³ (usually 1.5 to 6)", means: "The column is probably in kg/m³, or not a density.", do: "Divide it by 1000 in the file, or map the right column." },
      { says: "Value 27.1 at 42.5–43.5m is outside the plausible 1–6 range for Specific gravity — a keying or unit error?", means: "It is left out of the density the tonnages use.", do: "Correct the file, or raise the range in Data QC if the rock is that dense.", more: "The range is 1 to 6 t/m³ until you change it in Data QC's Density boxes, and a value outside it is left out of the density mean the tonnages use. Coal or tailings read near 1.3; massive galena and sphalerite 6 to 7.5." },
      { says: "212 assayed interval(s) in 9 hole(s) that have densities have no Specific gravity interval overlapping them", means: "A tonnage over these intervals has no measured density.", do: "Import densities for them, or set one by hand in Grade-tonnage." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample: its bulk densities are the Specific gravity layer.",
        "Click an interval with Identify: the value (t/m³) and its method.",
        "Run Data QC and read the Specific gravity lines.",
      ],
    },
    related: ["import-drillholes", "data-qc"],
  },
  {
    id: "data-qc",
    area: "StrixViewer",
    title: "Drillhole data QA/QC",
    summary: "Checks collars, surveys, assays and every log for problems that distort a model, worst first. It fixes nothing: correct the files and import again.",
    more: "It also says what the project lacks, such as no log of any kind.",
    notFor: [
      "A clean list means the checks found nothing, not that the holes are right.",
      "A warning is a question: a bend can be a real deflection, a gap can be core that was not cut.",
    ],
    fields: [
      { name: "Dogleg over", what: "The bend rate (degrees per 30 m) above which a bend is listed.", choose: "Deviated holes bend 3 to 7° per 30 m; set it from your own drilling.", more: "A hole's bends are one row, its sharpest. A bend under 2° is within a survey tool's reading and is not counted; 20° per 30 m or more, over at least 5°, is an error." },
      { name: "Density (t/m³)", what: "The densities this project accepts; a density outside them is left out of tonnages.", choose: "Raise the top for barite or massive sulphide.", more: `Kept with the project; 1 to 6 until changed. The tonnage tools (${MINE_DESIGN_ENABLED ? "Grade-tonnage, Pit shell, Stopes, a solid's tonnage" : "Grade-tonnage, a solid's tonnage"}) say how many densities they left out.` },
      { name: "Collar vs terrain over", what: "How far (m) a collar may sit off the terrain before it is listed.", choose: "Above your terrain model's own error.", more: "The button beside it sets those collars on the terrain; Undo puts them back." },
      { name: "Filter by category", what: "Shows one category only (Collars, Survey, a layer, Assays…)." },
      { name: "Export CSV", what: "Saves every issue, with the project, thresholds and desurvey method in a header.", choose: "Use it to send the list to the data's owner." },
      { name: "Re-run", what: "Runs the checks again on the data as it is now." },
    ],
    warnings: [
      { says: "No survey station between 0 m and 339 m (68% of the hole; the stations are usually 3 m apart): the path there is interpolated between the two stations, not measured.", do: "Find the missing stations, or accept that part as interpolated.", more: "A gap is listed when it is over 50 m and over five times the hole's usual spacing. A survey that stops short of the hole's end has its own warning." },
      { says: "Dogleg 4.2° over 10 m between 150 m and 160 m", do: "Check those stations for a typo or a bad shot; a real deflection is fine.", more: "Close stations scale a small angle into a large rate, so the rate is taken over at least 10 m." },
      { says: "No lithology, alteration, vein, structure or other log is in the project", means: "There are no logged contacts to model from.", do: "Import the logs, or model from assays and shells only." },
      { says: "37 unsampled gap(s) of more than 5 m lie between samples inside the sampled range", do: "Check the lab's sample list for those metres." },
      { says: "127 of 559 holes with a collar have no assays", do: "Check whether they were assayed, and whether the hole ids match." },
    ],
    howto: {
      sample: "Macpass",
      steps: [
        "Open the Macpass sample and click Data QC in StrixViewer's ribbon.",
        "Read the counts at the top; the list is worst first.",
        "Filter by category to read the survey bends, then Specific gravity and Assays.",
        "Export CSV to save the list, or Re-run after changing a file.",
      ],
    },
    related: ["import-drillholes", "import-assays", "import-density"],
  },
];
