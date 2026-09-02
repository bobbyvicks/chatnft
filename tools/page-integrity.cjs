/* Static integrity check for index.html.
 *
 * WHY THIS EXISTS
 * Parsing is not running. `new Function(src)` accepts a call to a function that
 * was never declared, and a lookup of an element id that is nowhere in the
 * document. Both have shipped from this repo: a renamed call site passed a
 * parse check clean, and the smoke sweep asked for `#another` for several
 * commits after that element was renamed to `#closeed`. A patch that anchors on
 * the first line of a multi-line construct makes exactly this shape - two
 * halves that both parse, with a reference now pointing at nothing.
 *
 * There is no JS parser available offline in this repo (typescript 7 is the
 * native port and exposes no compiler API from the JS package; @babel/parser is
 * not installed), so this walks its own lexer. The lexer is the load-bearing
 * part and is self-tested on every run - see selfTest(). If the self-test fails
 * the tool exits 2 and reports NOTHING about the page, because a desynced lexer
 * would report a clean page just as confidently as a real one.
 *
 * CHECKS
 *   ids     every element id looked up with $() / getElementById() /
 *           querySelector('#x') exists, either as a static id= attribute in the
 *           markup or inside a string the script writes into the DOM.
 *   dupids  no id appears twice in the markup. getElementById returns the
 *           first, so the second element is unreachable by id and every
 *           lookup silently addresses the wrong node.
 *   calls   every bare `name(...)` call target is declared somewhere in the
 *           file or is a known global.
 *   css     the stylesheet's braces balance. A split CSS rule silently killed
 *           180 rules once and reported nothing at all.
 *
 * WHAT `calls` CANNOT DO, stated plainly because a check whose limit is unknown
 * gets trusted past it: it asks only "is this name declared ANYWHERE in the
 * file", not "is it in scope here". A call to something declared inside an
 * unrelated function resolves and is not reported. It does catch the case that
 * has actually bitten - a target that was renamed, deleted, or never existed -
 * because then the name is declared nowhere at all.
 *
 * ON THE GLOBALS LIST: it is hand-written and therefore suspect, but it is an
 * EXCLUSION list, so a name missing from it becomes a false POSITIVE that shows
 * up in the report and gets triaged. It cannot hide a real defect. The
 * population under test - the calls, the declarations, the ids - is derived
 * from the source every run and never typed.
 *
 * Usage:  node tools/page-integrity.cjs [path/to/index.html]
 * Exit 0 = clean, 1 = findings, 2 = the checker could not trust itself.
 */

const fs = require('fs');
const path = require('path');

/* ====================================================================== */
/* lexer                                                                  */
/* ====================================================================== */

const KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await', 'and', 'or', 'not',
]);

/* A `/` starts a regex unless the previous significant token could end an
   expression. `)` and `]` end expressions; `}` usually ends a block, so a regex
   is allowed after it. Identifiers end expressions unless they are one of the
   keywords above. */
function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.t === 'num' || prev.t === 'string' || prev.t === 'template' || prev.t === 'regex') return false;
  if (prev.t === 'ident') return KEYWORDS_BEFORE_REGEX.has(prev.v);
  if (prev.t === 'punct') return !(prev.v === ')' || prev.v === ']' || prev.v === '++' || prev.v === '--');
  return true;
}

const PUNCT3 = ['...', '===', '!==', '**=', '<<=', '>>=', '&&=', '||=', '??=', '>>>'];
const PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>', '${'];

/* Returns {tokens, ok, why}. tokens: {t,v,i} where
   t = ident | num | string | template | regex | punct | comment | ws
   For string/template tokens, v is the DECODED-ENOUGH text content (escapes are
   kept literal except that \" and \' and \` are unescaped), which is what the
   id harvesting needs. */
function lex(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let prev = null;
  /* stack of open template-literal holes: each entry counts `{` depth inside
     the hole so the matching `}` returns us to template scanning */
  const tmplStack = [];
  let resumeTemplate = false;

  function push(t, v, at) {
    const tok = { t, v, i: at };
    tokens.push(tok);
    if (t !== 'ws' && t !== 'comment') prev = tok;
    return tok;
  }

  /* read a template chunk starting at `i` (just past a ` or a }) */
  function readTemplateChunk(start) {
    let j = start;
    let out = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { out += src[j + 1] || ''; j += 2; continue; }
      if (c === '`') { push('template', out, start); return { end: j + 1, opened: false }; }
      if (c === '$' && src[j + 1] === '{') {
        push('template', out, start);
        push('punct', '${', j);
        return { end: j + 2, opened: true };
      }
      out += c; j++;
    }
    return { end: n, opened: false, unterminated: true };
  }

  while (i < n) {
    if (resumeTemplate) {
      resumeTemplate = false;
      const r = readTemplateChunk(i);
      if (r.unterminated) return { tokens, ok: false, why: 'unterminated template literal' };
      i = r.end;
      if (r.opened) tmplStack.push({ depth: 0 });
      continue;
    }

    const c = src[i];

    /* whitespace */
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      tokens.push({ t: 'ws', v: src.slice(i, j), i });
      i = j; continue;
    }

    /* comments */
    if (c === '/' && src[i + 1] === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      tokens.push({ t: 'comment', v: src.slice(i, j), i });
      i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) return { tokens, ok: false, why: 'unterminated block comment' };
      tokens.push({ t: 'comment', v: src.slice(i, e + 2), i });
      i = e + 2; continue;
    }

    /* strings */
    if (c === '"' || c === "'") {
      let j = i + 1, out = '';
      while (j < n) {
        const d = src[j];
        if (d === '\\') { out += src[j + 1] || ''; j += 2; continue; }
        if (d === c) break;
        if (d === '\n') return { tokens, ok: false, why: 'newline inside a ' + c + ' string at offset ' + i };
        out += d; j++;
      }
      if (j >= n) return { tokens, ok: false, why: 'unterminated string at offset ' + i };
      push('string', out, i);
      i = j + 1; continue;
    }

    /* template literal */
    if (c === '`') {
      const r = readTemplateChunk(i + 1);
      if (r.unterminated) return { tokens, ok: false, why: 'unterminated template literal at offset ' + i };
      i = r.end;
      if (r.opened) tmplStack.push({ depth: 0 });
      continue;
    }

    /* regex literal */
    if (c === '/' && regexAllowed(prev)) {
      let j = i + 1, inClass = false, ok = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') break;
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) {
        let k = j + 1;
        while (k < n && /[a-z]/.test(src[k])) k++;
        push('regex', src.slice(i, k), i);
        i = k; continue;
      }
      /* not a regex after all - fall through and treat as punctuation */
    }

    /* identifier */
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      push('ident', src.slice(i, j), i);
      i = j; continue;
    }

    /* number */
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObBn._]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E') && /[+-]/.test(src[j + 1] || '')) { j += 2; continue; }
        j++;
      }
      push('num', src.slice(i, j), i);
      i = j; continue;
    }

    /* braces, tracked for template holes */
    if (c === '{') {
      if (tmplStack.length) tmplStack[tmplStack.length - 1].depth++;
      push('punct', '{', i); i++; continue;
    }
    if (c === '}') {
      if (tmplStack.length) {
        const top = tmplStack[tmplStack.length - 1];
        if (top.depth === 0) {
          tmplStack.pop();
          push('punct', '}', i);
          i++; resumeTemplate = true; continue;
        }
        top.depth--;
      }
      push('punct', '}', i); i++; continue;
    }

    /* punctuation */
    const three = src.substr(i, 3);
    if (PUNCT3.includes(three)) { push('punct', three, i); i += 3; continue; }
    const two = src.substr(i, 2);
    if (PUNCT2.includes(two)) { push('punct', two, i); i += 2; continue; }
    push('punct', c, i); i++; continue;
  }

  if (tmplStack.length) return { tokens, ok: false, why: 'template literal left open' };
  return { tokens, ok: true, why: '' };
}

/* ====================================================================== */
/* lexer self-test - the tool refuses to report on the page unless this passes */
/* ====================================================================== */

function selfTest() {
  const fails = [];
  const t = (name, src, fn) => {
    const r = lex(src);
    if (!r.ok) { fails.push(name + ': lexer bailed - ' + r.why); return; }
    const sig = r.tokens.filter(x => x.t !== 'ws' && x.t !== 'comment');
    try { fn(sig, r.tokens); } catch (e) { fails.push(name + ': ' + e.message); }
  };
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };

  t('plain call', "$('art')", s => {
    eq(s.length, 4, 'token count');
    eq(s[0].v, '$', 'ident'); eq(s[2].t, 'string', 'arg type'); eq(s[2].v, 'art', 'arg value');
  });

  t('id inside a comment is not code', "// $('ghost')\n$('real')", s => {
    eq(s.filter(x => x.t === 'string').length, 1, 'strings outside comments');
    eq(s.find(x => x.t === 'string').v, 'real', 'the surviving string');
  });

  t('id inside a string is not a call', "var a = \"$('ghost')\"; $('real')", s => {
    const strs = s.filter(x => x.t === 'string').map(x => x.v);
    eq(strs.length, 2, 'two strings');
    eq(strs[0], "$('ghost')", 'the quoted one stays inert');
  });

  t('escaped quote does not end the string', "'a\\'b'; $('real')", s => {
    const strs = s.filter(x => x.t === 'string').map(x => x.v);
    eq(strs[0], "a'b", 'escape decoded');
    eq(strs[1], 'real', 'lexer stayed in sync');
  });

  t('regex containing a quote does not desync', "x.replace(/it's/g,''); $('real')", s => {
    eq(s.some(x => x.t === 'regex'), true, 'regex recognised');
    const strs = s.filter(x => x.t === 'string').map(x => x.v);
    eq(strs[strs.length - 1], 'real', 'lexer stayed in sync after the regex');
  });

  t('division is not a regex', "var r = a / b; var q = c / d; $('real')", s => {
    eq(s.filter(x => x.t === 'regex').length, 0, 'no regex tokens');
    eq(s.filter(x => x.t === 'string')[0].v, 'real', 'still in sync');
  });

  t('template with a hole lexes the hole as code', 'var s = `a${ $(\'inner\') }b`; $(\'real\')', s => {
    const strs = s.filter(x => x.t === 'string').map(x => x.v);
    eq(strs[0], 'inner', 'call inside the hole is code');
    eq(strs[1], 'real', 'lexer resumed after the template');
    const tm = s.filter(x => x.t === 'template').map(x => x.v);
    eq(tm.join('|'), 'a|b', 'template chunks');
  });

  t('nested braces inside a template hole', 'var s = `x${ {a:1}.a }y`; $(\'real\')', s => {
    eq(s.filter(x => x.t === 'string')[0].v, 'real', 'lexer resumed past nested braces');
    eq(s.filter(x => x.t === 'template').map(x => x.v).join('|'), 'x|y', 'chunks around nested braces');
  });

  t('nested template inside a hole', 'var s = `a${ `b${ 1 }c` }d`; $(\'real\')', s => {
    eq(s.filter(x => x.t === 'string')[0].v, 'real', 'lexer resumed past nested template');
  });

  /* the lexer must REFUSE bad input rather than quietly resync */
  const bad = lex("var s = 'unterminated");
  if (bad.ok) fails.push('unterminated string: lexer returned ok when it should refuse');

  return fails;
}

/* ====================================================================== */
/* page                                                                   */
/* ====================================================================== */

function readPage(file) {
  const src = fs.readFileSync(file, 'utf8');
  /* index.html has MIXED line endings. Never split on just one of them. */
  const lines = src.split(/\r\n|\r|\n/);

  const sOpen = lines.findIndex(l => /<script>/.test(l));
  const sClose = lines.findIndex(l => /<\/script>/.test(l));
  const cOpen = lines.findIndex(l => /<style>/.test(l));
  const cClose = lines.findIndex(l => /<\/style>/.test(l));
  if (sOpen < 0 || sClose <= sOpen) throw new Error('could not locate the <script> block');
  if (cOpen < 0 || cClose <= cOpen) throw new Error('could not locate the <style> block');

  return {
    lines,
    scriptFirstLine: sOpen + 2,           // 1-based line of the first script line
    script: lines.slice(sOpen + 1, sClose).join('\n'),
    css: lines.slice(cOpen + 1, cClose).join('\n'),
    markupLines: lines
      .map((l, i) => ({ l, no: i + 1 }))
      .filter(o => (o.no - 1 < cOpen || o.no - 1 > cClose) && (o.no - 1 < sOpen || o.no - 1 > sClose)),
  };
}

const GLOBALS = new Set([
  'undefined', 'NaN', 'Infinity', 'globalThis', 'console', 'Math', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Date', 'RegExp', 'Error', 'TypeError',
  'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect', 'Function', 'Intl',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'escape', 'unescape', 'structuredClone', 'queueMicrotask',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Uint8Array', 'Uint8ClampedArray',
  'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array',
  'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Atomics', 'WeakRef', 'eval', 'import',
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'localStorage',
  'sessionStorage', 'indexedDB', 'IDBKeyRange', 'caches', 'crypto', 'performance',
  'alert', 'confirm', 'prompt', 'fetch', 'Headers', 'Request', 'Response', 'FormData',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FileList', 'AbortController',
  'AbortSignal', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
  'MessageChannel', 'BroadcastChannel', 'Notification', 'matchMedia', 'getComputedStyle',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'Event', 'CustomEvent',
  'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'TouchEvent', 'WheelEvent', 'DragEvent',
  'InputEvent', 'FocusEvent', 'ClipboardEvent', 'ProgressEvent', 'MessageEvent',
  'Image', 'Audio', 'AudioContext', 'webkitAudioContext', 'OffscreenCanvas',
  'ImageData', 'ImageBitmap', 'createImageBitmap', 'Path2D', 'DOMMatrix', 'DOMPoint',
  'DOMRect', 'DOMParser', 'XMLSerializer', 'TextEncoder', 'TextDecoder',
  'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLInputElement',
  'Element', 'Node', 'NodeList', 'HTMLCollection', 'DocumentFragment', 'ShadowRoot',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'PerformanceObserver',
  'ClipboardItem', 'ReadableStream', 'WritableStream', 'TransformStream',
  'devicePixelRatio', 'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight',
  'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'scrollTo', 'scrollBy',
  'atob', 'btoa', 'postMessage', 'print', 'focus', 'blur', 'getSelection', 'isSecureContext',
  'CSS', 'FontFace', 'speechSynthesis', 'visualViewport', 'open', 'close', 'self', 'top',
  'parent', 'name', 'supabase', 'createClient',
]);

/* keywords that can be followed by `(` without being a call target */
const CONTROL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'delete',
  'void', 'throw', 'do', 'else', 'yield', 'await', 'in', 'of', 'instanceof', 'case',
  'with', 'super', 'this', 'import', 'class', 'const', 'let', 'var', 'async',
]);

function analyse(page) {
  const r = lex(page.script);
  if (!r.ok) return { ok: false, why: r.why };

  const toks = r.tokens;
  const sig = toks.filter(t => t.t !== 'ws' && t.t !== 'comment');

  /* line number of an offset within the script, mapped to the file */
  const nl = [];
  for (let k = 0; k < page.script.length; k++) if (page.script[k] === '\n') nl.push(k);
  const lineOf = off => {
    let lo = 0, hi = nl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < off) lo = mid + 1; else hi = mid; }
    return lo + page.scriptFirstLine;
  };

  const idLookups = [];     // {id, line}
  const callTargets = [];   // {name, line}
  const declared = new Set();
  const emittedIds = new Set();

  for (let k = 0; k < sig.length; k++) {
    const tk = sig[k];

    /* ids written into the DOM from any string or template chunk */
    if (tk.t === 'string' || tk.t === 'template') harvestIds(tk.v, emittedIds);

    /* declarations: any ident following a binding keyword, plus function and
       class names. Deliberately generous - see the header note on limits. */
    if (tk.t === 'ident' && (tk.v === 'const' || tk.v === 'let' || tk.v === 'var' ||
                             tk.v === 'function' || tk.v === 'class')) {
      /* walk the following idents up to `=` or `;` or `(`, so destructuring
         patterns and multi-declarator statements are all collected */
      for (let j = k + 1; j < sig.length; j++) {
        const q = sig[j];
        if (q.t === 'ident') { declared.add(q.v); continue; }
        if (q.t === 'punct' && (q.v === '{' || q.v === '}' || q.v === '[' || q.v === ']' ||
                                q.v === ',' || q.v === ':')) continue;
        break;
      }
    }
    /* function parameters and arrow parameters: any ident inside a paren group
       that is followed by `=>` or preceded by `function`, plus catch(e) */
    if (tk.t === 'punct' && tk.v === '(') {
      const close = matchParen(sig, k);
      if (close > 0) {
        const after = sig[close + 1];
        const before = sig[k - 1];
        const isArrow = after && after.t === 'punct' && after.v === '=>';
        const isFnDecl = before && before.t === 'ident' &&
          (before.v === 'function' || before.v === 'catch' ||
           (sig[k - 2] && sig[k - 2].t === 'ident' && sig[k - 2].v === 'function'));
        if (isArrow || isFnDecl) {
          for (let j = k + 1; j < close; j++) if (sig[j].t === 'ident') declared.add(sig[j].v);
        }
      }
    }
    /* single-ident arrow param:  x => ...  */
    if (tk.t === 'punct' && tk.v === '=>' && k > 0 && sig[k - 1].t === 'ident') {
      declared.add(sig[k - 1].v);
    }
    /* object-literal method shorthand and class methods: name( ... ) {   */

    /* calls: ident immediately followed by `(`, not preceded by `.` or `?.` */
    if (tk.t === 'ident' && sig[k + 1] && sig[k + 1].t === 'punct' && sig[k + 1].v === '(') {
      const before = sig[k - 1];
      const isMember = before && before.t === 'punct' && (before.v === '.' || before.v === '?.');
      if (!isMember && !CONTROL.has(tk.v)) {
        callTargets.push({ name: tk.v, line: lineOf(tk.i) });

        /* id lookups: $('x') and getElementById('x') and querySelector('#x') */
        const arg = sig[k + 2];
        const closeTok = sig[k + 3];
        if (arg && arg.t === 'string' && closeTok && closeTok.t === 'punct' && closeTok.v === ')') {
          if (tk.v === '$') idLookups.push({ id: arg.v, line: lineOf(tk.i) });
        }
      }
      /* member-call forms */
      if (isMember) {
        const arg = sig[k + 2];
        const closeTok = sig[k + 3];
        if (arg && arg.t === 'string' && closeTok && closeTok.t === 'punct' && closeTok.v === ')') {
          if (tk.v === 'getElementById') idLookups.push({ id: arg.v, line: lineOf(tk.i) });
          if (tk.v === 'querySelector' || tk.v === 'querySelectorAll') {
            const s = arg.v.trim();
            if (/^#[A-Za-z_][\w-]*$/.test(s)) idLookups.push({ id: s.slice(1), line: lineOf(tk.i) });
          }
        }
      }
    }
  }

  return { ok: true, idLookups, callTargets, declared, emittedIds, tokenCount: sig.length };
}

function matchParen(sig, openIdx) {
  let d = 0;
  for (let j = openIdx; j < sig.length; j++) {
    const q = sig[j];
    if (q.t !== 'punct') continue;
    if (q.v === '(') d++;
    else if (q.v === ')') { d--; if (d === 0) return j; }
  }
  return -1;
}

/* id="x" / id='x' inside any string the script builds. A template hole
   (id="${...}") yields no literal and is deliberately not claimed. */
function harvestIds(text, into) {
  const re = /\bid\s*=\s*("([^"${}]*)"|'([^'${}]*)')/g;
  let m;
  while ((m = re.exec(text))) {
    const v = (m[2] !== undefined ? m[2] : m[3]).trim();
    if (v) into.add(v);
  }
}

/* ====================================================================== */
/* checks                                                                 */
/* ====================================================================== */

function check(file) {
  const page = readPage(file);
  const a = analyse(page);
  if (!a.ok) return { fatal: 'lexer could not read the script block: ' + a.why };

  const findings = [];
  const add = (kind, line, msg) => findings.push({ kind, line, msg });

  /* -- static ids, with duplicates ------------------------------------- */
  const staticIds = new Map();   // id -> [lines]
  {
    const re = /\bid\s*=\s*("([^"]*)"|'([^']*)')/g;
    for (const { l, no } of page.markupLines) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(l))) {
        const v = (m[2] !== undefined ? m[2] : m[3]).trim();
        if (!v) continue;
        if (!staticIds.has(v)) staticIds.set(v, []);
        staticIds.get(v).push(no);
      }
    }
  }
  for (const [id, lines] of staticIds) {
    if (lines.length > 1) {
      add('dupids', lines[1],
        'id `' + id + '` appears ' + lines.length + ' times in the markup (lines ' + lines.join(', ') +
        ') - getElementById returns the first, so the rest are unreachable by id');
    }
  }

  /* -- id lookups ------------------------------------------------------ */
  const known = new Set([...staticIds.keys(), ...a.emittedIds]);
  const missing = new Map();
  for (const l of a.idLookups) if (!known.has(l.id) && !missing.has(l.id)) missing.set(l.id, l.line);
  for (const [id, line] of [...missing].sort((x, y) => x[1] - y[1])) {
    add('ids', line, 'looks up element id `' + id + '`, which is in neither the markup nor any string the script writes');
  }

  /* -- call targets ---------------------------------------------------- */
  const unresolved = new Map();
  for (const c of a.callTargets) {
    if (a.declared.has(c.name) || GLOBALS.has(c.name)) continue;
    if (!unresolved.has(c.name)) unresolved.set(c.name, c.line);
  }
  for (const [name, line] of [...unresolved].sort((x, y) => x[1] - y[1])) {
    add('calls', line, 'calls `' + name + '()`, which is declared nowhere in this file and is not a known global');
  }

  /* -- css brace balance ----------------------------------------------- */
  {
    const stripped = page.css.replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0, bad = false;
    for (const ch of stripped) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < 0) { bad = true; break; } }
    }
    if (bad) add('css', 0, 'stylesheet has a `}` with no matching `{`');
    else if (depth !== 0) add('css', 0, 'stylesheet has ' + depth + ' unclosed `{` - a split rule silently kills every rule after it');
  }

  return {
    findings,
    stats: {
      tokens: a.tokenCount,
      declared: a.declared.size,
      calls: a.callTargets.length,
      idLookups: a.idLookups.length,
      staticIds: staticIds.size,
      emittedIds: a.emittedIds.size,
    },
  };
}

/* ====================================================================== */
/* report                                                                 */
/* ====================================================================== */

function main() {
  const file = process.argv[2] || path.join(__dirname, '..', 'index.html');

  const selfFails = selfTest();
  if (selfFails.length) {
    console.error('LEXER SELF-TEST FAILED - reporting nothing about the page.');
    console.error('A desynced lexer reports a clean page exactly as confidently as a real one.');
    for (const f of selfFails) console.error('  ' + f);
    process.exit(2);
  }

  let res;
  try { res = check(file); }
  catch (e) { console.error('CHECKER COULD NOT RUN: ' + e.message); process.exit(2); }
  if (res.fatal) { console.error('CHECKER COULD NOT RUN: ' + res.fatal); process.exit(2); }

  const s = res.stats;
  console.log('page-integrity  ' + path.basename(file));
  console.log('  lexer self-test passed (' + 10 + ' cases)');
  console.log('  ' + s.tokens + ' tokens · ' + s.declared + ' names declared · ' + s.calls + ' calls');
  console.log('  ' + s.idLookups + ' id lookups · ' + s.staticIds + ' static ids · ' + s.emittedIds + ' ids written by script');

  if (!res.findings.length) {
    console.log('\nCLEAN - no findings.');
    process.exit(0);
  }

  const byKind = {};
  for (const f of res.findings) (byKind[f.kind] ||= []).push(f);
  console.log('');
  for (const kind of Object.keys(byKind)) {
    console.log(kind.toUpperCase() + ' (' + byKind[kind].length + ')');
    for (const f of byKind[kind]) console.log('  line ' + f.line + ': ' + f.msg);
  }
  console.log('\n' + res.findings.length + ' finding(s).');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { check, lex, selfTest };
