// TASKS.csv #341 — safe file writes for the main process.
//
// writeFileAtomic: write a temp file next to the target, then rename it over the target, so a crash or a
// sync client touching the file mid-write can never leave a half-written project. Windows can refuse
// the rename when the target is locked (an open viewer, a sync client); the complete temp file then gets
// copied over instead — not atomic, but never partial from our side — and the temp file is always
// removed.
//
// backupBeforeOverwrite: before a PROJECT file is overwritten, the previous version is kept as
// "<name>.bak" (one generation), so a bad save — wrong project in the wrong tab, a bug — is recoverable.
//
// quarantineUnreadable: an autosave that no longer parses used to be treated as "no autosave" and then
// overwritten by the next autosave tick — the one copy of the lost work, destroyed. It is now moved
// aside to "autosave.unreadable-<timestamp>.json" and the caller is told where.
const fs = require("node:fs");
const path = require("node:path");

async function writeFileAtomic(filePath, data, encoding) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, data, encoding);
  try {
    await fs.promises.rename(tmp, filePath);
  } catch (err) {
    try { await fs.promises.copyFile(tmp, filePath); }
    finally { await fs.promises.unlink(tmp).catch(() => {}); }
  }
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
