// TASKS.csv #1218 — a loaded sample says what it is on its tab and in Save As. A project the geologist has named keeps its name.
const NAMES = { harry: "Harry property (sample)", woodjam: "Woodjam (sample)", perk: "Perk-Rocky (sample)", silvertip: "Silvertip (sample)", wa_uranium: "WA palaeochannel uranium (sample)", blake: "Blake River gravity (sample)" }; // wa_uranium: TASKS.csv #2168; blake: #2829
export const sampleProjectName = (which, current) => (!current || current === "Untitled project" ? NAMES[which] || current : current);
