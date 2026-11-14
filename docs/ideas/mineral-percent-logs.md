# Mineralization logged as per cent per mineral (TASKS.csv #3205) — design note

Written 2026-11-13. Built 2026-11-13 after Matt's decision (one layer per mineral; an opt-in total of the columns the user ticks as sulphides).

## What is missing

A porphyry log often records sulphides as a visual per cent per mineral, with no code column. The Galore Creek review (#3195) dropped such a
file: one row per interval, then `MN_CPY_pct`, `MN_BN_pct`, `MN_PY_pct`, `MN_MAG_pct` …, and a few `*_style` text columns.

- **The Mineralization layer demands a code.** Its Value field found nothing, and Import stayed disabled.
- **The only way in is one custom-layer import per mineral.** The review imported the file three times, once each for Cpy, Bn and Py.
  Each import said "N blank code" for rows that simply had no value of that mineral.
- **An all-blank column (`MN_MAG_pct`) was not offered, and nothing said so.**

## What already exists

- **Custom layer (#1654):** one value column per import, numeric or a code.
- **Downhole log channels (#2160, `LogChannelsBox`):** one numeric layer per ticked column, in one import. Readings are placed at points,
  and a From / To log is read at the middle of each interval. That suits a log of readings, not a log of intervals.
- **A composition layer (#3052, planned):** N percentage columns that sum to 100, in one layer, with a derived "dominant component". Visual
  sulphide percentages do not sum to 100 (a few per cent of an interval), so they are not a composition.

## Proposal: one numeric interval layer per mineral, from one import

1. **When it is offered.** The table has an interval shape (hole, From, To), no code column is found, and at least two number columns are
   named like a per cent (`*_pct`, `*_PCT`, `*%`, `pct_*`). The file is guessed as Mineralization or Custom.
2. **The dialog.** A "Per-mineral layers" box, built like the log channels box:
   - one tick per per-cent column, pre-ticked when the column has values, with its value count and maximum;
   - all-blank columns listed as left out ("MN_MAG_pct: no value in any row").
   - Import is enabled once one column is ticked. The Value field is not needed.
3. **What the import makes.**
   - Each ticked column becomes a numeric interval custom layer, named `<file>: <column>`, with unit "% visual" (the legend adds the unit,
     so it is not in the name too). "Visual" is the logger's word. Assays are the measured grade; this is an estimate by eye.
   - A row with no value of that mineral is not a "blank code". It is simply not an interval of that layer, and is counted once in the
     notice.
   - Each `*_style` column next to a mineral (`MN_CPY_style` beside `MN_CPY_pct`) rides on that mineral's rows as a text field, so Identify
     shows it.
4. **What it reuses.**
   - The custom numeric layer path: colour ramp, Downhole logs, Estimation's numeric sources (#1741), and Grade-tonnage's sources.
   - No new layer kind, and nothing in `store.jsx` beyond what a custom layer already stores.
5. **Names.** The column is the name. No abbreviation table (CPY = chalcopyrite …) is assumed: projects differ, and the code dictionary
   (#2163) is the place for a meaning.

## Why not one layer with a field per mineral

The 3D View colours an interval layer by one value. A layer per mineral can be shown, filtered, estimated and compared at once, as the
review's three manual imports were. A "Mineralization (per mineral)" layer with N fields would need a field picker everywhere a layer is
read. That is #3052's design work, not needed for this.

## Size

One session:

- the box and its detection, in a new `lib/perMineralColumns.js` (pure) and a component beside `LogChannelsBox`;
- the commit branch in `useImportPipeline.js`: N custom layers from one table;
- locales, tests on a synthetic table, and a live check.

## Open questions for Matt

- One layer per mineral, as proposed, or one Mineralization layer with a field per mineral (closer to #3052, more work)?
- Should a "total sulphide % (visual)" layer be derived from the sulphide columns? It would need to know which columns are sulphides,
  which is a project choice.
