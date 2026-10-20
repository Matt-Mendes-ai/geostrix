// TASKS.csv #598 — the contents of a Help > Report a problem zip, as a pure function (testable in Node). The modal
// gathers the inputs; this decides what goes in. Only what the user can see listed in the dialog is included: no
// passwords, no account details, the project only when they tick it.
import { buildZip } from "./shapefile.js";

export function buildProblemReport({ what, steps = "", crashed = false, info = {}, screenshot = null, includeShot = true, includeLog = true, includeProject = false, projectPayload = null, files = [], errors = [], project = null, userAgent = "" }) {
  const enc = new TextEncoder();
  const { sidecarLogTail, ...sys } = info || {};
  const version = sys.app || "?";
  const names = [
    includeShot && screenshot ? "window.png" : null,
    ...files.map((f) => `attachments/${f.name}`),
    includeLog && sidecarLogTail ? "python-engine-log.txt" : null,
    includeProject && projectPayload ? "project.geostrix.json" : null,
  ].filter(Boolean);
  const text = [
    `GeoStrix problem report — ${new Date().toISOString()}`,
    `Version: ${version}${sys.packaged === false ? " (development build)" : ""}`,
    crashed ? "The previous session did not close normally." : null,
    "", "WHAT HAPPENED", String(what || "").trim(), "", "WHAT I WAS DOING", String(steps || "").trim() || "(not given)", "",
    `Attached: ${names.join(", ") || "nothing else"}`,
  ].filter((l) => l !== null).join("\n");
  const zipFiles = [
    { name: "report.txt", data: enc.encode(text) },
    { name: "system-info.json", data: enc.encode(JSON.stringify({ ...sys, project: project?.name || null, crs: project?.epsg || null, userAgent }, null, 2)) },
    { name: "recent-errors.txt", data: enc.encode(errors.length ? errors.map((e) => `${e.at}  ${e.kind}: ${e.message}${e.stack ? `\n${e.stack}` : ""}`).join("\n\n") : "No errors were recorded in this session.") },
  ];
  if (includeShot && screenshot) zipFiles.push({ name: "window.png", data: screenshot });
  if (includeLog && sidecarLogTail) zipFiles.push({ name: "python-engine-log.txt", data: enc.encode(sidecarLogTail) });
  for (const f of files) zipFiles.push({ name: `attachments/${f.name}`, data: f.data });
  if (includeProject && projectPayload) zipFiles.push({ name: "project.geostrix.json", data: enc.encode(JSON.stringify(projectPayload)) });
  return { bytes: buildZip(zipFiles), names: zipFiles.map((f) => f.name), version };
}

// the email body (a mailto: link carries text only, so it asks for the zip to be attached)
export function problemReportEmail({ what, steps = "", version = "?", fileName, bytes = 0, emailLimit = 20e6 }) {
  const subject = `GeoStrix ${version} — problem report`;
  const body = `${String(what || "").trim()}\n\n${String(steps || "").trim() ? `What I was doing:\n${String(steps).trim()}\n\n` : ""}---\nPlease attach ${fileName} (in your Downloads folder) to this email before sending.${bytes > emailLimit ? `\nIt is ${(bytes / 1e6).toFixed(0)} MB — too big for most email services: share it through a cloud link instead.` : ""}`;
  return { subject, body };
}
