/* WHAT A STRING IN THE PAGE CAN SAY ONCE ITS PIECES ARE PUT TOGETHER.

   A text search for a key finds the key only when it is written out whole.
   The same key built from pieces - a constant plus a variable plus a
   literal, or two literals joined with + - passes a text search (measured
   for follow-up P4: localStorage.setItem(S0_MIG+db+'.x','1'), with S0_MIG a
   constant holding the flag's prefix, and indexedDB.deleteDatabase(
   'chatnft'+'.v2.x'), both passed stage0-source test 1 as it was).

   This reads the page's script as tokens and folds every chain of operands
   joined by + : a string, number or template literal is its own text; a
   name declared anywhere with const, let or var and an initialiser that
   folds is each value it was declared with; a call of a function of no
   arguments whose body is one return is what that return folds to; a part
   in parentheses is folded in turn. Anything else - a variable, a member,
   a call with arguments - is unknown, and splits the chain into the runs of
   known text on either side of it.

   WHAT IT CANNOT SEE: a key built at run time out of anything other than
   those (an array join, a replace, a += on a variable, a value read from
   storage), and a key assigned without a + chain the folder can follow.
   Those are named where the guards that use this are. */

const KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'instanceof', 'else', 'do', 'await', 'yield']);

/* Tokens: {t:'str'|'num'|'tpl'|'id'|'p', v, at}. A template literal keeps
   its parts: {t:'tpl', parts:[string | {src}]}. Comments are dropped. Throws
   on an unterminated literal or comment, so a tokenizer that lost its place
   says so rather than returning fewer strings. */
export function tokenize(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const prevSig = () => out.length ? out[out.length - 1] : null;
  const regexCanStart = () => {
    const p = prevSig();
    if (!p) return true;
    if (p.t === 'str' || p.t === 'num' || p.t === 'tpl') return false;
    if (p.t === 'id') return KEYWORDS.has(p.v);
    return !(p.v === ')' || p.v === ']');
  };
  const readQuoted = (q) => {
    let j = i + 1, s = '';
    for (;;) {
      if (j >= n) throw new Error('unterminated string at ' + i);
      const c = src[j];
      if (c === '\\') {
        const d = src[j + 1];
        const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
        if (d === 'u') {
          if (src[j + 2] === '{') { const e = src.indexOf('}', j); s += String.fromCodePoint(parseInt(src.slice(j + 3, e), 16)); j = e + 1; continue; }
          s += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; continue;
        }
        if (d === 'x') { s += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)); j += 4; continue; }
        if (d === '\r' && src[j + 2] === '\n') { j += 3; continue; }
        if (d === '\n' || d === '\r') { j += 2; continue; }
        s += esc[d] !== undefined ? esc[d] : d; j += 2; continue;
      }
      if (c === q) { i = j + 1; return s; }
      if (c === '\n') throw new Error('newline in a string at ' + i);
      s += c; j++;
    }
  };
  /* A template: text parts and the source of each ${...}, braces counted
     with strings, templates and comments inside skipped by a nested
     tokenize of the expression. */
  const readTemplate = () => {
    let j = i + 1, s = '';
    const parts = [];
    for (;;) {
      if (j >= n) throw new Error('unterminated template at ' + i);
      const c = src[j];
      if (c === '\\') { s += src[j + 1]; j += 2; continue; }
      if (c === '`') { parts.push(s); i = j + 1; return parts; }
      if (c === '$' && src[j + 1] === '{') {
        parts.push(s); s = '';
        let depth = 1, k = j + 2;
        while (depth) {
          if (k >= n) throw new Error('unterminated ${ at ' + j);
          const d = src[k];
          if (d === '{') depth++;
          else if (d === '}') depth--;
          else if (d === '"' || d === "'" || d === '`') {
            /* skip a literal inside the expression */
            const save = i; i = k;
            if (d === '`') readTemplate(); else readQuoted(d);
            k = i; i = save; continue;
          }
          k++;
        }
        parts.push({ src: src.slice(j + 2, k - 1) });
        j = k; continue;
      }
      s += c; j++;
    }
  };
  while (i < n) {
    /* each token's end, set on the step after it was read */
    if (out.length && out[out.length - 1].e === undefined) out[out.length - 1].e = i;
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) throw new Error('unterminated comment at ' + i); i = e + 2; continue; }
    if (c === '"' || c === "'") { const at = i; out.push({ t: 'str', v: readQuoted(c), at }); continue; }
    if (c === '`') { const at = i; out.push({ t: 'tpl', parts: readTemplate(), at }); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = src.slice(i).match(/^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|[0-9_]*\.?[0-9_]+(?:[eE][+-]?[0-9]+)?n?)/);
      out.push({ t: 'num', v: m[0], at: i }); i += m[0].length; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_$][\w$]*/);
      out.push({ t: 'id', v: m[0], at: i }); i += m[0].length; continue;
    }
    if (c === '/' && regexCanStart()) {
      let j = i + 1, cls = false;
      for (;;) {
        if (j >= n || src[j] === '\n') throw new Error('unterminated regex at ' + i);
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') cls = true; else if (d === ']') cls = false;
        else if (d === '/' && !cls) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/.test(src[j])) j++;
      out.push({ t: 're', v: src.slice(i, j), at: i }); i = j; continue;
    }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
    const p = ['===', '!==', '**=', '...', '>>>', '<<=', '>>=', '&&=', '||=', '??='].indexOf(three) >= 0 ? three
      : ['==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'].indexOf(two) >= 0 ? two : c;
    out.push({ t: 'p', v: p, at: i }); i += p.length;
  }
  if (out.length && out[out.length - 1].e === undefined) out[out.length - 1].e = i;
  return out;
}

const UNKNOWN = null;
const numText = (v) => { const x = Number(v.replace(/_/g, '').replace(/n$/, '')); return isNaN(x) ? v : String(x); };
const CAP = 64;
const isMember = (t) => !!t && (t.v === '.' || t.v === '(' || t.v === '[' || t.v === '?.');

/* The operand that starts at token k: its end (exclusive), and what it can
   be - alternatives, each an array of parts, a part a string or UNKNOWN. */
function operand(toks, k, env, depth) {
  const t = toks[k];
  if (!t) return null;
  if (t.t === 'str') return { end: k + 1, alts: [[t.v]] };
  if (t.t === 'num') return { end: k + 1, alts: [[numText(t.v)]] };
  if (t.t === 'tpl') {
    let alts = [[]];
    for (const part of t.parts) {
      let pa;
      if (typeof part === 'string') pa = [[part]];
      else {
        try { pa = depth > 6 ? [[UNKNOWN]] : foldExpr(tokenize(part.src), env, depth + 1); } catch (_) { pa = [[UNKNOWN]]; }
      }
      alts = cross(alts, pa);
    }
    return { end: k + 1, alts };
  }
  if (t.t === 'p' && t.v === '(') {
    const close = matching(toks, k);
    if (isMember(toks[close + 1])) return { end: skipMember(toks, close + 1), alts: [[UNKNOWN]] };
    return { end: close + 1, alts: depth > 6 ? [[UNKNOWN]] : foldExpr(toks.slice(k + 1, close), env, depth + 1) };
  }
  if (t.t === 'id') {
    const nx = toks[k + 1];
    /* f() with no arguments, f a function whose body is one return */
    if (nx && nx.v === '(' && toks[k + 2] && toks[k + 2].v === ')') {
      if (isMember(toks[k + 3])) return { end: skipMember(toks, k + 3), alts: [[UNKNOWN]] };
      const f = env.fns.get(t.v);
      return { end: k + 3, alts: f && depth <= 6 ? foldExpr(f, env, depth + 1) : [[UNKNOWN]] };
    }
    if (isMember(nx)) return { end: skipMember(toks, k + 1), alts: [[UNKNOWN]] };
    const v = env.consts.get(t.v);
    return { end: k + 1, alts: v ? v.map(x => [x]) : [[UNKNOWN]] };
  }
  return null;
}
function matching(toks, k) {
  const open = toks[k].v, close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let d = 0;
  for (let j = k; j < toks.length; j++) {
    if (toks[j].t !== 'p') continue;
    if (toks[j].v === open) d++;
    else if (toks[j].v === close) { d--; if (!d) return j; }
  }
  return toks.length - 1;
}
function skipMember(toks, j) {
  while (isMember(toks[j])) {
    if (toks[j].v === '.' || toks[j].v === '?.') j += 2;
    else j = matching(toks, j) + 1;
  }
  return j;
}
function cross(a, b) {
  const out = [];
  for (const x of a) for (const y of b) { out.push(x.concat(y)); if (out.length >= CAP) return out; }
  return out;
}

/* A whole expression (tokens) as its leading + chain: alternatives of parts.
   Anything after the chain is ignored. */
function foldExpr(toks, env, depth) {
  const c = chainAt(toks, 0, env, depth || 0);
  return c ? c.alts : [[UNKNOWN]];
}
function chainAt(toks, k, env, depth) {
  const o = operand(toks, k, env, depth);
  if (!o) return null;
  let alts = o.alts, end = o.end;
  while (toks[end] && toks[end].t === 'p' && toks[end].v === '+') {
    const nx = operand(toks, end + 1, env, depth);
    if (!nx) break;
    alts = cross(alts, nx.alts);
    end = nx.end;
  }
  return { start: k, end, alts };
}

/* The names a declaration gives a value that folds, and the functions of no
   arguments whose body is a single return, from the whole script. Iterated,
   so a constant built from another is found in any order. */
export function envOf(toks) {
  const env = { consts: new Map(), fns: new Map() };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'id' && t.v === 'function' && toks[k + 1] && toks[k + 1].t === 'id' && toks[k + 2] && toks[k + 2].v === '('
      && toks[k + 3] && toks[k + 3].v === ')' && toks[k + 4] && toks[k + 4].v === '{' && toks[k + 5] && toks[k + 5].v === 'return') {
      const close = matching(toks, k + 4);
      const semi = toks.slice(k + 6, close).findIndex(x => x.v === ';');
      const body = semi < 0 ? toks.slice(k + 6, close) : toks.slice(k + 6, k + 6 + semi);
      if (semi < 0 || k + 6 + semi === close - 1) env.fns.set(toks[k + 1].v, body);
    }
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t !== 'id' || (t.v !== 'const' && t.v !== 'let' && t.v !== 'var')) continue;
      let j = k + 1;
      for (;;) {
        const name = toks[j];
        if (!name || name.t !== 'id') break;
        if (!toks[j + 1] || toks[j + 1].v !== '=') {
          if (toks[j + 1] && toks[j + 1].v === ',') { j += 2; continue; }
          break;
        }
        const c = chainAt(toks, j + 2, env, 0);
        if (!c) break;
        const after = toks[c.end];
        if (after && (after.v === ',' || after.v === ';' || after.v === '}' || (after.t !== 'p'))) {
          const vals = c.alts.filter(a => a.every(x => x !== UNKNOWN)).map(a => a.join(''));
          if (vals.length === c.alts.length && vals.length && c.alts.length < CAP) {
            const had = env.consts.get(name.v) || [];
            for (const v of vals) if (had.indexOf(v) < 0) had.push(v);
            env.consts.set(name.v, had);
          }
        }
        if (after && after.v === ',') { j = c.end + 1; continue; }
        break;
      }
    }
  }
  return env;
}

/* Every chain in the script, folded: {start, end, alts, texts} where texts
   holds, for each alternative, each run of known text between unknowns and
   the whole joined with the unknowns left out. A name read as a member
   (x.NAME) is not an operand. */
export function foldAll(src) {
  const toks = tokenize(src);
  const env = envOf(toks);
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (!(t.t === 'str' || t.t === 'tpl' || t.t === 'num' || t.t === 'id' || (t.t === 'p' && t.v === '('))) continue;
    const prev = toks[k - 1];
    if (prev && (prev.v === '.' || prev.v === '?.')) continue;
    if (prev && prev.t === 'p' && prev.v === '+') continue;   /* inside a chain already taken */
    /* a call's argument list is not a grouping: its first argument is taken
       as a chain of its own, at the token after the parenthesis */
    if (t.t === 'p' && prev && ((prev.t === 'id' && !KEYWORDS.has(prev.v) && prev.v !== 'if' && prev.v !== 'while' && prev.v !== 'switch')
      || prev.v === ')' || prev.v === ']')) continue;
    const c = chainAt(toks, k, env, 0);
    if (!c) continue;
    const texts = [];
    for (const alt of c.alts) {
      let run = '';
      for (const x of alt) { if (x === UNKNOWN) { if (run) texts.push(run); run = ''; } else run += x; }
      if (run) texts.push(run);
      texts.push(alt.filter(x => x !== UNKNOWN).join(''));
    }
    const hasText = texts.some(s => s.length);
    if (t.t === 'p' && !hasText) continue;
    if (t.t === 'id' && c.end === k + 1 && !env.consts.has(t.v)) continue;
    /* a name being given a value is not a use of it */
    if (t.t === 'id' && c.end === k + 1 && toks[k + 1] && toks[k + 1].v === '=') continue;
    out.push({ start: k, end: c.end, texts, known: c.alts.every(a => a.every(x => x !== UNKNOWN)), src: src.slice(t.at, toks[c.end - 1].e), tok: t });
  }
  return { toks, env, chains: out };
}

/* Is the chain the first argument of a call to NAME (x.NAME( or NAME( )? */
export function firstArgOf(toks, chain, name) {
  const open = toks[chain.start - 1], fn = toks[chain.start - 2];
  if (!open || open.v !== '(' || !fn || fn.t !== 'id' || fn.v !== name) return false;
  const after = toks[chain.end];
  return !!after && (after.v === ',' || after.v === ')');
}
