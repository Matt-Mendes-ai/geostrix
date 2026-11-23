// TASKS.csv #3887 (Text and Help batch, T5; plan_fable 4) — the First steps guide: the Basic path in six screens, each one diagram
// (src/help/diagrams), at most 40 words and one button that opens the real thing. Unlike the other Help pages it is translated: the
// screens are English here (the search reads them, as for every page) and FirstSteps.jsx shows each string through tr(), so every
// string below is a key in src/locales/*.json (test/firstSteps3887 holds that, the word limit and the buttons).
// `act` names what the button does (FirstSteps.jsx runs it): an app menu action (the same as the menu item), or "guided" for the
// StrixViewer Model button's first guided tool.
// Fireweed Metals Corp. lets GeoStrix bundle its Macpass drilling on condition that its credit shows with it: the screen that offers the
// sample shows sampleCredits.js's line, untranslated, as the sample card does.
export const FIRST_STEPS_ID = "first-steps";

export const FIRST_STEPS = [
  { title: "Six steps, in order", diagram: "workflow", alt: "The usual order of work: add data, check it, look in 3D, sections and logs, lay out a page, export.",
    text: "Add your data, check it, look at it in 3D, cut sections and logs, lay out a page, then export it. Each step is a tab or a button.",
    button: { label: "Start a project", act: "start" } },
  { title: "Your files", diagram: "filesWhere", alt: "Which file goes where: collars, survey and logs to the holes, assays to Geochem, densities to a density layer.",
    text: "Drop all your files on the 3D view at once. GeoStrix reads the columns: collars, surveys and logs go on the holes, assays to Geochem. No files yet? Try the Macpass example.",
    button: { label: "Try it with the example", act: "sample:yk_macpass" }, credit: "macpass" },
  { title: "Look and cut", diagram: "sectionFenceLog", alt: "In plan: a section is one line through the holes, a fence is several lines, a strip log is one hole.",
    text: "Drag to turn the view and use the wheel to zoom. A section cuts one line through the holes, a fence several lines; a strip log shows one hole from top to bottom.",
    button: { label: "Draw a section", act: "cross-section" } },
  { title: "Build a model", diagram: "buildModel", alt: "Your logs down the holes, one question, and the model built from them.",
    text: "The green Model button opens a guide: seven steps from your data to a checked model, one question at a time. A model is not a resource estimate.",
    button: { label: "Build a model", act: "guided" } },
  { title: "Green tabs and blue tabs", diagram: "basicAdvanced", alt: "The tabs in two groups: Basic holds StrixViewer, Maps and Layout; Advanced holds the specialist tools.",
    text: "The green tabs hold everyday work: StrixViewer, Maps and Layout. The blue tabs hold the specialist tools, such as geophysics and modelling. All tools shows them when you need them." },
  { title: "Make a sheet", diagram: "layoutSheet", alt: "A Layout page: a view, the legend, north arrow and scale bar beside it, the title block along the foot.",
    text: "Layout puts a view, its legend, a north arrow and a scale bar on a page with a title block. The Sheets group lays one out in a click; export it as a PDF.",
    button: { label: "Open Layout", act: "module-layout" } },
];
