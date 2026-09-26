// TASKS.csv #341 — safe file writes for the main process.
//
// writeFileAtomic: write a temp file next to the target, then rename it over the target, so a crash or a
// sync client touching the file mid-write can never leave a half-written project. Windows can refuse
// the rename when the target is locked (an open viewer, a sync client); the complete temp file then gets
// copied over instead — not atomic — and the temp file is removed once that copy succeeded (#469).
//
// backupBeforeOverwrite: before a PROJECT file is overwritten, the previous version is kept as
// "<name>.bak" (one generation), so a bad save — wrong project in the wrong tab, a bug — is recoverable.
//
// quarantineUnreadable: an autosave that no longer parses used to be treated as "no autosave" and then
// overwritten by the next autosave tick — the one copy of the lost work, destroyed. It is now moved
// aside to "autosave.unreadable-<timestamp>.json" and the caller is told where.
const fs = require("node:fs");
const path = require("node:path");

// TASKS.csv #469 — the fallback used to delete the temp file in a `finally`, i.e. even when the copy
// FAILED (disk full half-way through): the target was left truncated and the only complete copy was gone.
// Now the temp file is removed only after a successful copy; on a failed copy it is kept and its path is
// in the error (err.keptAt), so the message the user sees says where the complete copy is. A failed first
// write no longer leaves a stray temp file behind. `fsp` is injectable for tests.
async function writeFileAtomic(filePath, data, encoding, fsp = fs.promises) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try { await fsp.writeFile(tmp, data, encoding); }
  catch (err) { await fsp.unlink(tmp).catch(() => {}); throw err; }
  try { await fsp.rename(tmp, filePath); return; } catch (_) { /* target locked (viewer, sync client): copy instead */ }
  try { await fsp.copyFile(tmp, filePath); }
  catch (err) {
    const e = new Error(`${err.message} — the complete copy was kept at ${tmp}`);
    e.code = err.code; e.keptAt = tmp;
    throw e;
  }
  await fsp.unlink(tmp).catch(() => {});
}

const PROJECT_FILE = /\.geostrix(\.json)?$/i;
async function backupBeforeOverwrite(filePath) {
  if (!PROJECT_FILE.test(filePath)) return null;
  try {
    await fs.promises.access(filePath);
  } catch { return null; } // nothing to back up
  const bak = `${filePath}.bak`;
  await fs.promises.copyFile(filePath, bak);
  return bak;
}

async function quarantineUnreadable(filePath, content) {
  try { JSON.parse(content); return null; } catch { /* unreadable */ }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(path.dirname(filePath), `${path.basename(filePath).replace(/\.json$/i, "")}.unreadable-${stamp}.json`);
  await fs.promises.rename(filePath, dest);
  return dest;
}

module.exports = { writeFileAtomic, backupBeforeOverwrite, quarantineUnreadable };
