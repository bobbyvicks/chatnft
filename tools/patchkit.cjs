/* Shared machinery for the patch scripts that edit index.html.

   Every change to index.html goes through a script that asserts what it
   assumes before it writes anything. That method has held up - it has refused
   to write far more often than it has written something wrong - but the
   assertions kept failing for three reasons that had nothing to do with the
   change being made. This exists to make those three impossible.

   ONE: AN ANCHOR THAT MATCHES TWICE. A patch finds its place by a line of
   source. The file has grown to nearly nine thousand lines and now holds two
   `moved++`, two `let moved=0;`, three `if(failed) bits.push(...)` across
   three import paths, and seven `await renderShelf();`. Four patches in one
   session refused to write for this, and the fix each time was to anchor on a
   NEIGHBOUR instead. `inFunction` and `near` make that the normal way to do
   it rather than the thing you fall back to after being refused.

   TWO: A MULTI-LINE MATCH AGAINST A CRLF FILE. index.html is CRLF throughout.
   A search for two lines joined with "\n" matches nothing, so the replace is
   a no-op, the script writes the file back unchanged and reports success -
   which reads as "the mutation did not change behaviour". That cost three
   attempts across one session, twice while mutation-testing, where a silent
   no-op looks exactly like a passing test. Nothing here joins lines to search
   them: every match is against the split array, and `run` takes predicates
   for its first and last line.

   THREE: A CHECK THAT SCANS PROSE. This file's comments quote the code they
   replaced - deliberately, because a comment that says what changed is worth
   having - so a check searching the source for the old text finds its own
   explanation and reports the code unchanged. That happened six times in one
   session. `code` strips comments by their delimiters. Filtering on line
   shape does not work here: continuations are written as plain indented
   sentences with no leading asterisk.

   Load it from a patch with:
     const kit = require('./pb-repo/tools/patchkit.cjs');
   and run this file directly to exercise its own tests.
*/
'use strict';
const fs = require('fs');

const CR = String.fromCharCode(13), NL = String.fromCharCode(10);

/* ---- reading and writing ---------------------------------------- */

function load(file) {
  const text = fs.readFileSync(file, 'utf8');
  const EOL = text.indexOf(CR + NL) >= 0 ? CR + NL : NL;
  return { file, EOL, lines: text.split(new RegExp(CR + '?' + NL)), original: text };
}

/* Everything between <script> and the last </script>. */
function scriptOf(text) {
  const m = text.match(/<script>\s*([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block found');
  return m[1];
}

/* Comments removed by their DELIMITERS, not by line shape. Continuations here
   are plain indented sentences, so any filter keyed on a leading asterisk
   leaves most of a comment behind and calls it code. */
function code(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const a = text.indexOf('/' + '*', i);
    if (a < 0) { out += text.slice(i); break; }
    out += text.slice(i, a);
    const b = text.indexOf('*' + '/', a + 2);
    if (b < 0) break;
    i = b + 2;
  }
  return out.split(NL).map(l => {
    const j = l.indexOf('//');
    return j >= 0 ? l.slice(0, j) : l;
  }).join(NL);
}

/* ---- finding a place -------------------------------------------- */

/* The line range of a function, from its exact signature line to the closing
   brace at the same indentation. Used to scope every other search, which is
   what stops an anchor matching a line in some other function. */
function inFunction(lines, signature) {
  const starts = lines.map((l, i) => (l === signature ? i : -1)).filter(i => i >= 0);
  if (starts.length !== 1)
    throw new Error('function signature "' + signature + '": found ' + starts.length + ', need exactly 1');
  const start = starts[0];
  const indent = signature.match(/^\s*/)[0];
  const close = indent + '}';
  for (let i = start + 1; i < lines.length; i++) if (lines[i] === close) return { start, end: i };
  throw new Error('function "' + signature + '" does not close at its own indentation');
}

/* Exactly one line, optionally inside a range. Refuses on 0 or 2+ and says
   how many it saw, because "found 3" is the message that tells you to scope. */
function only(lines, pred, label, range) {
  const lo = range ? range.start : 0, hi = range ? range.end : lines.length - 1;
  const hits = [];
  for (let i = lo; i <= hi; i++) if (pred(lines[i], i)) hits.push(i);
  if (hits.length !== 1)
    throw new Error(label + ': found ' + hits.length + ' in ' + (range ? 'the given range' : 'the file')
      + ', need exactly 1' + (hits.length > 1 ? ' (lines ' + hits.map(i => i + 1).join(', ') + ')' : ''));
  return hits[0];
}

/* One line identified by a NEIGHBOUR. The normal way to anchor a line that
   appears more than once - `offset` is where the neighbour sits relative to
   it, so -1 means the line above and +1 the line below. */
function near(lines, exact, offset, neighbour, label) {
  return only(lines, (l, i) => {
    if (l !== exact) return false;
    const n = lines[i + offset];
    return typeof n === 'string' && (typeof neighbour === 'string' ? n.indexOf(neighbour) >= 0 : neighbour(n));
  }, label || ('the line "' + exact.trim().slice(0, 40) + '"'));
}

/* A run of lines, found by its first and last, never by joining them. A
   multi-line search against this CRLF file matches nothing and writes it back
   unchanged, which reads as success. */
function run(lines, firstPred, lastPred, label, range) {
  const start = only(lines, firstPred, label + ' (start)', range);
  for (let i = start; i < lines.length && i < start + 400; i++) {
    if (i > start && lastPred(lines[i], i)) return { start, end: i };
  }
  throw new Error(label + ': no end found within 400 lines of its start');
}

/* ---- writing, with the checks that make it safe ------------------ */

/* Replaces a run and returns how the line count moved, so a caller working
   with several ranges can see that it must recompute them. */
function replace(lines, range, newLines) {
  lines.splice(range.start, range.end - range.start + 1, ...newLines);
  return newLines.length - (range.end - range.start + 1);
}

/* Writes only if the result still parses. `checks` runs against the joined
   text, the script body, and the script with comments stripped - so a check
   can look at code without finding its own explanation. */
function save(doc, checks) {
  const out = doc.lines.join(doc.EOL);
  const script = scriptOf(out);
  // eslint-disable-next-line no-new-func
  new Function(script);
  if (typeof checks === 'function') checks({ text: out, script, code: code(script) });
  fs.writeFileSync(doc.file, out);
  return out.length - doc.original.length;
}

module.exports = { load, scriptOf, code, inFunction, only, near, run, replace, save };

/* ---- its own tests ---------------------------------------------- */
/* Run this file directly. A tool that finds mistakes has to be able to show
   it finds them, so each case here is one the real patches actually hit. */
if (require.main === module) {
  const ok = [];
  const check = (name, fn) => {
    try { fn(); ok.push(name); }
    catch (e) { console.error('FAIL  ' + name + ': ' + e.message); process.exitCode = 1; }
  };
  const throws = (fn, why) => {
    let threw = false;
    try { fn(); } catch (_) { threw = true; }
    if (!threw) throw new Error('expected a refusal: ' + why);
  };

  const sample = [
    'function alpha(){',
    '  let moved=0;',
    '  moved++;',
    '}',
    'function beta(){',
    '  let moved=0;',
    '  /* moved++ is what the old version did here, and it was wrong. */',
    '  moved++;',
    '}',
  ];

  check('a duplicated line is refused, not guessed at', () => {
    throws(() => only(sample, l => l === '  moved++;', 'the counter'),
      'two functions both increment');
  });

  check('scoping to a function makes it unique', () => {
    const r = inFunction(sample, 'function beta(){');
    const at = only(sample, l => l === '  moved++;', 'the counter', r);
    if (at !== 7) throw new Error('expected line 8, got ' + (at + 1));
  });

  check('a neighbour disambiguates without scoping', () => {
    const at = near(sample, '  moved++;', -1, 'the old version did here', 'the counter');
    if (at !== 7) throw new Error('expected line 8, got ' + (at + 1));
  });

  check('inFunction refuses a signature that appears twice', () => {
    throws(() => inFunction(sample.concat(['function beta(){', '}']), 'function beta(){'),
      'two functions share a signature');
  });

  check('comments are stripped by delimiter, not by line shape', () => {
    const src = [
      '/* This mentions oldName deliberately, and',
      '   this continuation line has no asterisk. */',
      'const x = newName;',
      'const y = 1; // oldName here too',
    ].join(NL);
    const c = code(src);
    if (c.indexOf('oldName') >= 0) throw new Error('a comment survived the strip');
    if (c.indexOf('newName') < 0) throw new Error('the code did not survive the strip');
  });

  check('a run is found by its ends, never by joining lines', () => {
    const r = run(sample, l => l === 'function beta(){', l => l === '}', 'beta');
    if (r.start !== 4 || r.end !== 8) throw new Error('got ' + r.start + '..' + r.end);
  });

  check('replace reports how far the file moved', () => {
    const lines = sample.slice();
    const r = inFunction(lines, 'function alpha(){');
    const delta = replace(lines, r, ['function alpha(){', '}']);
    if (delta !== -2) throw new Error('expected -2, got ' + delta);
    if (lines[2] !== 'function beta(){') throw new Error('the splice landed wrong');
  });

  check('a CRLF file round-trips without a stray carriage return', () => {
    const tmp = require('path').join(require('os').tmpdir(), 'patchkit-crlf-test.txt');
    fs.writeFileSync(tmp, ['a', 'b', 'c'].join(CR + NL));
    const doc = load(tmp);
    if (doc.EOL !== CR + NL) throw new Error('CRLF was not detected');
    if (doc.lines.length !== 3) throw new Error('split kept a carriage return: ' + JSON.stringify(doc.lines));
    fs.unlinkSync(tmp);
  });

  console.log(ok.length + ' checks passed:');
  for (const n of ok) console.log('  ' + n);
}
