# Logs of components that sum to 100 (TASKS.csv #3052) — design note

Written 2026-11-14, side session 3. Nothing built yet: this is for a decision.

## What is missing

The WA iron review (#2876, #2889) had a material-type log of 150,456 intervals with 43 columns `Met_<component>_pct` and no rock-code column.
Each row's percentages sum to 100: hematite, goethite, shale, chert and so on, by share of the interval.

- **Today (#2889):** the import pre-sets Value to the file's one text column (`Logged_Strand`) and adds all 43 numbers as fields with one
  click. The layer is coloured by the strand code, and the composition is only readable in Identify.
- **What a geologist wants from such a log:** the dominant material per interval as a map and section colour; each component as a number
  to colour by, plot down the hole and model (a hematite-share block model); and the whole row in Identify.

## What already exists

- **#3307 (one Mineralization layer from per-mineral columns):** the code is the dominant mineral (or a chosen one), the value is the total,
  and each mineral and its text companions are fields. `perMineralColumns.js` `singleMineralRows` does exactly that rewrite before the
  ordinary commit.
- **#3205 (one numeric layer per mineral):** each ticked column becomes a numeric interval custom layer. It gets a colour ramp, a Downhole
  logs track, and is offered to Estimation and Grade-tonnage as a numeric source.
- **The difference:** visual sulphides do not sum to 100, so #3307's "Total min" is meaningful. In a composition the total is 100 by
  construction, and the useful value is the **dominant share**: how pure the interval is.

## Proposal: a composition is recognized, and the same box offers both shapes

No new layer kind and nothing new in `store.jsx`: a composition is a code layer with number fields, and / or numeric layers. Both already exist.

1. **Recognized at import.** Three or more number columns with a shared affix (`Met_*_pct`, `*_pct`, `pct_*`, `*%`), whose row sums have
   a median of 98-102 (rows with all components blank are left out of that test), on an interval table. The dialog says
   "A composition of N components: each row's shares sum to 100 (median 100.0)".
2. **The box (MineralPercentBox, renamed for both uses):**
   - **One layer (default):** the layer the file was guessed as (Lithology if it has no other code column, else Custom).
     - code = the dominant component, named by its column with the shared affix removed (`Met_HEM_pct` → HEM);
     - value = the dominant share (%) (#3307 puts the total there);
     - every component % kept as a field, with the shared text companions as #3307 keeps them.
     - Ties go to the column order. A row whose largest share is under a threshold (default 50 %, editable) can be coded `MIXED`
       instead, so a map does not overstate purity.
   - **One layer per component (opt-in):** #3205's numeric layers for the ticked components (all components ticked would be 43 layers, so
     none are pre-ticked here).
3. **Colouring, plotting and modelling each component.**
   - From the one-layer import: Identify shows every share, and 'Colour by' on the layer can take any component field. That needs a
     categorical layer to accept a numeric field ramp; today custom layers can (#2373) and the built-in code layers cannot. This is the
     one new piece of UI.
   - For Downhole logs and Estimation, the per-component numeric layers are the route: they already work.
4. **Checks said at import.** Rows whose sum is off by more than 5 (data errors), counted and listed by hole; components that are all blank
   (left out, named); a sum far from 100 everywhere (then it is not a composition, and the #3307 / #3205 paths stay as they are).

## Questions for Matt

1. Is the **dominant share** the right value for the one-layer import, or should the value be one chosen component's share (say hematite
   %, for an iron project)?
2. A **MIXED** code below a purity threshold: wanted, and is 50 % the right default?
3. Should 'Colour by a component field' on a **built-in** code layer (Lithology / Alteration) be built, or is a Custom layer import (which
   already colours by a numeric field) enough for compositions?

## Effort

- **Recognition, the one-layer rewrite, the notices:** about #3307's size. It generalizes `singleMineralRows` with a dominant-share value,
  the affix stripping and the MIXED rule.
- **Per-component layers:** none; #3205's path is reused.
- **Colour by a component on a built-in code layer:** larger, and in the 3D View (ViewerModule / drillholeScene), so it would go with side 6.
