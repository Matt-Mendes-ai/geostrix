# Privacy policy

GeoStrix is a desktop application that runs on your own machine. It has no accounts, no sign-in, and
no analytics or telemetry of any kind.

This policy describes the application's behaviour as of version 0.1.9. It is published here because
SignPath Foundation requires participating projects to have a privacy policy.

## What is collected

**Nothing.** GeoStrix does not collect, transmit or store any personal information, usage data, crash
reports or telemetry. There is no analytics SDK in the application, and no server operated by this
project that receives data from it.

## Where your data lives

Your project data — drillhole collars, surveys, interval layers, assays, rasters, and everything else
you import — stays on your own computer, in the `.geostrix.json` project file you choose to save, plus
an autosave file in the application's own user-data directory. It is never uploaded anywhere.

Database passwords entered in the *Connect database* dialog are held in memory for the duration of the
application session only. They are not written to the project file, to the autosave file, or anywhere
else on disk.

## Network connections the application makes

GeoStrix only makes network requests as a direct result of features you use:

| When | Where | Why |
| --- | --- | --- |
| You add a basemap | `tile.openstreetmap.org`, `tile.tracestrack.com`, `tiles.maps.eox.at` | Fetch map tiles for display |
| You fetch terrain | `s3.amazonaws.com/elevation-tiles-prod` | Download public SRTM/Terrarium elevation tiles |
| On startup, and via *Help → Check for Updates* | `github.com` / `api.github.com` | Check whether a newer release exists, and download it if you choose to update |
| You connect to a database | The host **you** enter | Query your own PostgreSQL database |
| You add a WMS/WMTS layer | The server **you** enter | Fetch the layer you requested |

These requests necessarily reveal your IP address to the operator of the service being contacted
(OpenStreetMap, Amazon S3, GitHub, or a server you chose), in the same way that visiting any website
does. Those third parties have their own privacy policies, which this project does not control. No
identifier for you or your project is attached to any of these requests.

If you never use basemaps, terrain, updates, databases or WMS layers, GeoStrix makes no network
connections at all.

## The Python sidecar

The optional Python sidecar used for implicit modelling runs locally and binds to `127.0.0.1` only. It
is not reachable from other machines and does not make outbound connections.

## Changes

Material changes to this policy will accompany a release and be noted in the release notes.

## Contact

Questions: open an issue at <https://github.com/Matt-Mendes-ai/geostrix/issues>.
