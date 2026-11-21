// TASKS.csv #1966 — 3D View pages of the offline help (see src/help/content.js for the page format)
// TASKS.csv #3899 (T4) — rewritten to the rule of plan_fable 3.2: short summaries and fields, the detail behind "More", the section / fence / strip
// log diagram. "Advanced" in the walk-throughs is now the ribbon's All tools switch, as the interface says.

// What every section window offers once a section is open (SectionWindow.jsx), shared by the two section pages
const sectionWindowFields = [
  { name: "Buffer ± (section window)", what: "How far either side of the line holes and data are included; Enter redraws.", choose: "About half the distance between drill sections, so each hole shows on one.", more: "It is saved with the section. Traces drawn dashed are projected from farther away; a wider buffer where holes are sparse shows data projected from farther off the line." },
  { name: "VE (section window)", what: "Vertical exaggeration; 1x is true scale.", choose: "1x to read dips and true widths; say so on the figure if you exaggerate." },
  { name: "What to draw / Save contacts (section window)", what: "Draws a contact, fault, string or outline, snapping to the logged tops; Save contacts sends them to modelling.", choose: "Draw across strike; save before moving to the next section." },
  { name: "Plan a hole (section window)", what: "Click a collar, then a target: azimuth, dip and length, and Add planned hole.", choose: "To aim a hole at a contact or intercept on the section." },
  { name: "Snapshot to Layout / PNG / SVG / PDF (section window)", what: "Sends the section to Layout, or exports it as drawn.", choose: "SVG or PDF to edit or print large; PNG for a quick image." },
  { name: "Own window (section window)", what: "Opens the section in its own window, beside another.", choose: "Only to compare two side by side; it uses more memory than a tab." },
];

export default [
  {
    id: "slice-3d",
    area: "StrixViewer",
    title: "3D slice",
    summary: "A live cut through the 3D view, a vertical slab or a horizontal level, to look inside dense drilling or a block model.",
    more: "Nothing is saved or exported, and no data changes: turning it off brings everything back.",
    notFor: [
      "It is not a section (no window, buffer, drawing or export): use Draw section, By coordinates, Fence series or Level plan.",
    ],
    fields: [
      { name: "Slice the view / On", what: "Turns the cut on and off.", choose: "Off before a figure of the whole project." },
      { name: "Vertical slab / Horizontal (level plan)", what: "A vertical cut at a strike, or a horizontal cut at an elevation.", choose: "Vertical along your drill sections; horizontal to step through a model." },
      { name: "Az", what: "The strike of the vertical cut, 0 to 180°.", choose: "The strike of your drill sections." },
      { name: "Position slider", what: "Moves the cut across the drilling; the line under it gives its place." },
      { name: "Thickness (m)", what: "The width of the slab kept; 0 keeps one whole side of the cut.", choose: "About the drill-section spacing." },
    ],
    warnings: [
      { says: "Load drillholes to set the slice range.", do: "Load holes or a block model, then turn the slice on again." },
      { says: "Everything on one side of a vertical cut striking 45°", means: "Thickness is 0.", do: "Type a thickness to keep a slab only." },
    ],
    howto: {
      sample: "WA lode gold",
      steps: [
        "File > Open Sample Project > WA lode gold (66 inclined drillholes, oriented structures).",
        "Switch to All tools (top right of the ribbon); on StrixViewer, press 3D slice.",
        "Tick On, keep Vertical slab and type the drill sections' strike in Az.",
        "Set Thickness to the section spacing and drag the slider across the holes.",
        "Switch to Horizontal (level plan) to step down level by level.",
      ],
    },
    related: ["section-by-coordinates", "slice-series", "block-models", "voxel-ranges"],
  },
  {
    id: "section-by-coordinates",
    area: "StrixViewer",
    title: "Section by coordinates",
    summary: "Opens a vertical section from a centre, an azimuth and a length, in its own window with the nearby holes, logs, models and surfaces.",
    diagram: { id: "sectionFenceLog", alt: "In plan: a section is one line through the holes, a fence is several parallel lines, a strip log is one hole down its length." },
    more: "Leave the centre blank to centre it on the drilling. The section is kept in the Cross-sections list. In its window you can draw contacts, plan a hole, send a snapshot to Layout and export it.",
    notFor: [
      "Two clicks on the plan: Draw section. Parallel sections: Fence series. A horizontal cut: Level plan.",
      "A section in the plane of one hole: the scissors on that hole in the Holes list.",
    ],
    fields: [
      { name: "Centre E / Centre N", what: "The middle of the line; blank uses the view's centre.", choose: "A target, an intercept or an anomaly." },
      { name: "Azimuth (°)", what: "The line's direction, clockwise from north.", choose: "Across the target's strike, so dips read true." },
      { name: "Length (m)", what: "The line's full length, half each side of the centre.", choose: "The target and the holes either side, with a margin." },
      { name: "Open section", what: "Opens the section; the same line again reopens the saved one.", choose: "Set Buffer (m) on the Draw section tool first, or Buffer ± in the window after." },
      { name: "Scissors (Holes list)", what: "A section in the plane of that hole, the whole hole long.", choose: "To look along one hole's intercepts.", more: "A vertical hole has no bearing: the section uses the azimuth typed here." },
      ...sectionWindowFields,
    ],
    warnings: [
      { says: "Enter a centre easting and northing — there are no drillholes to centre the section on.", do: "Type Centre E and Centre N." },
      { says: "NB23-001 is vertical, so it has no bearing of its own — the section runs at the typed azimuth, 90°.", do: "Type the azimuth you want before the scissors." },
      { says: "NB23-014 has no desurveyed trace to cut a section through.", do: "Check the hole's collar and survey rows." },
      { says: "3 hole(s) lie more than 5 m off the section (offset printed at the end of the trace); points not snapped to a hole sit on the section plane.", do: "Narrow the buffer, or tick Keep snaps on the section, when the offsets matter.", more: "Holes in the buffer but off the line are projected onto it; contacts snapped to them keep the hole's real position." },
      { says: "NB23-009: outside the ±25 m buffer — projected onto the section, no data drawn here", do: "Widen Buffer ± to see its data on this section." },
    ],
    howto: {
      sample: "WA lode gold",
      steps: [
        "File > Open Sample Project > WA lode gold (66 inclined drillholes, oriented structures).",
        "Switch to All tools; on StrixViewer, Sections > By coordinates.",
        "Leave the centre blank; type an Azimuth across the holes' trend and a Length that covers them.",
        "Open section; set Buffer ± to half the distance to the next line and press Enter.",
        "Plan a hole at an intercept, or Snapshot to Layout for a figure.",
      ],
    },
    related: ["slice-series", "slice-3d", "planned-drillholes", "explicit-surface", "section-correlation"],
  },
  {
    id: "slice-series",
    area: "StrixViewer",
    title: "Slice series (fence sections)",
    summary: "Makes parallel vertical sections at one azimuth, a fixed width apart, that tile the drilling with no gaps or overlap.",
    more: "Each section's buffer is half the width. They are added as one group to the Cross-sections list, to open one at a time in the usual section window; the visible block models can be covered too.",
    notFor: [
      "It does not open every section at once: open them from the Cross-sections list.",
      "One section at a chosen place: Section by coordinates or Draw section. A correlation panel: 3D Modelling > Fence diagram.",
    ],
    fields: [
      { name: "Azimuth (°)", what: "The direction every section runs; they step at right angles to it.", choose: "The azimuth of your drill lines.", more: "0° makes north–south sections named by easting, 90° east–west sections named by northing; others are named by their offset from the middle of the data." },
      { name: "Width (m)", what: "The spacing between sections, on round grid lines.", choose: "Your drill-line spacing; for a model alone, a whole number of cells." },
      { name: "Also cover the visible block models", what: "Also covers the visible models' extent, not only the drilling.", choose: "Off when the model is much larger than the drilling." },
      { name: "This makes 8 section(s).", what: "How many sections the settings make.", choose: "If large, widen the spacing." },
      { name: "Generate", what: "Adds the sections, grouped, to the Cross-sections list; over 50 asks first." },
      ...sectionWindowFields,
    ],
    warnings: [
      { says: "Slice series needs a visible voxel/block model or at least one drillhole to know what extent to cover — nothing found.", do: "Load holes or show a block model, then Generate." },
      { says: "This will create 8 sections. Continue?", do: "Cancel and widen the spacing, unless you want them all." },
      { says: "Generated 8 sections spaced 50m apart at azimuth 45° — grouped together in the Cross-sections list.", do: "Open them one at a time; the group removes in one action." },
    ],
    howto: {
      sample: "WA lode gold",
      steps: [
        "File > Open Sample Project > WA lode gold (66 inclined drillholes, oriented structures).",
        "Switch to All tools; on StrixViewer, Sections > Fence series.",
        "Type the drill sections' Azimuth and their spacing as Width.",
        "Read This makes … section(s), then Generate.",
        "Open the sections one by one from the Cross-sections list.",
      ],
    },
    related: ["section-by-coordinates", "slice-3d", "block-models", "section-correlation"],
  },
  {
    id: "unit-polygons",
    area: "Geological Mapping",
    title: "Unit polygons",
    related: ["interpretation-lines", "geology-map", "map-layers"],
    summary: "Draws a map unit's outline by clicking its corners in the 3D view; Model it can build a 3D model from the polygons.",
    more: "Usually drawn in a top view over the terrain, an orthophoto or a geophysics image. The polygons are a geology map layer with a unit field.",
    notFor: [
      "It does not trace or snap to a raster: every corner is your click.",
      "Faults and lineaments as lines: Interpret. Contacts on a section: the section window.",
    ],
    fields: [
      { name: "Layer / New layer…", what: "The drawn geology layer the next polygon goes into.", choose: "One layer per map." },
      { name: "Unit", what: "The unit's name, which sets its colour and its 3D unit.", choose: "Your map legend's names, spelled the same every time." },
      { name: "Note (optional)", what: "A note saved on the polygon.", choose: "What placed the boundary." },
      { name: "Draw a polygon / Finish / Undo point / Cancel", what: "Click the corners in order; double-click or Finish closes the outline.", choose: "At least three corners." },
      { name: "Polygons in \"Lithology\"", what: "The layer's polygons with their unit and area; the bin removes one.", choose: "Redraw a wrong boundary rather than keep it.", more: "Show, hide, style and export the whole layer under Maps > Map layers." },
    ],
    warnings: [
      { says: "A polygon needs at least three points.", do: "Click at least three corners." },
      { says: "Name the unit before finishing the polygon.", do: "Type the unit's name, then Finish." },
      { says: "Click the first corner of the unit.", do: "Click where the outline starts." },
    ],
    howto: {
      sample: "Perk-Rocky",
      steps: [
        "File > Open Sample Project > Perk-Rocky (geological mapping, no drillholes).",
        "On Geological Mapping, press Unit polygons (Draw) and turn to a top view.",
        "New layer…, type the unit, Draw a polygon, click its corners; double-click to close.",
        "Repeat for each unit, then press Model it.",
      ],
    },
  },
  {
    id: "interpretation-lines",
    area: "StrixViewer",
    title: "Interpretation lines",
    summary: "Draws faults, contacts, lineaments and other lines by clicking in the 3D view, as a map layer with type and confidence on each.",
    more: "Usually drawn over a geophysics survey or a map. Each line can carry a dip or plunge, a name and a note. The layer drapes on the terrain, exports as Shapefile, GeoPackage, KML or DXF, and prints in the Layout legend.",
    notFor: [
      "It picks nothing automatically: every line is your interpretation.",
      "These are 2D map lines; contacts for modelling are drawn in the section window.",
    ],
    fields: [
      { name: "Survey", what: "The survey or raster the lines are drawn on; it names the layer.", choose: "The survey you are interpreting." },
      { name: "Layer / New layer…", what: "The interpretation layer the next line goes into.", choose: "One layer per survey or interpretation." },
      { name: "Line type", what: "Fault, Contact, Lineament, Dyke, Fold axis, Anomaly axis, Trend, Unit boundary or Other; it sets the colour.", choose: "The type you would put in a legend." },
      { name: "Confidence", what: "certain, probable or possible.", choose: "A lineament from one survey is rarely certain." },
      { name: "Dip / Dip direction, or Plunge / Plunge direction (optional)", what: "Dip for faults, dykes and contacts; plunge for axes, lineaments and trends.", choose: "Only from a measurement or a reasoned estimate." },
      { name: "Name (optional) / Note (optional)", what: "A name and a note saved on the line.", choose: "Name the lines a report refers to." },
      { name: "Draw a line / Finish / Undo point / Cancel", what: "Click points in the 3D view; double-click or Finish ends the line.", choose: "In a top view for a map-like line." },
      { name: "Lines in \"Contacts\"", what: "The layer's lines with their lengths; the bin removes one." },
    ],
    warnings: [
      { says: "A line needs at least two points.", do: "Click at least two points." },
      { says: "dip is 0 to 90 degrees and dip direction is 0 to 360.", do: "Correct the value, or leave it blank." },
      { says: "Click the first point on the survey.", do: "Click where the line starts." },
    ],
    howto: {
      sample: "Perk-Rocky",
      steps: [
        "File > Open Sample Project > Perk-Rocky (geological mapping, no drillholes).",
        "On StrixViewer, press Interpret (Measure & check) and turn to a top view.",
        "New layer…, Line type Lineament, Confidence possible.",
        "Draw a line along a lineament you see; double-click to end it.",
      ],
    },
    related: ["map-layers", "geology-map", "point-survey", "terrain"],
  },
];
