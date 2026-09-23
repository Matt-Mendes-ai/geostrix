// TASKS.csv #344 — a small arithmetic expression compiler for the field calculator (and anything else
// that needs user formulas, e.g. calculated assay columns, #401). It replaces `new Function(...columns,
// "return (" + expr + ")")`, which checked only the identifiers in the EXPRESSION and then passed every
// COLUMN NAME in as a function parameter: a column named `{x=<code>}` is a destructuring parameter whose
// default value runs, and row keys come straight from a loaded .geostrix.json — so opening a shared
// project and running any field calculation on that layer could execute code with access to the app's
// file-reading bridge. Nothing here ever reaches eval/Function: the expression is tokenised, parsed into
// a tree, and evaluated by walking it, so column names are only ever looked up as plain strings.
//
// Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/'|'%') unary)* ;
//          unary := ('+'|'-') unary | power ; power := primary ('^' unary)? ;
//          primary := number | name | name '(' args ')' | '(' expr ')'
// Names are column names (letters/digits/underscore, not starting with a digit) or the whitelisted
// functions below. A column value that is missing or not numeric is NaN — NOT 0 — so a formula over a
// partly-populated column gives a blank result for that row instead of a made-up number.

export const CALC_FUNCTIONS = {
  abs: Math.abs, sqrt: Math.sqrt, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor,
  ceil: Math.ceil, pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp,
};

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
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      tokens.push({ t: "name", v: m[0] }); i += m[0].length; continue;
    }
    if ("+-*/%^(),".includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new Error(`"${c}" isn't allowed — use numbers, column names, + - * / % ^ ( ) and the listed functions.`);
  }
  return tokens;
}

// Returns (row) => number (NaN when any referenced value is missing). Throws a readable Error for a
// malformed expression or an unknown name, before any row is touched.
export function compileCalc(expr, columns) {
  const colSet = new Set(columns);
  const tokens = tokenize(String(expr ?? ""));
  if (!tokens.length) throw new Error("Enter an expression.");
  let p = 0;
  const peek = () => tokens[p];
  const eat = (t) => { if (tokens[p]?.t !== t) throw new Error(`Expected "${t}".`); p++; };

  function parseExpr() {
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
    if (tok.t === "(") { p++; const e = parseExpr(); eat(")"); return e; }
    if (tok.t === "name") {
      p++;
      if (peek() && peek().t === "(") {
        if (!Object.prototype.hasOwnProperty.call(CALC_FUNCTIONS, tok.v)) throw new Error(`Unknown function "${tok.v}" — available: ${Object.keys(CALC_FUNCTIONS).join(", ")}.`);
        p++;
        const args = [];
        if (peek() && peek().t !== ")") { args.push(parseExpr()); while (peek() && peek().t === ",") { p++; args.push(parseExpr()); } }
        eat(")");
        return { fn: tok.v, args };
      }
      if (!colSet.has(tok.v)) throw new Error(`Unknown name "${tok.v}" — must be a column (${columns.join(", ") || "none"}) or a listed function.`);
      return { col: tok.v };
    }
    throw new Error(`Unexpected "${tok.t}".`);
  }

  const ast = parseExpr();
  if (p !== tokens.length) throw new Error(`Unexpected "${tokens[p].t === "name" || tokens[p].t === "num" ? tokens[p].v : tokens[p].t}" after the end of the expression.`);

  const toNum = (v) => {
    if (v == null || v === "") return NaN;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : NaN;
  };
  const ev = (n, row) => {
    if ("num" in n) return n.num;
    if ("col" in n) return toNum(Object.prototype.hasOwnProperty.call(row, n.col) ? row[n.col] : undefined);
    if ("fn" in n) return CALC_FUNCTIONS[n.fn](...n.args.map((a) => ev(a, row)));
    const a = ev(n.a, row);
    switch (n.op) {
      case "neg": return -a;
      case "pos": return a;
      case "+": return a + ev(n.b, row);
      case "-": return a - ev(n.b, row);
      case "*": return a * ev(n.b, row);
      case "/": return a / ev(n.b, row);
      case "%": return a % ev(n.b, row);
      case "^": return Math.pow(a, ev(n.b, row));
      default: throw new Error("Bad expression.");
    }
  };
  return (row) => ev(ast, row || {});
}
