// TASKS.csv #668 — ONE list of the devDependencies that ship, read by both audit-shipped.mjs (security advisories)
// and third-party-licenses.mjs (Help > Third-party Licences). They had drifted: the audit's own copy left out
// pdfjs-dist, the one bundled library that parses untrusted files (a report PDF from a third party), so a future
// PDF.js advisory would not have failed CI.
export const BUNDLED_FROM_DEV = ["react", "react-dom", "pdfjs-dist", "electron"]; // in devDependencies, but they ship
// pdfjs-dist's optional Node canvas (and its per-platform binaries): never bundled into the app
export const isNotShipped = (name) => name === "@napi-rs/canvas" || name.startsWith("@napi-rs/canvas-");
