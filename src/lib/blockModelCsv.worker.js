// TASKS.csv #1671 (review #1646, Kodiak) — a block-model CSV's Import off the UI thread: Kodiak's 380,250-row resistivity model froze
// the window 2.05 s while its cells were built and merged to the budget. The worker reads the file again (the dialog's own parse
// stays in the tabular worker) and does what GeophysicsModule's importMappedBlockModel did per attribute.
import { decodeTableBytes, parseTableText } from "./tabular.js";
import { importBlockModelAttrs } from "./blockModelCsv.js";

self.onmessage = (e) => {
  const { buf, base, mapping, attrs, maxCells } = e.data;
  try {
    const { text } = decodeTableBytes(buf);
    self.postMessage({ out: importBlockModelAttrs(parseTableText(text).rows, base, mapping, attrs, maxCells) });
  } catch (err) { self.postMessage({ failed: String(err?.message || err) }); }
};
