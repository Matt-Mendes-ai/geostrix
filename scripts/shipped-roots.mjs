// TASKS.csv #668 — ONE list of the devDependencies that ship, read by both audit-shipped.mjs (security advisories)
// and third-party-licenses.mjs (Help > Third-party Licences). They had drifted: the audit's own copy left out
// pdfjs-dist, the one bundled library that parses untrusted files (a report PDF from a third party), so a future
// PDF.js advisory would not have failed CI.
export const BUNDLED_FROM_DEV = ["react", "react-dom", "pdfjs-dist", "electron"]; // in devDependencies, but they ship
// pdfjs-dist's optional Node canvas (and its per-platform binaries): never bundled into the app
export const isNotShipped = (name) => name === "@napi-rs/canvas" || name.startsWith("@napi-rs/canvas-");
// TASKS.csv #1332 — an advisory counts only if it hits a copy that ships. npm audit names the affected copies in `nodes`: undici 7 ships, while the undici 6 under node-gyp is
// build tooling, and matching on the name alone failed the audit for a copy no user receives. With no `nodes` listed, the name is all there is, so it counts.
export const advisoryHitsShipped = (name, vuln, shippedNames, shippedKeys) => shippedNames.has(name) && (!vuln?.nodes?.length || vuln.nodes.some((k) => shippedKeys.has(k)));
