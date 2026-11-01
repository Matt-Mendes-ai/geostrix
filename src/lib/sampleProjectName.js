// TASKS.csv #1218 — a loaded sample says what it is on its tab and in Save As. A project the geologist has named keeps its name.
const NAMES = { harry: "Harry property (sample)", woodjam: "Woodjam (sample)", perk: "Perk-Rocky (sample)" };
export const sampleProjectName = (which, current) => (!current || current === "Untitled project" ? NAMES[which] || current : current);
