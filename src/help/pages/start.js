// TASKS.csv #1966 — the Getting started page of the offline help (see src/help/content.js for the page format)
export default [
  {
    id: "help-start",
    area: "Getting started",
    title: "Using GeoStrix Help",
    summary: "These pages explain each tool: what it does, what it is not, what every field means and how to choose a value for your own project, the warnings it can show, and a short walk-through on a sample project. They are part of the app and work with no internet connection.",
    notFor: [
      "Help never chooses numbers for you. Where a page talks about a value, it says how to pick one from your data (hole spacing, block size, survey line spacing), not a figure to copy.",
      "The pages are written in English for now. Tool names and button labels follow the language of the interface where the panel shows them.",
    ],
    fields: [
      { name: "? in a tool's header", what: "Opens the page for that tool.", choose: "Use it whenever a tool's pane is open and a field is unclear." },
      { name: "Help > GeoStrix Help (F1)", what: "Opens the list of all pages, grouped by tab.", choose: "Use it to browse, or to search for a word across every page." },
      { name: "Search", what: "Finds the pages that contain every word you type, best matches first.", choose: "Type the word you see on screen (a field name, a warning, a file type such as UBC or OMF)." },
      { name: "Simple / Advanced (top right of the ribbon)", what: "Simple shows the everyday tools; Advanced shows every tool.", choose: "If a page mentions a tool you cannot see, switch to Advanced." },
    ],
    warnings: [],
    howto: {
      sample: "any",
      steps: [
        "Open a sample project: File > Open Sample Project, then Harry, Woodjam, Perk-Rocky, Silvertip or WA calcrete uranium.",
        "Open a tool from the ribbon, for example Geophysics > Block models.",
        "Click the ? in the tool's header to read its page beside it.",
        "Press F1 at any time for the list of pages and the search box.",
      ],
    },
    related: ["block-models"],
  },
];
