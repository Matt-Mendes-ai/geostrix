// TASKS.csv #1993 (drillhole step) — the .geoh5 writer off the main thread: h5wasm writes attribute by attribute, and a project of 559 holes (20 MB, 6,700 data entries)
// kept the window frozen for ~45 s. The elements come in one message, the bytes go back (transferred).
import { writeGeoh5 } from "./geoh5Write.js";

self.onmessage = async (e) => {
  const { id, elements, opts } = e.data;
  try {
    const res = await writeGeoh5(elements, opts || {});
    self.postMessage({ id, res }, [res.bytes.buffer]);
  } catch (err) { self.postMessage({ id, failed: String(err?.message || err) }); }
};
