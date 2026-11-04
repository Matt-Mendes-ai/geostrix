// TASKS.csv #1740 (review #1645, Copley) — a logged value that says nothing was logged ('Unknown', 'not logged', 'n/a', 'none', '-',
// '?') is not a unit or an assemblage: the Alteration tool offered Copley's 13 unlogged intervals as 'Unknown' and modelled a 12.8 Mm3
// 'Alteration halo: Unknown'.
const NOT_LOGGED = /^\s*(unknown|unk|not\s*logged|nl|n\/?a|none|nil|no\s*data|nd|-+|\?+|null|blank|tbd)\s*$/i;
export const isNotLogged = (v) => v == null || String(v).trim() === "" || NOT_LOGGED.test(String(v));
