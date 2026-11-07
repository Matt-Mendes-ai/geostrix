// TASKS.csv #1671 (review #1646, Kodiak) — a workbook unzipped and its sheet XML read off the UI thread: Kodiak's 1.6 MB soil workbook
// froze the window 1.7 s before its import dialog. Errors come back as failed, and the caller reads the workbook itself then
// (its messages in the interface language).
import { xlsxToCsvFiles } from "./xlsx.js";

self.onmessage = async (e) => {
  const { bytes, name } = e.data;
  try { self.postMessage({ sheets: await xlsxToCsvFiles(bytes, name) }); } catch (err) { self.postMessage({ failed: String(err?.message || err) }); }
};
