// TASKS.csv #1966 — the Getting started page of the offline help (see src/help/content.js for the page format)
// TASKS.csv #3899 (T4) — rewritten to the rule of plan_fable 3.2: a short summary, the Basic / Advanced diagram, detail behind "More".
export default [
  { // TASKS.csv #3887 — the First steps guide: its screens are src/help/guide.js, shown (translated) by src/help/FirstSteps.jsx
    id: "first-steps",
    area: "Getting started",
    title: "First steps",
    summary: "The everyday path in six screens: your files, the 3D view, sections, a model and a printed sheet.",
    guide: true,
    notFor: [], fields: [], warnings: [],
    related: ["first-project", "help-start"],
  },
  {
    id: "help-start",
    area: "Getting started",
    title: "Using GeoStrix Help",
    // TASKS.csv #3979 — the card (#3967's plan, section 8); the summary and the rest are in its folds
    line: "One page per tool: what it does, its settings and its messages.",
    picture: { diagram: "basicAdvanced", alt: "The tabs in two groups: Basic holds StrixViewer, Maps and Layout; Advanced holds the specialist tabs." },
    cautions: ["Help never picks numbers for you: each page says how to choose."],
    keys: ["? in a tool's header", "Help > GeoStrix Help (F1)", "Search"],
    summary: "One page per tool: what it does, each field and how to choose a value, the messages it shows, and a short walk-through.",
    more: "Help never chooses numbers for you: where a page talks about a value, it says how to pick one from your data (hole spacing, block size, line spacing). The pages are in English for now; tool names and button labels follow the interface's language.",
    notFor: [
      "A choice of numbers for your project: each page says how to pick one, not which one.",
    ],
    fields: [
      { name: "? in a tool's header", gist: "opens that tool's page", what: "Opens that tool's page beside it." },
      { name: "Help > GeoStrix Help (F1)", gist: "the list of every page", what: "Opens the list of pages, grouped by tab." },
      { name: "Search", gist: "finds any word you type", what: "Finds the pages that hold every word you type, best first.", more: "How to choose: Type the word as it reads on screen." },
      { name: "Basic tools / All tools (top right of the ribbon)", what: "Basic tools shows the everyday tools; All tools shows every one.", more: "How to choose: If a page names a tool you cannot see, switch to All tools." },
    ],
    warnings: [],
    howto: {
      sample: "any",
      steps: [
        "Open a sample: File > Open Sample Project, then any of them (Macpass, WA palaeochannel uranium, Mount Raymond, Rouyn-Noranda).",
        "Open a tool from the ribbon, for example Geophysics > Block models.",
        "Click the ? in the tool's header to read its page beside it.",
        "Press F1 for the list of pages and the search box.",
      ],
    },
    related: ["first-project", "block-models"],
  },
];
