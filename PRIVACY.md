# Privacy policy

GeoStrix is a desktop application that runs on your own machine. It has no accounts, no sign-in, and
no analytics or telemetry of any kind.

This policy describes the application's behaviour as of version 0.1.54. It is published here so that
anyone can check what the application does with their data before installing it.

## What is collected

**Nothing.** GeoStrix does not collect, transmit or store any personal information, usage data, crash
reports or telemetry. There is no analytics SDK in the application, and no server operated by this
project that receives data from it.

**Problem reports.** *Help → Report a Problem* writes a zip file to your Downloads folder containing
what you typed, a picture of the GeoStrix window, system details (versions, operating system, memory,
graphics card), recent error messages and, unless you untick it, the Python engine's recent log. The
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
| You fetch terrain | `s3.amazonaws.com/elevation-tiles-prod` | Download public SRTM/Terrarium elevation tiles |
| You fetch imagery for a spectral index | `earth-search.aws.element84.com`, `sentinel-cogs.s3.us-west-2.amazonaws.com`, `planetarycomputer.microsoft.com`, `astersa.blob.core.windows.net` | Search the public Sentinel-2 / ASTER catalogues for your area (the area's bounding box is sent) and download that window of the image |
| On startup (can be turned off in the Help menu), and via *Help → Check for Updates* | `github.com` / `api.github.com` | Check whether a newer release exists, and download it if you choose to update |
| You click *Install* in the Predictive tab | `github.com` | Download the optional predictive-modelling add-on (its checksum is verified before it is installed) |
| You connect to a database | The host **you** enter | Query your own PostgreSQL database |
| You add a WMS / WMTS / WFS layer | The server **you** enter | Fetch the layer you requested |

These requests necessarily reveal your IP address to the operator of the service being contacted
(OpenStreetMap, Amazon S3, GitHub, or a server you chose), in the same way that visiting any website
does. Those third parties have their own privacy policies, which this project does not control. No
identifier for you or your project is attached to any of these requests.

If you never use basemaps, terrain, updates, the add-on download, databases or WMS layers, GeoStrix makes no network
connections at all.

## The Python sidecar

The optional Python sidecar used for implicit modelling runs locally and binds to `127.0.0.1` only. It
is not reachable from other machines and does not make outbound connections. The same holds for the optional
predictive-modelling add-on once installed: it runs on your computer, listens only on `127.0.0.1`, and makes no
outbound connections.

## Changes

Material changes to this policy will accompany a release and be noted in the release notes.

## Contact

Questions: <support@geostrix.com>, or open an issue at <https://github.com/Matt-Mendes-ai/geostrix/issues>.
