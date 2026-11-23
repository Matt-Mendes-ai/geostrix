# Guided modelling: design (TASKS.csv #4015)

Design only, 2026-11-22. Nothing here is built. Request (Matt): "a guided modelling tool that will guide the user through all the steps from set up to choosing between implicit or explicit, then adding structures."

**In one paragraph.** The Model button's "Start here" card becomes a seven-step guide. Each step reads the project cheaply, says in one line what it found, asks at most one question with the answer already suggested from the data, and opens the existing tool filled in. The seven guided cards (`src/modules/viewer/guided/guidedTools.js`) stay as the "Build it for me" engines inside the steps. Whether a step is done is read from the project each time, never stored as a tick. Nothing runs or is added without a click; every addition is the tool's own Undo step.

Code this rests on (read 2026-11-22): the card is `guided/GuidedTool.jsx` (lazy, drawn only when `mode === "view"`); `guidedApi` in `ViewerModule.jsx` holds the run and prefill setters and `openPane`, which closes the card; `requestModuleAction("open-pane", { pane })` opens any of `MODELLING_PANES`; the stack is the project field `stratStack` (#4025).

## 1. The flow

Each step: **Reads** (pure, from the store) / **Asks** (suggestion and reason) / **Opens** / **Done when** / **If it fails**. Titles and lines are the proposed UI words.

### 1. Your data: "What you have, and what it can build."
- **Reads:** collars, holes with a trace, lithology rows, oriented structure picks, assays, map polygons (`mapLayers`), terrain, drawn section contacts (`sections[].contacts`), `explicitSurfaces`.
- **Asks:** nothing. One row per kind: a count and what it feeds ("66 holes logged: rock layers and bodies").
- **Opens:** Add data on a missing kind; Data QC (`DataQCModal`) from "Check the data". QC never runs by itself.
- **Done when:** one base exists: logged contacts in three or more holes, or map polygons, or assays.
- **If it fails:** the rows say what is missing and which steps wait for it. Assays only (Macpass): the guide goes to step 6. Map only (Mount Raymond): step 4 offers Model from map.

### 2. Area and detail: "Where to model, and how fine."
- **Reads:** `siteSpacing(collars)` (`lib/auto/autoCommon.js`), `holeClusters(collars)` (`lib/holeClusters.js`), the box's cells at `QUICK_RESOLUTION`. Collars only: no desurvey.
- **Asks:** "The whole property, or one group of holes?" Suggests one group when the holes fall in separate clusters or the cells would be coarser than the drilling ("3 groups of holes, 4 km apart: start with the largest, 41 holes").
- **Opens:** Model settings (`settings`) with `setModelArea("checked")`, the group's holes ticked and `setModelResolution(n)`. No terrain: one line and the existing terrain button, which asks before any download.
- **Done when:** cells are no coarser than 1.5 x half the hole spacing (autoSurface's test), or the user kept the default.
- **If it fails:** fewer than three holes, or no spacing: autoSurface's existing sentences; later steps grey out with that reason.

### 3. Rocks and order: "Which rocks, and which lies on which."
- **Reads:** `stackOrder`, `suggestCover`, `suggestBody` (`lib/auto/autoUnits.js`); `addAllCandidates` / `planAddAll` (`lib/stackAddAll.js`); `holesOrderPlan` (`lib/holesOrder.js`); `leftOutNames` (`lib/modellingCodes.js`); `GEMPY_MAX_SURFACES`.
- **Asks,** each a row with its reason and one button:
  - cover: "{code} starts 31 of 34 holes: the cover" -> role Overburden;
  - cutting rocks: "{code} lies inside another rock in 7 of 9 holes" -> role Intrusion;
  - thin codes: "{n} codes hold under 1 % of the logged metres" -> Leave out of the model (#4026);
  - order: "Add the {n} rocks in the holes' order" -> Add all (#3999).
- **Opens:** Modelling codes (`mcodes`), or Strat. stack (`stack`) with Add all open on the suggested choice; the user presses Add there.
- **Done when:** `stratStack.units` has two or more units and `holesOrderPlan` has no moves pending; or no steady order exists and step 4 builds bodies only.
- **If it fails:** over 16 units: the existing cut-down offer (`cutOrder`). Contradictions are listed, not forced ("A above B in 4 holes, below in 3"), with "Look on a section" (Correlation). No steady order: "These rocks do not stack: build them as bodies in step 4."

### 4. Compute or draw: the implicit / explicit choice
Two cards, both always available; one carries "Suggested from your data" and a one-line reason. New pure `suggestRoute(facts)`; its thresholds reuse autoSurface's (three holes minimum, under six "a broad guess") and `AGREE_MIN`:

| Route | Suggested when | Reason shown (example) |
|---|---|---|
| **Computed** (Implicit surface / Strat. stack, GemPy) | two or more layered units with contacts in six or more holes, or a body cut in six or more | "7 rocks with contacts in 40 holes, in a steady order: GeoStrix can compute the surfaces between the holes." |
| **Drawn** (Explicit surface, sections) | contacts in fewer than six holes; or most units fail the order test (they repeat or swap: folded or faulted ground); or contacts are already drawn | "Only 4 holes cut these contacts: between them a computed surface is a guess. Draw it the way you read it." |
| **From the map** (Model from map) | no logged contacts, map polygons present | "No logged holes; a map with 15 units: the model is built from the map." |

geoML is a small "another way" chip only when the add-on is already installed; the guide never proposes its download.

- **Opens, computed:** the existing cards in order: Cover and weathering (when step 3 found a cover), Rock layers (`runStackModel` on `stratStack.units`, quick model at 48, the run's time said first), Intrusions and bodies.
- **Opens, drawn:** Explicit surface (`explicit`) with a surface started for the first unit and its logged tops offered as picks (`seedPicksFromTops`, the panel's own seeding); "Draw a section" (`draw-section`).
- **Opens, map:** `mapmodel`; it already orders by the map's ages (#4001) and offers "Pick the 6 for me" (#3985).
- **Done when:** each unit of the stack has a surface (a `generatedSurfaces` record of `type: "stratigraphic_contact"`, or an explicit definition with a `surfaceId`).
- **If it fails:** the run's own message stays, and the guide adds one "Next" button chosen from the cause:

| The beginner sees | Next |
|---|---|
| "GemPy could not solve this model (singular matrix): {cause}" (#3986) | Leave out the unit the cause names; else Sort by the holes; else "Draw it instead" |
| "Nothing left to model", naming the unit and why (#4024) | Leave out that unit; Data QC when a column is invalid |
| "{code} starts {n} of the {h} holes at the collar" (#3997) | Cover and weathering on {code} |
| "The stack's order does not match the holes" (#3994) | Use the holes' order |
| an estimate over about 5 minutes | the quick first model |
| a low agreement with the logs | "Look on a section"; Change these |
| cancelled, or no engine | stay on the step; Drawn and sheeted planes need no engine |

### 5. Faults, veins, dykes: "Breaks and thin sheets that cut the rocks."
- **Reads:** `faultInventory` (`lib/faultInventory.js`: picks, logged fault intervals, outcrop, mapped, drawn, section strings); the Veins card's `veinChoices`.
- **Asks:** "Do faults cut this model?" Suggests yes with the count ("12 fault picks in 5 holes; 3 mapped fault lines"), or "No fault evidence in your data: skip", with "Draw one" (Interpretation lines).
- **Opens:** the Faults hub (`faults`, `FaultBuilder.jsx`: sheeted planes unless folded, #4013). Once a fault exists, "Make the rocks stop at it" opens Strat. stack at "Faults that offset the stack"; the re-run is the user's click. Veins and dykes: the Veins card (#4014).
- **Done when:** each suggested fault and vein is built or skipped.
- **If it fails:** the tools' verdicts ("Only 2 picks: a fault surface needs three", points on no sheet, a vein set to split); over six faults: "Pick the 6 for me".

### 6. Volumes and grade: "Solids from the surfaces; where the metal is."
- **Reads:** the last model (`ModelResultBlock.jsx`, #3988), alteration codes, assay elements, density rows.
- **Opens:** three optional rows: the Result block (Build the blocks, then Add); the Alteration halo card; the Grade model card ("Set a trend" first when none). Estimation and Variogram are "later, in All tools" links.
- **Done when:** optional; rows tick as their results exist.
- **If it fails:** the cards' verdicts ("No assays yet", "closed at the search radius", cells refitted to the block budget).

### 7. Check it: "Compare the model with the holes, then share it."
- **Reads:** what the project now holds (surfaces by `type`, faults, shells).
- **Opens:** Draw section; Add "modelled unit" layer to holes; Surface query; then Snapshot, Layout sheet, Export. Each built item lists with Zoom and "Change these".
- **Done when:** never forced; it is the last step.

## 2. Where it lives

**Extend, do not replace (recommended).** "Start here" becomes the step list: a seven-dot strip (number, two words, state: done / next / waiting / skipped) above the current step. The seven cards, the Model menu (`GUIDED_MENU`), the AI tools (`guidedRun.js`) and the Faults hub's "Guided fault" row work unchanged. No new StrixViewer button (ribbonTiers3903 stays at nine).

**A way back.** Any dot opens its step; going back deletes nothing. Today "Change these" closes the card and switches tab. In the guide the card shrinks to one bar ("Guide: step 3 of 7, Rocks and order. Back to the guide"), drawn in StrixViewer and 3D Modelling. A press on the 3D view shrinks the guide to that bar instead of closing it (single cards keep #3969's closing), so the user can turn the model and return in one click.

**Memory: one small saved project field (recommended).** `modelGuide = { route, skipped: [ids], at }`, track `"view"` in `projectFields.js`: saved, per tab, autosaved; changing it is not an edit (no unsaved prompt, no Undo step). Why a field: the route chosen and the steps skipped cannot be read back from the data, and they must follow the project to another computer and stay apart per tab (#4025's reasoning). `viewerUiState` would put the hydration in capped, race-prone ViewerModule; localStorage is per computer. Why so little: done states are derived, so they cannot go stale after an Undo, a delete or a colleague's edit. Cost: PROJECT_VERSION 32 -> 33 (#4030 took 32); an older file opens with an empty guide.

**Leaving and coming back.** Close, Escape, another tab, quitting: nothing is lost. Model > Start here reopens on the first step neither done nor skipped.

**The old synthetic sample** (OR-26 ids) needs no rename: the guide reads roles and order from the data, not from names.

## 3. Budgets

**Words** (all through `tr()`, five languages; guided files count in "Basic path"):
- per step: title up to 3 words, line up to 10, question up to 8, a reason up to 20 with its numbers; one icon;
- the guide's own interface words: 330 or fewer; new notices: 80 or fewer (failures reuse the tools' messages; a "Next" label is an existing button label wherever one exists);
- Help: one card page `guided-model`, 70 seen-first words or fewer;
- offset: the Start here intro line goes. Sides report the moves; Main alone updates the baseline.

**Performance:**
- nothing in the startup chunk; 25 KB or less (minified) added to the lazy guided chunk; ViewerModule.jsx +800 bytes or less (it is at 702 KB of 775 KB);
- `guideFacts(store)`: one pass over each table it reads, memoized on the store's references, computed only while the card is open (never while it is a bar). No desurvey, three.js, sidecar start, add-on query, Data QC or network. Desurveyed contacts (`api.computeIntercepts`) are read only when a build card opens, as today;
- a test counts row reads on a 200,000-row synthetic log (one pass), not milliseconds, so it holds on CI;
- runs: only on a click, one at a time (`api.busy`), quick model first, the time said before any run over about two minutes, Cancel in the status bar.

## 4. Build plan

Rows 1 to 4 run at once (four sessions, no shared source file); row 5 joins them; row 6 closes. Shared by nature: `src/locales/*.json` (row 1 carries all step text, the others a few keys each, merged with `scripts/i18n-merge.mjs`) and the word-count baseline (Main's). The names below are the contracts.

| Row | Owns | Delivers | Tests | Live check |
|---|---|---|---|---|
| **1. Facts, steps, route** (Opus: the judgment is here) | new `src/lib/guide/guideFacts.js`, `guideSteps.js`, `suggestRoute.js`; the step words and locale keys | `guideFacts(store)`; `GUIDE_STEPS` (`id, title, line, status(facts, guide) -> { state, reason, asks }`); `suggestRoute(facts)`. Confirms the surface-record fields for veins and explicit surfaces; measures the route thresholds | synthetic logs: a layered pile, four holes only, a repeated (folded) order, map only, assays only, a cover; the one-pass count; no import of three or `modellingRuns` | a Node script over the bundled CSVs prints each sample's facts and route; row 6's reviewer verifies the counts |
| **2. Saved place** (Sonnet) | new `src/lib/modelGuide.js`; `src/lib/projectFields.js`; `src/lib/store.jsx`; `test/projectFields.test.mjs` | the `modelGuide` field (track "view", v33: #4030 took v32), `guideFromFile`, setters | fingerprint and golden pins; a v31 file and a damaged value load empty | WA lode gold: choose a route, skip a step, save, reopen, second tab, crash recovery |
| **3. Doors in the panes** (Sonnet) | new `src/lib/guide/paneIntent.js` (one slot: `setPaneIntent`, `takePaneIntent(pane)`); `src/modules/viewer/ModellingPanes.jsx`; `src/components/ExplicitSurfacePanel.jsx`; `src/modules/viewer/AddAllUnits.jsx` | each pane reads its intent on opening: Model settings (area, holes, resolution), Strat. stack (Add all open on a choice; the faults block), Explicit surface (a surface started for a unit, tops offered) | an intent is taken once and ignored by another pane; source pins on each read | WA bedded iron: an intent opens Strat. stack with Add all on "at least 1 %" |
| **4. Failure causes** (Sonnet) | `src/modules/viewer/modellingRuns.js`; `src/lib/notices.js`; new `src/lib/guide/guideFailures.js` | a `code` on the existing notices (singular, nothing left, order, limit, too few contacts, cover); `nextFor(code, detail) -> [{ label, act }]`. No message text changes | each code maps to its Next; notices unchanged word for word | Mount Raymond (Erosional, the known singular case); WA bedded iron (a one-interval code) |
| **5. The guide card** (Opus; after 1 to 4) | `guided/GuidedTool.jsx`; new `guided/GuideSteps.jsx`, `guided/GuideBar.jsx`; `src/modules/ViewerModule.jsx` (drawn in 3D Modelling too; `notices` and the area setters on `guidedApi`); the `test/guidedTools3908.test.mjs` pins | the strip, the step views, the two route cards, the bar, Next after a failure, skip | card logic on a fake store; the ViewerModule size cap; i18n786; the Model menu unchanged; single cards still close on an outside press | WA lode gold end to end (real GemPy at 48); Macpass (straight to grade) |
| **6. Help and review** (Sonnet; last) | `src/help/pages/modelling.js`; `src/help/guide.js` | the `guided-model` card page; First steps lands on the guide; a written walk-through of the samples with every wording problem or dead end found | firstSteps3887; the Help word count | WA bedded iron, WA lode gold, Mount Raymond, Macpass; Silvertip (downloaded) for faults |

## 5. Open questions for Matt

1. **Extend "Start here" or add a separate guide?** Recommended: extend. One door (Model), one set of words; the cards stay as the steps' engines.
2. **Save the guide's place in the project file** (v33, a "view" field; #4030 took v32)? Recommended: yes; only the route and the skipped steps, never the ticks.
3. **A "Guide" button on the 3D Modelling ribbon too** (first in Setup, same card)? Recommended: yes, one button; a user who starts on that tab otherwise never meets the guide.
4. **A "build the whole model for me" chain?** Recommended: not in this version. One click per build keeps every run cancellable and every failure tied to one step.
5. **A press on the 3D view shrinks the guide to its bar instead of closing it?** Recommended: yes, for the guide only; the single cards keep closing as #3969 set.
