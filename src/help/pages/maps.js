// TASKS.csv #1966 — offline help pages (see src/help/content.js for the page format)
// TASKS.csv #3899 (T8) — rewritten to the rule of plan_fable 3.2: short summaries and fields, the detail behind "More".
export default [
  {
    id: "boundaries",
    area: "Maps",
    title: "Boundaries",
    // TASKS.csv #3982 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "Imports property lines, grids and survey outlines as lines in 3D.",
    picture: { drop: ["map"], alt: "Outlines draped on the ground." }, // the lands-here / far-off picture when it is drawn
    instead: [{ text: "Claims with tenure", to: "Mineral claims", page: "claims" }, { text: "Coloured units", to: "Geology map", page: "geology-map" }],
    keys: ["Import boundary (.ply / .dxf / .zip / .shp / .gpkg / .kml / .gpx / .geojson)…", "Drape on terrain"],
    summary: "Imports property lines, grid outlines and survey extents as lines in the 3D view.",
    more: "Reads Geosoft .ply, DXF, shapefile (.zip / .shp), GeoPackage, KML / KMZ, GPX or GeoJSON, several files at once. Each file (each DXF layer, each GeoPackage table) becomes one boundary with its own colour, drawn at a fixed elevation or draped on the terrain. Contours made in the Terrain pane are listed here too. From a DXF only lines, polylines and points are read. Points in a KML, GPX or GeoJSON come in through StrixViewer or Geological Mapping.",
    notFor: [
      "Claims with tenure, status and expiry: use Mineral claims / tenure.",
      "Outlines coloured by unit or with attributes: Geological Mapping > Geology map.",
    ],
    fields: [
      { name: "Import boundary (.ply / .dxf / .zip / .shp / .gpkg / .kml / .gpx / .geojson)…", gist: "select every file at once", what: "Reads one or more outline files.", choose: "Select every file at once.", more: "KML, KMZ, GPX and GeoJSON are reprojected from WGS 84 (or a GeoJSON's stated CRS); a shapefile or GeoPackage from its own CRS when it states one; .ply and DXF are taken as already in the project CRS. A DXF becomes one boundary per layer and keeps its elevations. The message says whether each was reprojected." },
      { name: "Boundary card (show / hide, parts, remove)", what: "The eye shows or hides it; the bin removes it, after asking.", more: "The count is its separate lines." },
      { name: "Drape on terrain", gist: "on the ground, else at Elev.", what: "Draws the boundary on the terrain; greyed out until a terrain is loaded.", more: "Tick it for property lines and grid outlines." },
      { name: "Elev.", what: "The elevation of an undraped boundary.", more: "Set the ground, section or bench level. It starts from the project's data (usually the collars)." },
      { name: "Colour", what: "The boundary's line colour." },
    ],
    warnings: [
      { says: "claims.shp: it states no CRS: the coordinates were taken as EPSG:26909, check where it lies", do: "Check it lands around your data; if not, reproject it.", more: "The shapefile has no .prj (or the GeoPackage no CRS), so the project's coordinate system was assumed. You can also move it with Maps > A layer. Find its CRS first." },
      { says: "claims.shp: its .prj names a CRS GeoStrix does not recognize: the coordinates were taken as EPSG:26909, check where it lies", do: "Reproject it to the project CRS in your GIS.", more: "GeoStrix cannot convert that coordinate system, so the file was not reprojected. You can also move it with Maps > A file." },
      { says: "drift_plan.dxf: every string had elevation 0, read as a 2D plan", do: "Nothing for a plan; tick Drape on terrain or set Elev." },
      { says: "No lines or polygons found in this KML (points are imported through StrixViewer importer).", do: "Import the points through StrixViewer or Geology map.", more: "Or Geological Mapping > Geology map." },
      { says: "Failed: claims_b.shp (unreadable)", do: "Fix or re-export that file.", more: "The others were imported." },
    ],
    howto: {
      sample: "your own data",
      steps: [
        "Maps > Boundaries > Import boundary…, select the outline files.",
        "Check each boundary lands around your holes; a far one has a missing or wrong CRS.",
        "Load a terrain and tick Drape on terrain, or set Elev.",
        "Give each boundary a Colour; hide unused ones with the eye.",
      ],
    },
    related: ["claims", "map-layers", "web-layers", "terrain"],
  },
  {
    id: "map-layers",
    area: "Maps",
    title: "Map layers & outcrop structures",
    // TASKS.csv #3982 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "Imports mapping layers and outcrop structures, draped on the terrain.",
    picture: { drop: ["map"], alt: "A geology map and a strike-and-dip symbol draped on the ground." },
    instead: [{ text: "Outlines", to: "Boundaries", page: "boundaries" }, { text: "Claims", to: "Mineral claims", page: "claims" }, { text: "Grids", to: "Maps > GeoTIFF / GXF" }, { text: "Oriented core", to: "with the drillholes", page: "import-drillholes" }],
    keys: ["Import map layer…", "Colour by / .qml", "North / Measured on"],
    strip: ["Open Perk-Rocky", "Colour by the unit", "Lower an Opacity", "Set the Symbol size"],
    summary: "Imports surface-mapping layers and outcrop structure measurements, and drapes them on the terrain in the 3D view.",
    more: "Map layers (geology, alteration and outcrop polygons, fault traces, sample points) are coloured by one of their attributes, optionally with a QGIS .qml style. Structures are drawn as discs in the measured plane, coloured by type. These tools are on the Geological Mapping tab, as Geology map and Outcrop structures. Features far from the project's holes and samples are left out on import, and a layer wholly outside is refused (often a CRS problem). Only QGIS Categorized styles are read from a .qml. To import MapInfo files yourself, select the .TAB with its .MAP, .ID and .DAT in Import map layer…. The Perk-Rocky sample's dip directions are taken as grid north; set North on import if yours were magnetic. Plain outlines go to Boundaries, claims to Mineral claims / tenure, images and grids (GeoTIFF, GXF) to Maps > GeoTIFF / GXF.",
    notFor: [
      "Plain outlines: Boundaries; claims: Mineral claims; grids: GeoTIFF / GXF.",
      "Oriented-core structures (alpha / beta) come in with the drillholes.",
    ],
    fields: [
      { name: "Source CRS (map layers)", what: "The coordinate system of the map files: the file's own, else the project's.", more: "Layers are reprojected into the project CRS. Change it only when a shapefile has no .prj or a wrong one." },
      { name: "Import map layer…", gist: "select all parts together", what: "Reads GeoPackage, shapefile, MapInfo .tab or .mif, GPX, GeoJSON and KML / KMZ.", choose: "Select all parts of a layer together.", more: "A shapefile is a .zip, or a .shp with its .dbf, .prj and .cpg; a MapInfo layer is a .tab with its .map, .id and .dat, or a .mif with its .mid. Every table of a GeoPackage and every geometry kind becomes its own layer. A .qml selected in the same dialog styles the layers imported with it. Without the .dbf, .dat or .mid it has no attributes to colour by." },
      { name: "Choose what to import", what: "Shown when some tables do not belong on this map.", choose: "Keep the defaults.", more: "The tables are grouped: map layers for this area, reference grids, text labels, regional or distant maps, and tables with no position (legends, scale bars, page frames). Only the tables that belong are ticked; one distant layer zooms the view far out." },
      { name: "Drape on terrain / Elev.", what: "Draws the layer on the terrain, or at one elevation without one.", more: "Without internet, Voxel / block models > Terrain from the model's top can give a terrain. Drape every layer once a terrain is loaded." },
      { name: "Opacity", what: "How see-through the layer is.", more: "A polygon layer named like a covering map area can come in nearly transparent, with its outlines shown. Lower it to see a layer beneath." },
      { name: "Colour by / .qml", gist: "an attribute, or a QGIS style", what: "The attribute that sets the colours; .qml applies a QGIS Categorized style.", more: "Pick the unit or code field." },
      { name: "Polygon outlines / Legend", what: "Outlines draws polygon edges; the Legend lists each unit with a tick, its colour and its count." },
      { name: "Import structure measurements…", what: "Reads outcrop measurements from a CSV or a MapInfo point table.", choose: "Easting, northing, dip and either dip direction or strike are needed.", more: "The columns are Easting, Northing, Elevation, Dip, Dip dir., Strike, Type, Station and Comments. A strike alone gives the dip direction by the right-hand rule. A column check follows." },
      { name: "Source CRS (structures)", what: "The coordinate system of the measurements; it defaults to the project's.", more: "Grid dip directions are turned with the grid when reprojected. Set it when the data were recorded in another zone or datum." },
      { name: "North / Measured on", gist: "grid, true or magnetic", what: "Which north the dips and strikes were measured from: Grid, True or Magnetic (compass).", more: "Magnetic needs the measurement date, for the declination (IGRF-14). All are converted to grid north on import. Take it from the field notes: uncorrected compass readings are magnetic." },
      { name: "Structure set card: Export…, Disc size, Sit every measurement on the terrain", what: "Export writes GeoPackage, KML or CSV; the last box places every disc on the terrain.", choose: "Keep the discs on the terrain unless the elevations were surveyed.", more: "Export gives dip, dip direction and right-hand-rule strike in grid and true north. Unticked, rows with an elevation use it. Disc size is in metres. GPS elevations are often tens of metres off." },
    ],
    warnings: [
      { says: "geology.shp: none of its 412 features comes within reach of the project's holes and samples, so nothing was imported (check its CRS if it should).", do: "Set the Source CRS and import again.", more: "The whole layer lies far from the project, almost always because its coordinate system is missing or wrong." },
      { says: "geology.shp: no matching .dbf selected — imported without attributes, so it can't be styled by unit", do: "Import again with .shp, .dbf and .prj together.", more: "Or remove the layer first." },
      { says: "A .qml on its own doesn't import anything — use the .qml button on a layer's card to apply it to an existing layer.", do: "Press .qml on the layer's card." },
      { says: "Enter the date the measurements were taken — the magnetic declination depends on it.", do: "Enter the date beside Measured on." },
      { says: "7 row(s) have a strike and dip direction that aren't 90° apart — the dip direction was used; check whether those strikes are left-hand-rule.", do: "Check the field convention.", more: "The dip directions used are still right." },
      { says: "Pick at least easting, northing, dip, and either dip direction or strike.", do: "Choose the missing columns." },
    ],
    howto: {
      sample: "Perk-Rocky",
      steps: [
        "Open the Perk-Rocky sample.",
        "Geological Mapping > Geology map: on PR-Litho_interpV3, check Colour by is Litho_code and untick a unit in its Legend.",
        "Turn on PR-Alt_interpV2 and lower its Opacity.",
        "Outcrop structures: change Disc size; leave Sit every measurement on the terrain ticked.",
      ],
    },
    related: ["geology-map", "outcrop-structures", "boundaries", "terrain", "web-layers"],
  },
  {
    id: "claims",
    area: "Maps",
    title: "Mineral claims / tenure",
    // TASKS.csv #3982 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "Imports claim outlines with tenure number, status and expiry; status sets the colour.",
    picture: { drop: ["map"], alt: "Claim outlines draped on the ground, coloured by status." }, // the lands-here / far-off picture when it is drawn
    cautions: ["It checks no registry: keep the status current yourself."],
    instead: [{ text: "MapInfo .tab, or every attribute", to: "Geology map", page: "geology-map" }],
    keys: ["Status", "Area"],
    summary: "Imports claim outlines and keeps a tenure number, status and expiry date with each; the status sets the colour.",
    more: "Reads the same formats as Boundaries and shows each claim's area in hectares. Active is green, pending amber, expired red. Each claim can be draped on the terrain. Only the tenure number, claim name and good-to date are read, from columns named that way (for example TENURE_NUMBER_ID, CLAIM_NAME, GOOD_TO_DATE). To keep owners and other attributes, import with Geological Mapping > Geology map, or a WFS service as a Map layer (Web layers). A file of more than 300 features (a whole province) comes in as one claim, and the message says so: clip it in a GIS first. The area is a plan area in the project's coordinates, not the registry's legal area: holes (a ring inside another) are taken away, and parts that overlap without one inside the other count twice. Download one file per claim to get a card each; the registry's area is the one to compare.",
    notFor: [
      "It does not check a registry; the expiry date does not change the status.",
      "MapInfo .tab files are not read here.",
    ],
    fields: [
      { name: "Import claim boundary (.ply / .dxf / .zip / .shp / .gpkg / .kml / .gpx / .geojson)…", what: "Reads one or more files, reprojected as in Boundaries; a new claim is Active.", more: "A shapefile or GeoPackage of several features (up to 300) gives one claim per feature, with tenure number, name and good-to date filled in from columns named so; other files give one claim each. Import the registry's tenure shapefile as it is." },
      { name: "Name", what: "The claim's name; click to edit.", more: "It is the file name, followed by the claim name or tenure number when the file holds several claims. Use the registry's name or number." },
      { name: "Tenure #", what: "The tenure number, from the file or typed in.", more: "Copy it from the registry." },
      { name: "Status", gist: "Active, Pending or Expired", what: "Active, Pending or Expired; it also sets the colour.", choose: "Keep it current: GeoStrix does not check it." },
      { name: "Expiry", what: "The expiry date, from the file or typed in.", more: "Copy the good-to date from the registry." },
      { name: "Area", gist: "a plan area: compare with the registry's", what: "The area of the outline in hectares.", choose: "Compare it with the registry's: a large difference means a wrong outline or CRS." },
      { name: "Drape on terrain / Elev.", what: "Draws the claim on the terrain, or at one elevation.", more: "Drape once a terrain is loaded." },
      { name: "Colour", what: "The line colour, from the status." },
    ],
    warnings: [
      { says: "Imported 2 claim boundary file(s) (5 total).", do: "Read the notes after it; check where the claims land." },
      { says: "claims.shp: it states no CRS: the coordinates were taken as EPSG:26909, check where it lies", do: "If it lands wrongly, reproject the file to the project CRS.", more: "The file has no stated coordinate system, so the project's was assumed." },
      { says: "KML coordinates could not be converted to EPSG:26909.", do: "Check the project CRS in Maps > Project CRS." },
      { says: "Failed: claims_b.shp (unreadable)", do: "Fix or re-export the named file." },
    ],
    howto: {
      sample: "your own data",
      steps: [
        "Download your claims as a shapefile (.zip) or KML.",
        "Maps > Claims > Import claim boundary….",
        "On each card, set Tenure #, Status and Expiry and compare the Area.",
      ],
    },
    related: ["boundaries", "web-layers", "map-layers"],
  },
  {
    id: "web-layers",
    area: "Maps",
    title: "Web layers (WMS / WFS)",
    // TASKS.csv #3982 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "Adds a layer from an online WMS (a picture) or WFS (features) by its URL.",
    picture: { drop: ["map"], alt: "A layer from an online service, draped on the ground." }, // the WMS / WFS tiles when they are drawn
    cautions: ["A WMS layer is a picture, with no values."],
    instead: [{ text: "A real grid", to: "Maps > GeoTIFF / GXF" }],
    keys: ["WMS / WFS, the URL and Fetch layers", "Limit to the current project area (recommended for province/country-wide layers)", "Import as"],
    summary: "Adds a layer from an online OGC service by its URL, as in QGIS: a WMS as a draped image, a WFS as vector features.",
    more: "A WMS layer is fetched once, as an image of an area you choose, and draped as a raster. A WFS layer comes as a Map layer that keeps its attributes or as boundary lines. Tile services (WMTS) are not supported. A WFS server must return GeoJSON (GML-only servers are not read), at most 2,000 features per request. It needs an internet connection and a project coordinate system; layers are fetched once and kept in the project, not updated live. A WMS layer has colours only and cannot be filtered; import a real grid in Maps > GeoTIFF / GXF. After Import this layer the WMS image is in Maps > GeoTIFF / GXF and the WFS map layer in Geological Mapping > Geology map.",
    notFor: [
      "A WMS layer is a picture, with no values: for a real grid, import a GeoTIFF or GXF.",
    ],
    fields: [
      { name: "Add web layer (WMS / WFS)…", what: "Opens the dialog, asking first for the project CRS if none is set.", more: "The layer is fetched for where your coordinates point. Set the project CRS before adding web layers." },
      { name: "WMS / WFS, the URL and Fetch layers", gist: "the service's address, then its layers", what: "The service type and its address; Fetch layers reads its list of layers.", more: "Use the address QGIS would take." },
      { name: "Choose a layer…", what: "The layers the service offers, with descriptions." },
      { name: "Area / Draw a different area…", what: "WMS only: the area to fetch, by default the project's.", choose: "Keep the project area, widened only as needed.", more: "A smaller area gives finer pixels." },
      { name: "Detail", what: "WMS only: the image's longest side: Standard, High or Very high.", choose: "Bring the pixel size near the service's own resolution.", more: "Standard is 1,024 px, High 2,048 px and Very high 4,096 px. Beyond the service's resolution the pixels are only enlarged. A line shows the ground pixel size, the image size and how many map requests it takes. Remembered on this computer. A larger image grows the project file." },
      { name: "Limit to the current project area (recommended for province/country-wide layers)", gist: "keep it ticked for big layers", what: "WFS only: fetches only the features in the project area.", choose: "Keep it ticked for province-wide layers such as tenure.", more: "The project area is the drillholes, else the terrain, the map layers or the surface samples. It is greyed out until the project has an area." },
      { name: "Import as", gist: "Map layer keeps attributes", what: "WFS only: Map layer (keeps attributes) or Boundary lines (3D outlines only).", choose: "Map layer, to keep tenure numbers or unit codes.", more: "Points or mixed geometry always come in as boundary lines." },
      { name: "Import this layer", what: "Fetches and adds the layer, then says what came in.", choose: "Check the result line for failures.", more: "A WMS image is listed with the rasters (Maps > GeoTIFF / GXF); a WFS map layer with the map layers (Geological Mapping > Geology map). Look for failed requests or a truncated count." },
    ],
    warnings: [
      { says: "No layers found in this service's capabilities — double check the URL.", do: "Check the URL and the WMS / WFS type." },
      { says: "Server response wasn't valid XML — check the URL points at a real WMS/WFS service.", do: "Use the service URL, not a viewer page." },
      { says: "Try another layer: the server did not return valid GeoJSON. …", means: "The server may not offer GeoJSON, or may need GML, which GeoStrix does not read.", do: "Try another layer or server, or import the file.", more: "Or download the data and import it." },
      { says: "Tick \"Limit to the current project area\", or work in a smaller area, to get them all: this is only the server's first 1,000 features, …", do: "Tick Limit to the current project area." },
      { says: "3 of 48 requests failed and are left transparent.", do: "Import again, or choose a lower Detail." },
      { says: "This server returned projected coordinates (metres) without saying which coordinate system they are in, so they can't be placed correctly. Try another layer or server.", do: "Try another layer or server, or import a file with its CRS." },
    ],
    howto: {
      sample: "your own data",
      steps: [
        "Find the service's WMS or WFS address in its documentation.",
        "Maps > Web layers > Add web layer…: choose the type, paste the URL, Fetch layers, choose a layer.",
        "WMS: check Area and Detail. WFS: keep Limit to the current project area and choose Import as.",
        "Press Import this layer and read the result line.",
      ],
    },
    related: ["boundaries", "claims", "map-layers", "terrain"],
  },
];
