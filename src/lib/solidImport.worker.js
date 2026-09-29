// TASKS.csv #414 — parses an imported solid (DXF / OBJ) off the UI thread. Receives { file } (a File: the
// worker streams it, the UI thread never holds its text), posts { progress: [read, total] } while reading,
// then { result } with every part's typed arrays TRANSFERRED (no copy), or { error }.
// #483: each part also gets its world-axis vertex normals (solidNormals) here, off the UI thread.
import { parseSolidFileStream, solidNormals } from "./solidImport.js";

self.onmessage = async (e) => {
  try {
    const result = await parseSolidFileStream(e.data.file, (read, total) => self.postMessage({ progress: [read, total] }));
    result.parts.forEach((p) => { p.normals = solidNormals(p.positions, p.indices); });
    self.postMessage({ result }, result.parts.flatMap((p) => [p.positions.buffer, p.indices.buffer, p.normals.buffer]));
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
