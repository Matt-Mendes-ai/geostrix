// TASKS.csv #1966 — 3D View pages of the offline help (see src/help/content.js for the page format)

// What every section window offers once a section is open (SectionWindow.jsx), shared by the two section pages
const sectionWindowFields = [
  { name: "Buffer ± (section window)", what: "How far either side of the line holes and data are included. Press Enter to redraw with it; it is saved with the section. Traces drawn dashed are projected from farther away.", choose: "About half the distance between your drill sections, so each hole shows on one section. Widen it where holes are sparse, knowing that what you see is then projected from farther off the line." },
  { name: "VE (section window)", what: "Vertical exaggeration; 1x is true scale.", choose: "Keep 1x when you read dips and true widths; exaggerate only to see thin, flat units, and say so on the figure." },
  { name: "What to draw / Save contacts (section window)", what: "Draws an upper contact of a unit, a fault, a string or a closed outline on the section, with clicks that snap to the logged tops in the holes (Snap to holes). Save contacts sends them to the modelling tools.", choose: "Draw on sections across the strike, and save before moving to the next parallel section with the arrows." },
  { name: "Plan a hole (section window)", what: "Click the collar (snapped to the ground profile when there is one), then the target: the window gives azimuth, dip and length, and Add planned hole puts the hole in Targeting > Planned drillholes.", choose: "Use it to aim a hole at a contact or intercept you can see on the section." },
  { name: "Snapshot to Layout / PNG / SVG / PDF (section window)", what: "Snapshot to Layout sends the section to the Layout page for a printed figure; PNG, SVG and PDF export the section as it is drawn, with its text and scale.", choose: "Use SVG or PDF when the figure will be edited or printed large; PNG for a quick image." },
  { name: "Own window (section window)", what: "Opens the section in a window of its own, to compare it beside another. It uses more memory than a tab.", choose: "Use it only when you need two sections side by side on a modest computer." },
];

export default [
  {
    id: "slice-3d",
    area: "3D View",
    title: "3D slice",
    summary: "Cuts everything in the 3D view with a moving cut: a vertical slab at a chosen strike, or a horizontal level. It is a live cut of the view, for looking inside a dense drill pattern or a block model. Nothing is saved or exported.",
    notFor: [
      "It is not a section: there is no window, no buffer, no drawing and no export. For a section use Draw section, By coordinates or Fence series; for a horizontal section with pierce points and assays, use Level plan.",
      "It does not change any data. Turning it off brings everything back.",
    ],
    fields: [
      { name: "Slice the view / On", what: "Turns the cut on and off.", choose: "Turn it off before taking a figure of the whole project, or the cut stays in the picture." },
      { name: "Vertical slab / Horizontal (level plan)", what: "A vertical cut at a strike azimuth, or a horizontal cut at an elevation.", choose: "Vertical to look along your drill sections; horizontal to see a level through a block model or a pattern of holes." },
      { name: "Az", what: "The strike of the vertical cut, 0 to 180° (a cut striking 0° and one striking 180° are the same).", choose: "Use the strike of your drill sections, which is usually across the strike of the target." },
      { name: "Position slider", what: "Moves the cut across the extent of the drilling (or of the other data when there are no holes). The line under it gives the elevation or the slab it shows.", choose: "Drag slowly and watch the holes and blocks appear and disappear." },
      { name: "Thickness (m)", what: "The width of the slab kept in view. 0 keeps everything on one side of the cut.", choose: "About your drill-section spacing, so each slab shows one line of holes; thinner to read a block model level by level." },
    ],
    warnings: [
      { says: "Load drillholes to set the slice range.", means: "There are no holes or other data to set the range the slider moves over.", do: "Load holes or a block model, then turn the slice on again." },
      { says: "Everything on one side of a vertical cut striking {az}°", means: "Thickness is 0, so the view is cut in half rather than reduced to a slab.", do: "Type a thickness to keep only a slab." },
    ],
    howto: {
      sample: "Woodjam",
      steps: [
        "File > Open Sample Project > Woodjam (19 drillholes, IP lines, ZTEM).",
        "Switch to Advanced (top right of the ribbon). On the 3D View tab, press 3D slice.",
        "Tick On. Keep Vertical slab and type the strike of the drill sections in Az.",
        "Set Thickness to about the section spacing and drag the position slider across the holes.",
        "Switch to Horizontal (level plan) to step down through the ZTEM model level by level.",
      ],
    },
    related: ["section-by-coordinates", "slice-series", "block-models", "voxel-ranges"],
  },
  {
    id: "section-by-coordinates",
    area: "3D View",
    title: "Section by coordinates",
    summary: "Opens a vertical cross-section from numbers: a centre easting and northing, an azimuth and a length. Leave the centre blank to centre it on the drilling. The section opens in its own window with the holes, logs, block models and surfaces within the buffer projected onto it, and is kept in the Cross-sections list. In the window you can draw contacts, plan a hole, send a snapshot to Layout and export it.",
    notFor: [
      "To place the line with two clicks on the plan, use Draw section. For a set of parallel sections, use Slice series (Fence series on the ribbon). For a horizontal cut at an elevation, use Level plan.",
      "For a section in the plane of one hole, use the scissors on that hole in the Holes list.",
    ],
    fields: [
      { name: "Centre E / Centre N", what: "The middle of the section line. Blank uses the centre of the drilling (the placeholder says data centre).", choose: "Type the point you want in the middle: a target, a hole's intercept, a geophysical anomaly." },
      { name: "Azimuth (°)", what: "The direction the section line runs, clockwise from north.", choose: "Across the strike of the target, so the holes and the body are seen in their true dip. On a grid program, the azimuth of your drill lines." },
      { name: "Length (m)", what: "The full length of the line, half on each side of the centre.", choose: "Long enough to show the target and the holes either side of it, with some margin." },
      { name: "Open section", what: "Opens the section in its window, with the buffer set on the Draw section tool (Buffer (m) on the ribbon while it is active). The same line opened again reopens the saved section.", choose: "Set the buffer first (press Draw section to see Buffer (m) on the ribbon), or change it afterwards with Buffer ± in the window." },
      { name: "Scissors (Holes list)", what: "Opens a section in the plane of that hole: along its collar-to-end bearing, long enough to show the whole hole. A vertical hole uses the azimuth typed here.", choose: "Use it to look along one hole's intercepts." },
      ...sectionWindowFields,
    ],
    warnings: [
      { says: "Enter a centre easting and northing — there are no drillholes to centre the section on.", means: "The centre is blank and nothing is shown to take it from (no holes, models, samples or map layers in view).", do: "Type Centre E and Centre N." },
      { says: "{holeId} is vertical, so it has no bearing of its own — the section runs at the typed azimuth, {azimuth}°.", means: "A vertical hole has no direction in plan, so the section uses the azimuth in this pane.", do: "Type the azimuth you want before pressing the scissors." },
      { says: "{holeId} has no desurveyed trace to cut a section through.", means: "The hole has no collar position or survey to build its trace from.", do: "Check the hole's collar and survey rows." },
      { says: "{n} hole(s) lie more than 5 m off the section (offset printed at the end of the trace); points not snapped to a hole sit on the section plane.", means: "Holes within the buffer but off the line are projected onto it; contacts drawn by snapping to them keep the hole's real position.", do: "Narrow the buffer, or tick Keep snaps on the section, when the offsets matter for what you draw." },
      { says: "{hole_id}: outside the ±{corridor} m buffer — projected onto the section, no data drawn here", means: "The hole's trace passes outside the buffer; only its trace is shown, without its logs.", do: "Widen Buffer ± if you need its data on this section." },
    ],
    howto: {
      sample: "Woodjam",
      steps: [
        "File > Open Sample Project > Woodjam (19 drillholes, IP lines, ZTEM).",
        "Switch to Advanced (top right of the ribbon). On the 3D View tab, Sections > By coordinates.",
        "Leave Centre E and Centre N blank to centre on the drilling; type an Azimuth across the trend of the holes and a Length that covers them.",
        "Open section. In its window, set Buffer ± to about half the distance to the next line of holes and press Enter.",
        "Press Plan a hole to aim a hole at an intercept, or Snapshot to Layout for a figure.",
        "Export the section as SVG or PDF for a report.",
      ],
    },
    related: ["slice-series", "slice-3d", "planned-drillholes", "explicit-surface", "section-correlation"],
  },
  {
    id: "slice-series",
    area: "3D View",
    title: "Slice series (fence sections)",
    summary: "Makes a set of parallel vertical sections at one azimuth, spaced a fixed width apart on round grid lines, over the drilling (and over the visible block models when you tick it). Each section's buffer is half the width, so together they tile the ground with no gaps and no overlap. They are added as one group to the Cross-sections list, to open one at a time; each opens in the same section window as any other section.",
    notFor: [
      "It does not open every section at once: open them from the Cross-sections list as you need them.",
      "For one section at a chosen place, use Section by coordinates or Draw section. For a correlation panel between holes, use 3D Modelling > Fence diagram.",
    ],
    fields: [
      { name: "Azimuth (°)", what: "The direction every section runs. The sections are stepped at right angles to it. A 0° series is north–south sections named by their easting; a 90° series is east–west sections named by their northing; other azimuths are named by their offset from the middle of the data.", choose: "The azimuth of your drill lines, so each section runs along one line of holes." },
      { name: "Width (m)", what: "The spacing between sections, and twice each section's buffer. Lines sit on round multiples of the width.", choose: "Your drill-line spacing, so each hole falls on one section only. For a block model alone, a whole number of its cells." },
      { name: "Also cover the visible block models", what: "Off: the series covers the drilling only (or the visible block models when there are no holes). On: it also covers the visible models' extent.", choose: "Leave it off when the model is much larger than the drilling, or you get many sections with no holes on them." },
      { name: "This makes {n} section(s).", what: "How many sections the current settings make, before any is created.", choose: "If the number is large, widen the spacing or untick the block models." },
      { name: "Generate", what: "Adds the sections, grouped, to the Cross-sections list. More than 50 asks first.", choose: "Check the count above before pressing it." },
      ...sectionWindowFields,
    ],
    warnings: [
      { says: "Slice series needs a visible voxel/block model or at least one drillhole to know what extent to cover — nothing found.", means: "There are no holes and no visible block model to set the ground the series covers.", do: "Load holes, or show a block model, then Generate." },
      { says: "This will create {n} sections. Continue?", means: "The settings make more than 50 sections.", do: "Cancel and widen the spacing, or untick the block models, unless you really want them all." },
      { says: "Generated {created} sections spaced {width}m apart at azimuth {sliceSeriesAzimuth}° — grouped together in the Cross-sections list.", means: "The sections were made and are in the Cross-sections list as one group.", do: "Open them one at a time from the list; the group can be removed in one action." },
    ],
    howto: {
      sample: "Woodjam",
      steps: [
        "File > Open Sample Project > Woodjam (19 drillholes, IP lines, ZTEM).",
        "Switch to Advanced (top right of the ribbon). On the 3D View tab, Sections > Fence series.",
        "Type the Azimuth of the drill sections and a Width equal to their spacing.",
        "Leave Also cover the visible block models off (the ZTEM model is far larger than the drilling) and read This makes … section(s).",
        "Generate, then open the sections one by one from the Cross-sections list.",
      ],
    },
    related: ["section-by-coordinates", "slice-3d", "block-models", "section-correlation"],
  },
  {
    id: "unit-polygons",
    area: "Surface Geology",
    title: "Unit polygons",
    related: ["interpretation-lines", "geology-map", "map-layers"],
    summary: "Draws the outline of a map unit by clicking its corners in the 3D view, usually in a top view over the terrain, an orthophoto or a geophysics image. The polygons are a geology map layer with a unit field, drawn in GeoStrix rather than imported, so Model it can build a 3D model from them.",
    notFor: [
      "It does not trace contacts automatically or snap to a raster: every corner is your click.",
      "A unit polygon is a 2D map polygon. Faults, contacts and lineaments as lines are drawn with Interpret; contacts on a cross-section with the section window.",
    ],
    fields: [
      { name: "Layer / New layer…", what: "The drawn geology layer the next polygon goes into, or a new one (named Geology (drawn) unless you type a name).", choose: "One layer per map keeps it easy to show, hide, style and export." },
      { name: "Unit", what: "The unit name saved in the polygon's unit field and used for its colour; the list offers the units already on the map layers.", choose: "Use the names of your map legend, the same spelling every time, so one unit is one colour and one 3D unit." },
      { name: "Note (optional)", what: "A note saved on the polygon.", choose: "Note what you saw that placed the boundary." },
      { name: "Draw a polygon / Finish / Undo point / Cancel", what: "Draw a polygon starts clicking in the 3D view; each click adds a corner where it hits. Double-click or Finish closes the outline back to the first corner.", choose: "Click the corners in order around the unit; a polygon needs at least three." },
      { name: "Polygons in \"{layer}\"", what: "The polygons of the chosen layer with their unit and area in hectares; the bin removes one. The whole layer is shown, hidden, styled and exported under Maps > Map layers.", choose: "Remove and redraw a polygon rather than leaving a wrong boundary." },
    ],
    warnings: [
      { says: "A polygon needs at least three points.", means: "Finish was pressed with fewer than three corners.", do: "Click at least three corners in the 3D view." },
      { says: "Name the unit before finishing the polygon.", means: "The Unit box is empty.", do: "Type the unit's name, then Finish." },
      { says: "Click the first corner of the unit.", means: "Drawing is on and waiting for the first click.", do: "Click in the 3D view where the unit's outline starts." },
    ],
    howto: {
      sample: "Perk-Rocky",
      steps: [
        "File > Open Sample Project > Perk-Rocky (geological mapping, no drillholes).",
        "On the Surface Geology tab, press Unit polygons (Draw) and turn the view to a top view.",
        "Choose New layer…, type the unit's name, press Draw a polygon and click the corners of one unit; double-click to close it.",
        "Repeat for the next unit; Show, style or export the layer under Maps > Map layers.",
        "Press Model it to build a 3D model from the drawn map and the outcrop measurements.",
      ],
    },
  },
  {
    id: "interpretation-lines",
    area: "3D View",
    title: "Interpretation lines",
    summary: "Draws faults, contacts, lineaments, fold axes and other lines by clicking in the 3D view, usually over a geophysics survey or a map. Each set of lines is a map layer with the line type, confidence, an optional dip or plunge, a name and a note on every line. The layer drapes on the terrain, exports as Shapefile, GeoPackage, KML or DXF, and prints in the Layout legend.",
    notFor: [
      "It does not pick lines automatically: every line is your interpretation, and the confidence you set is saved with it.",
      "Lines drawn here are 2D map lines. To draw contacts on a cross-section for modelling, use the section window's What to draw and Save contacts.",
    ],
    fields: [
      { name: "Survey", what: "The geophysics survey or raster the lines are drawn on; it is saved with each line and names the layer. (none named) is allowed.", choose: "Pick the survey you are interpreting, so the layer says what the lines were drawn on." },
      { name: "Layer / New layer…", what: "The interpretation layer the next line goes into, or a new one (its name defaults to Interpretation — survey).", choose: "One layer per survey or per interpretation keeps them easy to show, hide and export." },
      { name: "Line type", what: "Fault, Contact, Lineament, Dyke, Fold axis, Anomaly axis, Trend, Unit boundary or Other. The type sets the line's colour.", choose: "Use the type you would put in a map legend; Other only when none fits." },
      { name: "Confidence", what: "certain, probable or possible.", choose: "Say how sure you are: a lineament picked from one survey is rarely certain." },
      { name: "Dip / Dip direction, or Plunge / Plunge direction (optional)", what: "Shown for the types that have one: dip for a fault, dyke, contact or unit boundary; plunge for a fold axis, anomaly axis, lineament or trend. Angle 0 to 90, direction 0 to 360.", choose: "Fill them only from a measurement or a reasoned estimate; blank is better than a guess." },
      { name: "Name (optional) / Note (optional)", what: "A name and a note saved on the line.", choose: "Name the lines you will refer to in a report; note what you saw in the data that made you draw it." },
      { name: "Draw a line / Finish / Undo point / Cancel", what: "Draw a line starts clicking in the 3D view; each click adds a point where it hits. Double-click or Finish ends the line.", choose: "Draw in a top view for a map-like line." },
      { name: "Lines in \"{layer}\"", what: "The lines of the chosen layer with their lengths; the bin removes one. The whole layer is shown, hidden, styled and exported under Maps > Map layers.", choose: "Remove a line here; remove the whole layer under Map layers." },
    ],
    warnings: [
      { says: "A line needs at least two points.", means: "Finish was pressed with fewer than two points.", do: "Click at least two points in the 3D view." },
      { says: "{angle} is 0 to 90 degrees and {direction} is 0 to 360.", means: "The dip or plunge, or its direction, is outside its range or not a number.", do: "Correct the value, or leave it blank." },
      { says: "Click the first point on the survey.", means: "Drawing is on and waiting for the first click.", do: "Click in the 3D view where the line starts." },
    ],
    howto: {
      sample: "Perk-Rocky",
      steps: [
        "File > Open Sample Project > Perk-Rocky (geological mapping, no drillholes).",
        "On the 3D View tab, press Interpret (Measure & check) and turn the view to a top view.",
        "Leave Survey on (none named), choose New layer… and set Line type to Lineament and Confidence to possible.",
        "Draw a line: click along a lineament you see in the terrain or the map, then double-click to end it.",
        "Show, style or export the layer under Maps > Map layers.",
      ],
    },
    related: ["map-layers", "geology-map", "point-survey", "terrain"],
  },
];
