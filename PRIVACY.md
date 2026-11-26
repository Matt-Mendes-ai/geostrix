# Privacy policy

GeoStrix is a desktop application that runs on your own machine. It has no accounts, no sign-in, and
no analytics or telemetry of any kind.

This policy describes the application's behaviour as of version 0.2.14. It is published here so that
anyone can check what the application does with their data before installing it.

## What is collected

**Nothing.** GeoStrix does not collect, transmit or store any personal information, usage data, crash
reports or telemetry. There is no analytics SDK in the application, and no server operated by this
project that receives data from it.

**Problem reports.** *Help → Report a Problem* writes a zip file to your Downloads folder containing
what you typed, a picture of the GeoStrix window, system details (versions, operating system, memory,
graphics card), recent error messages (including screen crashes from earlier sessions, which GeoStrix
keeps in a small file in its own data folder on your computer) and, unless you untick it, the Python
engine's recent log. The
current project is included only if you tick it. GeoStrix sends nothing itself: it opens a draft email
to support@geostrix.com in your own email app, and the report is shared only if you attach it and send it.

## Where your data lives

Your project data — drillhole collars, surveys, interval layers, assays, rasters, and everything else
you import — stays on your own computer, in the `.geostrix.json` project file you choose to save, plus
an autosave file in the application's own user-data directory. It is never uploaded anywhere.

Database passwords entered in the *Connect to database* dialog are, by default, held in memory for the
application session only. If you tick *Remember the password on this computer*, the password is stored
encrypted by the operating system (Electron safeStorage; on Windows, DPAPI — readable only by your Windows
account on that computer) in the application's user-data folder. It is never written to the project file
or the autosave file, and *Forget it* deletes it.

## Network connections the application makes

GeoStrix only makes network requests as a direct result of features you use:

| When | Where | Why |
| --- | --- | --- |
| You add a basemap | `tile.openstreetmap.org`, `tile.tracestrack.com`, `tiles.maps.eox.at` | Fetch map tiles for display |
| You fetch terrain, or an AI app asks and you allow it | `s3.amazonaws.com/elevation-tiles-prod`, `copernicus-dem-30m.s3.amazonaws.com`, `canelevation-dem.s3.ca-central-1.amazonaws.com`, `datacube.services.geo.ca` | Download public SRTM/Terrarium elevation tiles, or the Copernicus GLO-30 elevation model, or Natural Resources Canada's MRDEM-30 / HRDEM lidar models (Canada only; the HRDEM option first asks NRCan's catalogue which lidar tiles cover your area) for your area when you choose one; with the AWS tiles, a few small reads of Copernicus GLO-30 check any isolated cone the tiles show |
| You fetch imagery for a spectral index, or the latest Sentinel-2 scene as a natural-colour image, or NAIP aerial imagery (USA), or an AI app asks for a Sentinel-2 image and you allow it | `earth-search.aws.element84.com`, `sentinel-cogs.s3.us-west-2.amazonaws.com`, `planetarycomputer.microsoft.com`, `astersa.blob.core.windows.net`, `naipeuwest.blob.core.windows.net` | Search the public Sentinel-2 / ASTER / NAIP catalogues for your area (the area's bounding box is sent) and download that window of the image |
| You download public geochemistry (Geochem → Public data) | `openmaps.gov.bc.ca`, `services.ga.gov.au`, `mrdata.usgs.gov`, `geochem.nrcan.gc.ca`, `dnrmaps.gov.nl.ca`, `gis.saskatchewan.ca`, `mapservices.gov.yk.ca`, `public-services.slip.wa.gov.au`, `opendata.maps.vic.gov.au`, `opendata.sgb.gov.br`, `gsi.geodata.gov.ie` | Ask the BC Regional Geochemical Survey, the National Geochemical Survey of Australia, the USGS NGDB / NURE service, or the Newfoundland and Labrador, Saskatchewan, Yukon, Western Australia, Victoria or Brazil geological survey's service, for the samples inside your area (the area's bounding box, and for the USGS the map quadrangles it covers, are sent), or download the GSC CDoGS data package you chose or Geological Survey Ireland's Tellus file (only the file name is sent) |
| On startup (can be turned off in the Help menu), and via *Help → Check for Updates* | `github.com`, then `release-assets.githubusercontent.com` (GitHub's download server, which github.com redirects to) | Check whether a newer release exists, and download it if you choose to update |
| You click *Install predictive modelling…* (3D Modelling tab → geoML models) | `github.com`, then `release-assets.githubusercontent.com` | Download the optional predictive-modelling add-on (its checksum is verified before it is installed) |
| You connect to a database | The host **you** enter | Query your own PostgreSQL or MySQL / MariaDB database |
| You fetch Macrostrat geology (Maps → Web layers), or the map units at the project centre | `tiles.macrostrat.org`, `macrostrat.org` | Fetch the geology map tiles for the project area and the units and map sources at one point (data CC BY 4.0) |
| You open a BC sample project that is not on your computer yet (Harry, Perk-Rocky, Silvertip), after confirming the download | `apps.nrs.gov.bc.ca`, `cmscontent.nrs.gov.bc.ca` | Download that sample's public data from the Province of British Columbia (the assessment report's data package, or the BC Geological Survey's drillhole database for Harry) and convert it on your computer; BC's terms do not let GeoStrix include it in the installer |
| You add a WMS / WMTS / WFS layer | The server **you** enter, or the one you pick under *Common services* (`openmaps.gov.bc.ca`, `services.ga.gov.au`, `public-services.slip.wa.gov.au`) | Fetch the layer you requested |

These requests necessarily reveal your IP address to the operator of the service being contacted
(OpenStreetMap, Amazon S3, GitHub, or a server you chose), in the same way that visiting any website
does. Those third parties have their own privacy policies, which this project does not control. No
identifier for you or your project is attached to any of these requests, with one exception: if you use the Tracestrack
topographic basemap, the Tracestrack API key you entered is sent to Tracestrack with every tile request, and that key
is tied to your Tracestrack account. (Database and WMS / WFS servers receive the login you give them, as any client.)

GeoStrix's built-in spell checker is turned off, so no spelling dictionary is ever downloaded.

If you never use basemaps, terrain, satellite imagery, public geochemistry, Macrostrat geology, updates, the add-on download,
the BC sample downloads, databases or WMS layers, GeoStrix makes no network connections at all.

## AI app access (optional, off by default)

**Tools → AI App Access** lets an AI app you already use (for example Claude Desktop) read the project that is open in GeoStrix: the holes and their collar fields, assay grades, logged intervals, sections, grade statistics, best intercepts, the trend helper's suggestion and where the project stands in guided modelling (a read of the data, not a change). It cannot open files, see a file path or use a password, and what it asks for is limited to a page of rows at a time.

**Changes (optional, off by default).** A second switch, *Allow AI apps to make changes*, lets the AI app also do some of what GeoStrix's own buttons do: colour the holes, show or hide layers, point the view, add a section, add a Layout page (a one-click sheet or a Best intercepts table), build a model surface, a vein, an alteration halo or a grade shell from your logs and assays (the same Build it for me as in StrixViewer, shown as it runs and cancellable there), a fault from your logged fault picks and intervals (the Faults pane's own build), a stratigraphic model from your geological map (the Model from map pane's own run, shown as it runs and cancellable there), estimate grades into a block model in the Grade estimation dialog, add the last model's blocks or the last grade shell's cells as a block model, save a candidate rule as an element's anomaly threshold (never replacing one already saved), grid a point survey or filter a grid into a new raster (worked out on your computer), grid a per-hole value or a surface-sample element into a raster, add a multivariate anomaly score as a new column, and download a satellite image or a terrain for the project area. Every change shows in GeoStrix as it happens, with an Undo button. An AI app cannot delete or overwrite anything, save the project, write a file or change GeoStrix's settings. Each download is asked for in GeoStrix, every time, and happens only after you say yes; it goes to the same public services, with the same data sent (the area's location), as when you press the button yourself.

**What the AI app receives leaves GeoStrix.** The answers go to that AI app and from there to the AI provider it uses (for example Anthropic for Claude), under that provider's terms and privacy policy. Switch it on only for a project you may share with that provider. The link between GeoStrix and the AI app makes no network connection: it is a private pipe on your computer (no network port), protected by a code made fresh each time GeoStrix starts.

It is off by default; it turns itself off when GeoStrix closes unless you tick *Keep it on when GeoStrix restarts*; GeoStrix asks you the first time each AI app connects; the status bar shows it while it is on, and the window lists everything the AI app asked for; you can stop it at any time. The changes switch turns off with AI App Access.

See `docs/ideas/mcp-server.md` for the design.

## The Python sidecar

The optional Python sidecar used for implicit modelling and the geophysical inversions runs locally and binds to `127.0.0.1` only. It
is not reachable from other machines and does not make outbound connections. The same holds for the optional
predictive-modelling add-on once installed: it runs on your computer, listens only on `127.0.0.1`, and makes no
outbound connections.

## Word lists and sample data that ship with the application

Some reference data is bundled with the installer and read locally; nothing about it is sent anywhere. The lithology thesaurus that
proposes groups for rock codes has a second source of rock names and words taken from the dh2loop project's hierarchical lithology
thesaurus (https://github.com/Loop3D/dh2loop, MIT licence, Copyright (c) 2020 Mark Jessell; Joshi et al. 2021, Geoscientific Model
Development 14, 6711): data only, no code. Its licence is listed under Help, Third-party licences.

## Changes

Material changes to this policy will accompany a release and be noted in the release notes.

## Contact

Questions: <support@geostrix.com>, or open an issue at <https://github.com/Matt-Mendes-ai/geostrix/issues>.
