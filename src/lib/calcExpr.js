// TASKS.csv #344 — a small expression compiler for the field calculator (and anything else that needs user
// formulas, e.g. calculated assay columns, #401). It replaces `new Function(...columns, "return (" + expr + ")")`,
// which checked only the identifiers in the EXPRESSION and then passed every COLUMN NAME in as a function
// parameter: a column named `{x=<code>}` is a destructuring parameter whose default value runs, and row keys come
// straight from a loaded .geostrix.json — so opening a shared project and running any field calculation on that
// layer could execute code with access to the app's file-reading bridge. Nothing here ever reaches eval/Function:
// the expression is tokenised, parsed into a tree, and evaluated by walking it, so column names are only ever
// looked up as plain strings.
//
// TASKS.csv #554 — the conditional coding Micromine users do in a field calculator (domain flags before
// compositing): comparisons, and / or / not, if(cond, then, else), 'text' literals and [Column name] quoting for
// headers with spaces or symbols ("Au (g/t)", "Cu%", "2nd_split"). Text RESULTS only when the caller asks
// (allowText: the attribute table); calculated assay elements stay numeric.
//
// Grammar: expr := or ; or := and (('or'|'||') and)* ; and := not (('and'|'&&') not)* ;
//          not := ('not'|'!') not | cmp ; cmp := add (('<'|'<='|'>'|'>='|'='|'=='|'!='|'<>') add)? ;
//          add := term (('+'|'-') term)* ; term := unary (('*'|'/'|'%') unary)* ;
//          unary := ('+'|'-') unary | power ; power := primary ('^' unary)? ;
//          primary := number | 'text' | "text" | [column name] | name | name '(' args ')' | '(' expr ')'
// A column value that is missing or not numeric is NaN in arithmetic — NOT 0 — so a formula over a
// partly-populated column gives a blank result for that row instead of a made-up number. A comparison with a
// missing value is unknown (blank), and if() of an unknown condition is blank too.

export const CALC_FUNCTIONS = {
  abs: Math.abs, sqrt: Math.sqrt, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor,
  ceil: Math.ceil, pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp,
};
const SPECIAL = ["if"]; // evaluated lazily, not in CALC_FUNCTIONS
const WORD_OPS = { and: "and", or: "or", not: "not" };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at position ${i + 1}.`);
      tokens.push({ t: "num", v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error(`Text started at position ${i + 1} is never closed with ${c}.`);
      tokens.push({ t: "str", v: src.slice(i + 1, end) }); i = end + 1; continue;
    }
    if (c === "[") {
      const end = src.indexOf("]", i + 1);
      if (end < 0) throw new Error(`"[" at position ${i + 1} has no closing "]".`);
      tokens.push({ t: "qname", v: src.slice(i + 1, end) }); i = end + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      const w = m[0].toLowerCase();
      if (WORD_OPS[w]) tokens.push({ t: WORD_OPS[w] }); else tokens.push({ t: "name", v: m[0] });
      i += m[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "<>", "&&", "||"].includes(two)) { tokens.push({ t: two === "&&" ? "and" : two === "||" ? "or" : two === "==" ? "=" : two === "<>" ? "!=" : two }); i += 2; continue; }
    if ("<>=!".includes(c)) { tokens.push({ t: c === "!" ? "not" : c }); i++; continue; }
    if ("+-*/%^(),".includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new Error(`"${c}" isn't allowed — use numbers, 'text', column names (or [Column name]), + - * / % ^ ( ), comparisons, and / or / not, if() and the listed functions.`);
  }
  return tokens;
}

const toNum = (v) => {
  if (v == null || v === "" || typeof v === "boolean") return NaN;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};
const isBlank = (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));

// Returns (row) => value. Default (numeric) mode: a number, NaN when blank / not numeric — exactly the old
// behaviour. With { allowText: true } the result may also be a string ('MIN') or a boolean (a bare comparison).
// Throws a readable Error for a malformed expression or an unknown name, before any row is touched.
export function compileCalc(expr, columns, { allowText = false } = {}) {
  const colSet = new Set(columns);
  const tokens = tokenize(String(expr ?? ""));
  if (!tokens.length) throw new Error("Enter an expression.");
  let p = 0;
  const peek = () => tokens[p];
  const eat = (t) => { if (tokens[p]?.t !== t) throw new Error(`Expected "${t}".`); p++; };

  function parseOr() { let n = parseAnd(); while (peek()?.t === "or") { p++; n = { op: "or", a: n, b: parseAnd() }; } return n; }
  function parseAnd() { let n = parseNot(); while (peek()?.t === "and") { p++; n = { op: "and", a: n, b: parseNot() }; } return n; }
  function parseNot() { if (peek()?.t === "not") { p++; return { op: "not", a: parseNot() }; } return parseCmp(); }
  function parseCmp() {
    const n = parseAdd();
    const t = peek()?.t;
    if (["<", "<=", ">", ">=", "=", "!="].includes(t)) { p++; return { op: t, a: n, b: parseAdd() }; }
    return n;
  }
  function parseAdd() {
    let node = parseTerm();
    while (peek() && (peek().t === "+" || peek().t === "-")) { const op = tokens[p++].t; node = { op, a: node, b: parseTerm() }; }
    return node;
  }
  function parseTerm() {
    let node = parseUnary();
    while (peek() && "*/%".includes(peek().t) && peek().t.length === 1) { const op = tokens[p++].t; node = { op, a: node, b: parseUnary() }; }
    return node;
  }
  function parseUnary() {
    if (peek() && (peek().t === "+" || peek().t === "-")) { const op = tokens[p++].t; return { op: op === "-" ? "neg" : "pos", a: parseUnary() }; }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (peek() && peek().t === "^") { p++; return { op: "^", a: base, b: parseUnary() }; }
    return base;
  }
  function parsePrimary() {
    const tok = tokens[p];
    if (!tok) throw new Error("The expression ends too early.");
    if (tok.t === "num") { p++; return { num: tok.v }; }
    if (tok.t === "str") {
      if (!allowText) throw new Error("Text values ('…') can't be used here — this formula must give a number.");
      p++; return { str: tok.v };
    }
    if (tok.t === "(") { p++; const e = parseOr(); eat(")"); return e; }
    if (tok.t === "qname") {
      p++;
      if (!colSet.has(tok.v)) throw new Error(`Unknown column [${tok.v}] — columns: ${columns.join(", ") || "none"}.`);
      return { col: tok.v };
    }
    if (tok.t === "name") {
      p++;
      if (peek() && peek().t === "(") {
        const fname = tok.v.toLowerCase();
        const special = SPECIAL.includes(fname);
        if (!special && !Object.prototype.hasOwnProperty.call(CALC_FUNCTIONS, tok.v)) throw new Error(`Unknown function "${tok.v}" — available: if, ${Object.keys(CALC_FUNCTIONS).join(", ")}.`);
        p++;
        const args = [];
        if (peek() && peek().t !== ")") { args.push(parseOr()); while (peek() && peek().t === ",") { p++; args.push(parseOr()); } }
        eat(")");
        if (fname === "if") {
          if (args.length !== 3) throw new Error("if() takes three parts: if(condition, value if true, value if false).");
          return { iff: args };
        }
        return { fn: tok.v, args };
      }
      if (!colSet.has(tok.v)) throw new Error(`Unknown name "${tok.v}" — must be a column (${columns.join(", ") || "none"}; use [Column name] for names with spaces or symbols) or a listed function.`);
      return { col: tok.v };
    }
    throw new Error(`Unexpected "${tok.t}".`);
  }

  const ast = parseOr();
  if (p !== tokens.length) { const t = tokens[p]; throw new Error(`Unexpected "${t.t === "name" || t.t === "num" || t.t === "str" ? t.v : t.t}" after the end of the expression.`); }

  // comparison of two values: both numeric -> numeric; otherwise as text (case-insensitive, trimmed). Unknown (null)
  // when either side is blank.
  const compare = (a, b, op) => {
    if (isBlank(a) || isBlank(b)) return null;
    const na = toNum(a), nb = toNum(b);
    let c;
    if (Number.isFinite(na) && Number.isFinite(nb)) c = na < nb ? -1 : na > nb ? 1 : 0;
    else { const sa = String(a).trim().toLowerCase(), sb = String(b).trim().toLowerCase(); c = sa < sb ? -1 : sa > sb ? 1 : 0; }
    switch (op) { case "<": return c < 0; case "<=": return c <= 0; case ">": return c > 0; case ">=": return c >= 0; case "=": return c === 0; default: return c !== 0; }
  };
  const truth = (v) => (v == null ? null : typeof v === "boolean" ? v : isBlank(v) ? null : Number.isFinite(toNum(v)) ? toNum(v) !== 0 : String(v).length > 0);
  const val = (n, row) => {
    if ("num" in n) return n.num;
    if ("str" in n) return n.str;
    if ("col" in n) return Object.prototype.hasOwnProperty.call(row, n.col) ? row[n.col] : undefined;
    if ("iff" in n) { const c = truth(val(n.iff[0], row)); return c == null ? null : val(c ? n.iff[1] : n.iff[2], row); }
    if ("fn" in n) return CALC_FUNCTIONS[n.fn](...n.args.map((a) => toNum(val(a, row))));
    switch (n.op) {
      case "and": { const a = truth(val(n.a, row)); if (a === false) return false; const b = truth(val(n.b, row)); return a == null || b == null ? (b === false ? false : null) : b; }
      case "or": { const a = truth(val(n.a, row)); if (a === true) return true; const b = truth(val(n.b, row)); return a == null || b == null ? (b === true ? true : null) : b; }
      case "not": { const a = truth(val(n.a, row)); return a == null ? null : !a; }
      case "<": case "<=": case ">": case ">=": case "=": case "!=": return compare(val(n.a, row), val(n.b, row), n.op);
      default: break;
    }
    const a = toNum(val(n.a, row));
    switch (n.op) {
      case "neg": return -a;
      case "pos": return a;
      case "+": return a + toNum(val(n.b, row));
      case "-": return a - toNum(val(n.b, row));
      case "*": return a * toNum(val(n.b, row));
      case "/": return a / toNum(val(n.b, row));
      case "%": return a % toNum(val(n.b, row));
      case "^": return Math.pow(a, toNum(val(n.b, row)));
      default: throw new Error("Bad expression.");
    }
  };
  if (allowText) return (row) => { const v = val(ast, row || {}); return isBlank(v) ? null : v; };
  return (row) => { const v = val(ast, row || {}); return typeof v === "boolean" ? (v ? 1 : 0) : toNum(v); };
}
