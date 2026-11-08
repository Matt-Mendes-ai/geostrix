# Release smoke test: v0.1.102 to the next release

Matt asked for this on 2026-11-07, before publishing.

There are 142 commits since v0.1.102. The new code includes:
- Python engine: Harmonica, Verde, Boule and empymod.
- Front end: laz-perf for point clouds.
- A new network host: Macrostrat.
- New readers: EDI, LAS/LAZ/COPC, big GeoTIFFs read in byte ranges, and comma-separated Geosoft XYZ.
- Many import and Layout changes.

Both v0.1.99 regressions (#1980, #1981) came from small "speed-up" changes that only showed on real
projects. This test exists to catch the next one before a user does.

**The goal:** a written pass or fail for each item below, against the packaged build. Do not publish.
When it passes, report to Matt and wait. Matt decides when to publish. Signing stays with Matt
(scripts/sign-release.ps1, SimplySign).

## Rules
- Test Electron only:
  - Use an isolated `--user-data-dir`.
  - Use the anti-backgrounding flags from the memory note on test Electron flags.
  - Stop it only through the PowerShell tool, with a narrow profile filter.
  - Never touch the installed GeoStrix. Never run the installer.
- Use only the sample data under `3D Modelling\Sample Data` and `sample_data/`.
  - Never open Matt's own projects.
  - Do not use Andrew's crash-report project until he says it may be kept as a test case.
- Every failure becomes a TASKS row: High if it crashes or loses data, Medium otherwise. Fix the
  High rows before the release goes out, and run their checks again.

## 1. Build gates (all must pass)
1. `npm run lint` and `npm test`.
2. A **fresh frozen sidecar** (`npm run build:sidecar`). Its requirements gained Harmonica, Verde,
   Boule and empymod. In the frozen build (not the dev venv), call one endpoint from each:
   - Euler deconvolution
   - equivalent-source gridding
   - a gravity reduction
   - an FDEM 1D inversion

   Report how much bigger the sidecar folder got compared with 0.1.102.
3. `npm run build:dir` (with `-c.directories.output=` set to a folder outside OneDrive; see
   CLAUDE.md), then `node scripts/smoke-electron.mjs <exe>`.
4. These scripts:
   - `scripts/check-bundle-size.mjs`
   - `scripts/audit-shipped.mjs`
   - `scripts/check-version.mjs`
   - `scripts/third-party-licenses.mjs`

   The licence page must now list laz-perf, copc.js (if bundled), Harmonica, Verde, Boule,
   empymod and the FGDC patterns (CC0).
5. `scripts/i18n-leftovers.mjs`: no untranslated strings in the new UI.
6. Privacy: Macrostrat appears in PRIVACY.md and the five website privacy pages (already checked:
   it does). Also check:
   - No other host is reached that isn't listed. Watch the network log during section 3.
   - Turning the Macrostrat layer off means no request is made.

## 2. Odd projects (the regressions hide here)
Open each one, look at it in the 3D View and every module, then save, close and reopen. Confirm the
counts match after the reopen.
- Holes with no length and no surveys, and a collar at z = 0. Build a small synthetic copy of
  Andrew's case; don't use his file.
- One hole only, and an empty project.
- A block model alone, with no drillholes (the #1980 path).
- Lawyers: time the open with `scripts/measure-startup.mjs` and compare it with #1500's 24.8 s.
  No new freeze is allowed.
- A project saved by 0.1.102 and opened in the new build. It must open with no warning and no
  data lost.

## 3. New features, once each on real data

| Feature | Data | Pass when |
|---|---|---|
| Euler deconvolution, equivalent-source levelling, low-latitude RTP, worms | Lawyers mag, Poplar XYZ | runs, sensible result, no hang |
| EDI reader (MT/AMT) | any .edi in Sample Data | curves, pseudosection, depths in 3D |
| FDEM 1D inversion | Sample Data\FDEM (DUALEM, GEM-2) | conductivity-depth result |
| LAS/LAZ/COPC point clouds | Woodjam 2024 lidar | terrain from ground points, thinned cloud, memory reasonable |
| Big GeoTIFF read in byte ranges | the 249 MB drone DTM | imports without a memory spike |
| Comma-separated Geosoft XYZ | Poplar | the IGRF column is never picked as the value |
| FGDC lithology patterns | any logged project | strip log, section, fence, Layout legend, Atlas |
| Macrostrat layer | any BC project | layer, colour lookups, attribution shown, works offline without errors |
| Point-survey import | Kodiak | wizard round trip |
| Strip log at exact scale, assay tracks in Atlas | any project with assays | export to Layout and PDF |
| Grade-tonnage, estimation dialog, undrilled zones | Treaty Creek or Lawyers | no freeze on open; numbers as before |

## 4. Update path
On a test profile, in a **packaged** build, show that 0.1.102 offers the new version. Only if a local
feed or the CI artefact makes that possible without publishing; if not, say it was skipped.
Never publish just to test this.

## 5. Report
- A pass/fail table, with timings: Lawyers open time, sidecar size, installer size.
- Any new TASKS rows.
- Anything not tested, and why.
