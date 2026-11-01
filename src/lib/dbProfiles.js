// TASKS.csv #1081 (review #1016, security / privacy) — saved database connection profiles are kept on THIS computer
// (localStorage, like the Browser panel's favourites), not in the project file. A shared .geostrix.json handed the
// company database's host, database name and login name to whoever received it, and opening someone else's project
// added their profiles to your list. Profiles in older project files are moved here when the project is opened.
// A profile never holds a password (DatabaseConnectModal strips it; a remembered password is OS-encrypted in userData,
// #621); KEEP drops anything else too.
const KEY = "geostrix-db-connection-profiles";
const KEEP = ["name", "engine", "host", "port", "database", "user", "ssl", "sslInsecure", "rememberPassword"];

// TASKS.csv #1267 — what a connection needs before a socket is opened: a blank form used to reach the driver as the Windows
// user on localhost:5432 and come back as "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string". The message
// names the field, in the words the form uses. null when the profile can be tried.
export function profileProblem(p) {
  const blank = (k) => !String(p?.[k] ?? "").trim();
  if (blank("host")) return "Enter the host (the server's name or address).";
  const port = Number(p?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "Enter the port (1-65535).";
  if (blank("database")) return "Enter the database name.";
  if (blank("user")) return "Enter the user name.";
  return null;
}

export function cleanProfile(p) {
  const out = {};
  for (const k of KEEP) if (p && p[k] !== undefined) out[k] = p[k];
  return out;
}
export function readDbProfiles(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === "string" && p.name).map(cleanProfile) : [];
  } catch (_) { return []; }
}
export function writeDbProfiles(list, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify((list || []).map(cleanProfile))); } catch (_) { /* storage full or blocked: kept for this session */ }
}
// profiles from an opened project file, added where this computer has none of that name (this computer's win)
export function mergeDbProfiles(mine, fromFile) {
  const names = new Set((mine || []).map((p) => p.name));
  const add = (fromFile || []).filter((p) => p && typeof p.name === "string" && p.name && !names.has(p.name)).map(cleanProfile);
  return add.length ? [...(mine || []), ...add] : mine || [];
}
