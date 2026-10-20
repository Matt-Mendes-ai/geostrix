// TASKS.csv #621 — remembered database passwords, opt-in. Matt (2026-10-16): "Can we have the connection and
// password saved, so I don't have to enter the password everytime I connect to the database?" Until now a
// password was session-only by design (#206 / #348): typed, used, held in main-process memory, gone at quit.
// This keeps every part of that except the last, and only when the user ticks "Remember the password":
//  * the password is encrypted with Electron's safeStorage (Windows DPAPI: decryptable only by this Windows
//    user on this computer; macOS Keychain / Linux secret store elsewhere) and written to db-credentials.json in
//    the app's userData folder. Never to the project file, never to localStorage, never sent back to the page:
//    the renderer only learns WHETHER one is saved, and the main process fills it in at connect time.
//  * if safeStorage can't encrypt (no OS key store), nothing is saved — no plain-text fallback.
//  * keyed by engine | host | port | database | user, so a saved password is used only for exactly that login.
const fs = require("fs");
const path = require("path");

function createDbCredentialStore({ safeStorage, dir }) {
  const file = path.join(dir, "db-credentials.json");
  const keyOf = (c) => [c.engine || "postgres", String(c.host || "").trim().toLowerCase(), Number(c.port) || "", c.database || "", c.user || ""].join("|");
  const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { return {}; } };
  const write = (data) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const available = () => { try { return !!safeStorage?.isEncryptionAvailable(); } catch { return false; } };
  return {
    available,
    has: (c) => Object.prototype.hasOwnProperty.call(read(), keyOf(c)),
    get: (c) => {
      const enc = read()[keyOf(c)];
      if (!enc || !available()) return null;
      try { return safeStorage.decryptString(Buffer.from(enc, "base64")); } catch { return null; }
    },
    set: (c, password) => {
      if (!password || !available()) return false;
      const data = read();
      data[keyOf(c)] = safeStorage.encryptString(String(password)).toString("base64");
      write(data);
      return true;
    },
    forget: (c) => {
      const data = read();
      if (!(keyOf(c) in data)) return false;
      delete data[keyOf(c)];
      write(data);
      return true;
    },
  };
}

module.exports = { createDbCredentialStore };
