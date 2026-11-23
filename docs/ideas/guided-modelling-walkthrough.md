# Guided modelling: the walk-through of the samples (TASKS.csv #4036, row 6)

2026-11-22. The guide (rows 1-5 of #4015) walked in the real app (Electron, a scratch profile, the installed GemPy engine) on WA lode gold, WA bedded iron, Macpass, Mount Raymond
and Silvertip (downloaded; counts only here, no hole ids or values). Each step was opened from the strip and its doors pressed. Found and fixed in the same commit are marked **fixed**;
the rest are for the next pass.

## What worked

- **Model > Start here** opens the guide on the first step neither done nor skipped (WA lode gold: step 3; Macpass: step 6); the **Guide** button in the 3D Modelling ribbon opens the
  same card (Mount Raymond has no Model button on its tab).
- The doors open their pane filled in and shrink the guide to its bar ("Guide: step 3 of 7, Rocks and order. Back to the guide"): Add all units opened Strat. stack with Add all open on
  "at least 1 %" and the button "Add 10 units"; Rock layers opened the card with the stack's 10 units ticked; Model from map opened with the map, unit field and order filled; the Faults
  hub opened with "Build from all the evidence" filled; the Grade model card suggested Zn on Macpass. A dot turns to a check mark as the project gets what the step makes (step 4 after the stack was built).
- A real run: WA lode gold's stack (10 tops, a layer-cake after two confirms) and Mount Raymond's map model (14 surfaces, about 50 s with GemPy).

## Row 1's counts, by hand

Worked out from the samples' own CSVs with none of the guide's code (a rank of the rocks by who lies above whom, the 80 % order test, runs top down):

| Sample | holes logged | rocks in 3+ holes | steady, CSV alone | the app's roles (logged notes, names) | route |
|---|---|---|---|---|---|
| WA lode gold | 66 | 24 | 17 (same 17 names as the guide) | cl is no recovery, FFF a fault: **15 steady of 22 eligible** | computed |
| WA bedded iron | 141 | 14 | 12 of 13 with ALU the cover (same 12 names) | ALU is overburden by its name: **11 steady of 12** | computed |

So the guide's code and the hand count agree exactly on the CSV alone; what moves the numbers in the app is the roles it reads from the notes and the names. The row's note ("17 of 22") mixed the
CSV-only 17 with the app's 22. `scripts/guide-samples.mjs` now reads the notes as the app does (**fixed**) and prints 15 of 22 and 11 of 12, the numbers on the card. Holes with contacts and the holes where a
steady rock's top is a contact are 66 and 141 both ways.

## Found and fixed (in this commit)

1. **A wrong suggestion.** Step 3 offered "cl lies inside another rock in 17 of 21 holes" with a door to make it an intrusion; cl is core loss. A code the stack leaves out by its role is no longer the "rock that cuts the others" (guideFacts).
2. **Veins door.** The row for PO opened the card on AU: a row's door ignored its vein. The card now starts on the row's vein.
3. **The strip's dots** had the step's name only as a tooltip; the state (Done, Next, Waiting, Skipped) is in it now.
4. **A leak between projects (found by accident).** The 3D Modelling Result block of #3988 kept the last model of ANOTHER project: after WA lode gold's stack was built, the Mount Raymond tab offered "Add unit volumes / Add as block model / Add modelled unit layer" for it.
   It is dropped when the project changes now (the geoML Result of #4028 already was).
5. The samples script's roles (above).

## For the next pass (not changed here)

- **Three numbers for one set of rocks.** WA lode gold: step 4 says "15 rocks in a steady order", step 3's Add all adds 10 (rocks under 1 % of the metres are left out), and the Rock layers card says "These 7 rocks lie in the same order" while 10 are ticked and three of its 7 are not among them.
  The route counts steady rocks whatever their thickness; the card counts the stricter layered ones. One count, the rocks the stack will take, would read better.
- **The order test does not see a rock that returns.** In WA lode gold 4 of the 10 stacked units alternate (a unit returns after another in 62 of 66 holes, up to 20 times in one). The guide says "compute"; Build it for me then meets
  "Surfaces will cut through alternating units ... Run the stack anyway?" and, after OK, "The tops are near-flat ... Run the stack as a layer-cake? (Cancel runs GemPy.)": two technical confirms from one click.
- **Step 5 says Done when there is no evidence** (Macpass, WA bedded iron): a check mark for nothing. "Skipped: not needed for this data" is what steps 2 and 3 say.
- **Assays-only data (Macpass).** Steps 3 and 4 say "Needs contacts in three logged holes" / "No contacts between logged rocks yet" with no door and no hint that step 6 works without logs.
- **Step 1** lists counts only ("Logged holes: 66"), not what each feeds (the design's "rock layers and bodies").
- **Step 4 on a map** asks "Compute or draw?" with a single card.
- **Step 5 rows** read "AU: in 8 holes." four times with four buttons all named "Veins and dykes"; "Faults in this model?" shows its evidence ("Fault picks: 621; Logged fault zones: 252") but not its suggested answer.
- **Step 2 counts** differ from the pane's: "4 groups of holes, 140 m apart: start with 46 holes" against the Strat. stack's "11 clusters" (it counts 2-hole groups).
- **Silvertip step 2**: "Cells of 19 m for holes 3 m apart: model less area." The collars fan from pads, so the spacing reads small and the advice does not fit (known: autoSurface's blind spot).
- **A low match is not shown in the guide.** The Mount Raymond map model matched 41 % of the mapped ground (in the pane); the guide says nothing about it.
- The dots' colours have no legend (done is a check, next and current are filled; waiting is empty).
