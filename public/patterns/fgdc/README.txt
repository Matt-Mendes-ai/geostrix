FGDC Digital Cartographic Standard for Geologic Map Symbolization (FGDC-STD-013-2006), lithology patterns (series 600 and 700),
as SVG tiles repackaged by Daven Quinn: https://github.com/davenquinn/geologic-patterns (master, downloaded 2026-11-07).
US federal government work, public domain; the repackaging is CC0-1.0 (LICENSE.txt).
GeoStrix ships the 29 patterns its lithology mapping uses (src/lib/lithoPatterns.js, TASKS.csv #1995), minified: the XML
declaration and whitespace removed, coordinates cut to 3 decimals; nothing else changed. 718 (Granite, 1st option) is missing
upstream, so granitoids use 719. Each file was checked to hold only shapes (no scripts, links or images).
