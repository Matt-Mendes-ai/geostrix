// TASKS.csv #1280 — an OMF's parse and coarsening off the UI thread: about 800 ms of a frozen window on Woodjam's ZTEM inversion. Same function, same result.
import { omfToProjectObjects } from "./omfImport.js";
import { useDictionary as setDictionary } from "./i18n.js";

self.onmessage = async (e) => {
  const { buffer, maxCells, opts, language, dictionary } = e.data;
  setDictionary(language, dictionary); // its messages in the interface language, as #865's worker does
  try {
    self.postMessage({ res: await omfToProjectObjects(buffer, maxCells, opts) });
  } catch (err) {
    self.postMessage({ failed: String(err?.message || err) });
  }
};
