# Release smoke test: v0.1.104 to the next release

Matt asked for this on 2026-11-07 (from v0.1.102) and again on 2026-11-08 (from v0.1.104), before publishing.

There are 56 commits since v0.1.104, almost all fixes from the #2013 Complete GeoStrix review on Woodjam 2024.
The new code includes:
- No change to the Python engine, `electron/` or the dependencies (package.json / package-lock.json): the frozen
  sidecar and the network hosts are the same as in v0.1.104.
- Import: `<el>_flag` columns as qualifiers, space-aligned tables, point shapefiles to Geochem, shapefiles dropped
  on the Maps tab, a survey sheet's corrected azimuth columns, 8-bit pictures in Spectral index, assumed-vertical
  collars, `.prj` read with a loose `.shp`.
- Modelling: the vein-set gates (Veins / dykes, Structures), litho-group roles from their codes, the fitted AI / CCPI
  box, grade-shell areas and failure messages, retallied kept cells, the Vein log as a halo source.
- Layout and maps: legend frame filtering and sheet fit, insert placement, scale presets, the compass rose from
  below, terrain-derivative colour stretch, the Macrostrat geology layer and legend (#2011 / #2012).

Both v0.1.99 regressions (#1980, #1981) came from small "speed-up" changes that only showed on real
projects. This test exists to catch the next one before a user does.

**The goal:** a written pass or fail for each item below, against the packaged build. Fix anything High
before the release; Matt decides when to publish. Signing stays with Matt (scripts/sign-release.ps1, SimplySign).

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
1. `npm run lint` and `npm test`, and `npm test` again on a **CRLF checkout** outside OneDrive
   (`git worktree`, `core.autocrlf=true`): the CI runner checks out with CRLF, and v0.1.103's build failed on
   eight source-text pins that only passed with LF (#2009).
2. The sidecar: no change since v0.1.104 (`git diff v0.1.104 -- python-sidecar` is empty), so it is not rebuilt.
   Run the frozen engine's own smoke (`tests/smoke_jobs.py`) once to confirm it still starts and answers.
3. `npm run build:dir` (with `-c.directories.output=` set to a folder outside OneDrive; see
   CLAUDE.md), then `node scripts/smoke-electron.mjs <exe>`.
4. These scripts:
   - `scripts/check-bundle-size.mjs`
   - `scripts/audit-shipped.mjs`
   - `scripts/check-version.mjs`
   - `scripts/third-party-licenses.mjs`
5. `scripts/i18n-leftovers.mjs`: no untranslated strings in the new UI.
6. Privacy: no new network host since v0.1.104 (compare the host literals in `electron/` and `src/` with
   PRIVACY.md). Watch the renderer's network log during section 3.

## 2. Odd projects (the regressions hide here)
Open each one, look at it in the 3D View and every module, then save, close and reopen. Confirm the
counts match after the reopen.
- Holes with no length and no surveys, and a collar at z = 0. Build a small synthetic copy of
  Andrew's case; don't use his file. (#2014 now draws collars with no attitude as assumed vertical holes.)
- One hole only, and an empty project.
- A block model alone, with no drillholes (the #1980 path).
- Lawyers: time the open with `scripts/measure-startup.mjs` and compare it with #1500's 24.8 s and #2007's run.
  No new freeze is allowed.
- A project saved by 0.1.104 and opened in the new build. It must open with no warning and no
  data lost.

## 3. New since v0.1.104, once each on real data

| Feature | Data | Pass when |
|---|---|---|
| Wide assay / soil import with `<el>_flag` columns (#2018) | Woodjam 2024 Assay Samples.xlsx, 2024 Soil Samples.csv | 1,268 LDL + 2 UDL qualifiers; 231 soil LDL |
| Workbook drop with corrected azimuths (#2015), assumed-vertical collars (#2014) | Woodjam 2024 Drilling_Woodjam_20241115.xlsx on an empty project | true north converted, the column named; district collars drawn dashed |
| Space-aligned n = 1 IP table (#2017) and gridding (#2075) | Woodjam 2024 n1_GreatPlains_UTM.dat | 164 points; the grid notice says where it is drawn |
| Point shapefile of samples to Geochem (#2016); shapefile dropped on Maps (#2019) | Woodjam 2024 soil and IP-line shapefiles | surface import with the .prj CRS; lines to Map layers, a repeat refused |
| Spectral index on an 8-bit picture (#2124) | review deerhorn_rgb.tif (synthetic) | read as 8-bit values, no 70 % blanking |
| Grade shell, unit body, estimation, fence, grade-tonnage (#2047, #2059-#2064, #2106) | Woodjam 2024 | runs, honest notices, no freeze |
| Veins / dykes and Structures on a vein set (#2048, #2050); the Vein log as a halo (#2050) | Woodjam 2024 qtz / VEIN_Uniq | no surfaces for a set; the question before the solve; the envelope builds |
| AI / CCPI with a fitted box (#2028), Grade stats by hole (#2029) | Woodjam 2024 | the box from Unalt + Propy; DH24-119 mean 1,244.6 ppm unweighted |
| Layout: legend Load from view, inserts, scale presets, fit (#2132-#2135) | Woodjam 2024 | legend inside the frame and the sheet; inserts in free space |
| Macrostrat geology layer and legend (#2011, #2012) | any BC project | layer, legend, attribution; no error offline |
| Terrain derivatives (#2123), compass rose (#2038), outcrop codes (#2082) | Woodjam 2024 / synthetic DEM | stretch from the ground; codes classed |

## 4. Update path
On a test profile, in a **packaged** build, show that 0.1.104 offers the new version. Only if a local
feed or the CI artefact makes that possible without publishing; if not, say it was skipped.
Never publish just to test this.

## 5. Report
- A pass/fail table, with timings: Lawyers open time, sidecar size, installer size.
- Any new TASKS rows.
- Anything not tested, and why.
