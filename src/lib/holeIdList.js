// TASKS.csv #2104 — hole ids sorted with numbers in order (DH-2 before DH-10), and filtered by a typed text keeping the chosen one. Pure.
export const sortHoleIds = (ids) => [...ids].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
export const filterHoleIds = (ids, text, keep = "") => { const q = String(text || "").trim().toLowerCase(); return q ? ids.filter((id) => id === keep || String(id).toLowerCase().includes(q)) : ids; };
