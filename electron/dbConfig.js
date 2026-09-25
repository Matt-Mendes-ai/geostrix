// TASKS.csv #348 — "Use SSL" used to mean encrypted but UNVERIFIED (rejectUnauthorized: false), so anyone
// on camp Wi-Fi could impersonate the server and collect the company database password. The certificate
// is now verified by default; trusting a self-signed certificate is a separate, explicitly-labelled
// choice (config.sslInsecure). Sessions are also READ ONLY with a 2-minute statement timeout: GeoStrix
// only ever reads from a drillhole database, and the SQL box used to run anything with autocommit.
const DB_STATEMENT_TIMEOUT_MS = 120000;
function dbSsl(config) {
  if (!config.ssl) return undefined;
  return { rejectUnauthorized: !config.sslInsecure, ...(config.host ? { servername: config.host } : {}) };
}
function pgConfig(config) {
  return {
    host: config.host, port: Number(config.port) || 5432, database: config.database,
    user: config.user, password: config.password,
    ssl: dbSsl(config) || false,
    connectionTimeoutMillis: 8000,
    options: `-c default_transaction_read_only=on -c statement_timeout=${DB_STATEMENT_TIMEOUT_MS}`, // #348
  };
}
function mysqlConfig(config) {
  return {
    host: config.host, port: Number(config.port) || 3306, database: config.database,
    user: config.user, password: config.password,
    ssl: dbSsl(config),
    connectTimeout: 8000,
  };
}
module.exports = { DB_STATEMENT_TIMEOUT_MS, dbSsl, pgConfig, mysqlConfig };
