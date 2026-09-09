/* The machinery the patch scripts use to find their place in index.html.

   Every change to index.html goes through a script that asserts what it
   assumes before writing. The method holds up, but the assertions kept failing
   for three reasons that had nothing to do with the change being made, and
   each one cost real time more than once:

     an anchor that matches twice, because the file now has two `let moved=0;`,
       three "could not be read" lines across three import paths, and seven
       `await renderShelf();`
     a multi-line match against a CRLF file, which matches nothing, writes the
       file back unchanged, and reads as success - worst while mutation
       testing, where a silent no-op looks exactly like a surviving mutant
     a check that scans prose, because the comments here quote the code they
       replaced, so a search for the old text finds its own explanation

   tools/patchkit.cjs exists to make all three impossible. These run it against
   the REAL index.html rather than a fixture, because the thing being tested is
   whether it can navigate this file as it actually is - a fixture would only
   prove it navigates a fixture.
*/
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const kit = createRequire(import.meta.url)(join(root, 'tools', 'patchkit.cjs'));
const INDEX = join(root, 'index.html');

/* Lines known to appear more than once. If one of these ever becomes unique
   the test says so rather than quietly passing on a weaker premise - the point
   is that the kit refuses AMBIGUITY, and a line that is no longer ambiguous
   cannot demonstrate it. */
const DUPLICATED = ['  let moved=0;', '  await renderShelf();'];

test.describe('the patch machinery', () => {
  test('a line that appears more than once is refused, not guessed at', () => {
    const doc = kit.load(INDEX);
    for (const line of DUPLICATED) {
      const n = doc.lines.filter(l => l === line).length;
      expect(n, line.trim() + ' is supposed to be ambiguous in this file').toBeGreaterThan(1);
      expect(() => kit.only(doc.lines, l => l === line, 'x'))
        .toThrow(/found \d+/);
    }
  });

  test('scoping to a function makes the same line unique', () => {
    const doc = kit.load(INDEX);
    const sig = doc.lines.find(l => l.indexOf('function bulkImport') >= 0);
    expect(sig, 'bulkImport is still in the file').toBeTruthy();
    const range = kit.inFunction(doc.lines, sig);
    expect(range.end, 'the range must close after it opens').toBeGreaterThan(range.start);
    for (const line of DUPLICATED) {
      const at = kit.only(doc.lines, l => l === line, line, range);
      expect(at, line.trim() + ' must fall inside bulkImport').toBeGreaterThanOrEqual(range.start);
      expect(at).toBeLessThanOrEqual(range.end);
    }
  });

  test('a neighbour anchor and a function scope agree on the same line', () => {
    // Two independent ways of finding one line. Agreement is worth more than
    // either alone: it is the check that neither is quietly finding something
    // else that happens to look right.
    const doc = kit.load(INDEX);
    const sig = doc.lines.find(l => l.indexOf('function bulkImport') >= 0);
    const byScope = kit.only(doc.lines, l => l === '  await renderShelf();',
      'the import render', kit.inFunction(doc.lines, sig));
    const byNeighbour = kit.near(doc.lines, '  await renderShelf();', 1,
      'Report what was GUESSED', 'the import render');
    expect(byNeighbour).toBe(byScope);
  });

  test('a function signature that appears twice is refused', () => {
    // Otherwise scoping would silently pick the first one and every anchor
    // inside it would land in the wrong function.
    const lines = ['function f(){', '}', 'function f(){', '}'];
    expect(() => kit.inFunction(lines, 'function f(){')).toThrow(/found 2/);
  });

  test('comments are stripped by delimiter, so a check cannot read its own prose', () => {
    const doc = kit.load(INDEX);
    const script = kit.scriptOf(doc.original);
    const stripped = kit.code(script);
    expect(stripped.length, 'stripping must actually remove something').toBeLessThan(script.length);

    // The real case: this file's comments quote the code they replaced, so a
    // search of the raw script finds the prose and reports the old code alive.
    //
    // My first choice of string here was wrong and this test caught it. I picked
    // one I assumed was comment-only and it is still LIVE elsewhere - the compose
    // randomiser, deliberately left on Math.random. Assuming what a 9,000-line
    // file contains is the very mistake the kit exists to prevent, so these two
    // were checked rather than guessed.
    //
    // And the second of those two, 'const fold = i>1', went red a second time
    // for the opposite reason: the comment quoting it was deleted with
    // foldDefaults when the side column went, so the prose was not there to be
    // found. A literal from the file's comments is a fixture that perishes with
    // the comment. So one hand-checked literal is kept for the REAL case - a
    // comment quoting code that was replaced - and the second sample is taken
    // from the file at run time: the first long block comment in the script,
    // whatever it says today.
    const sample = (() => {
      const m = /\/\*([^*]|\*(?!\/)){200,}?\*\//.exec(script);
      if (!m) throw new Error('no block comment of 200+ characters in the script');
      // A run of it from well inside, so neither delimiter is in the sample.
      return m[0].slice(60, 100);
    })();
    for (const quoted of ['nw%W===0 && nh%H===0', sample]) {
      expect(script, quoted + ' is quoted in a comment').toContain(quoted);
      expect(stripped, quoted + ' is not code any more').not.toContain(quoted);
    }
    // And the line that replaced the first survives, so this is not passing
    // merely because the strip removed everything.
    expect(stripped, 'the live enlargement guard is code').toContain('if(nw>=W && nh>=H){');
  });

  test('the file is CRLF and splitting leaves no carriage returns behind', () => {
    // A multi-line match built with "\n" finds nothing here, so the replace is
    // a no-op and the script writes the file back unchanged - reading as
    // success. Nothing in the kit joins lines to search them.
    const raw = readFileSync(INDEX, 'utf8');
    expect(raw.indexOf('\r\n'), 'index.html is CRLF').toBeGreaterThan(-1);
    const doc = kit.load(INDEX);
    expect(doc.EOL).toBe('\r\n');
    expect(doc.lines.some(l => l.indexOf('\r') >= 0), 'no line keeps a carriage return').toBe(false);
    expect(doc.lines.join(doc.EOL), 'and it round-trips exactly').toBe(raw);
  });

  test('stripped code splits without carrying carriage returns', () => {
    // A patch check hit this the first time the kit was used for real. code()
    // preserves the EOL it was given, so splitting its result on LF alone
    // leaves a CR on the end of every line and an exact-match lookup finds
    // nothing - which reads as "that function is gone", not as "I split it
    // wrong". It refused to write, which was right, and for the wrong reason.
    const doc = kit.load(INDEX);
    const stripped = kit.code(kit.scriptOf(doc.original));
    const naive = stripped.split(String.fromCharCode(10));
    const proper = kit.lines(stripped);

    const sig = 'async function buildCollection(n,onProgress){';
    expect(naive.indexOf(sig), 'splitting on LF alone cannot find it').toBe(-1);
    expect(proper.indexOf(sig), 'kit.lines finds it exactly').toBeGreaterThan(0);
    expect(proper.some(l => l.indexOf(String.fromCharCode(13)) >= 0),
      'and leaves no carriage return behind').toBe(false);
  });

  test('a run is found by its two ends', () => {
    const doc = kit.load(INDEX);
    const sig = doc.lines.find(l => l.indexOf('function bulkImport') >= 0);
    const r = kit.run(doc.lines, l => l === sig, l => l === '}', 'bulkImport');
    const scoped = kit.inFunction(doc.lines, sig);
    expect(r.start).toBe(scoped.start);
    expect(r.end).toBe(scoped.end);
  });

  test('and the runaway guard has room above the longest function here', () => {
    /* THIS IS THE TEST ABOVE, FAILING EARLIER AND SAYING WHY.

       run() stops scanning after a fixed number of lines so that a wrong
       end-predicate cannot walk to the bottom of a 13,000-line file and report
       whatever it hits. That number was 400, and bulkImport grew to 469 - so a
       function whose end is perfectly findable started failing with "no end
       found", which reads as a broken predicate rather than a cap set too low.

       Measuring the real longest function turns the next occurrence into a
       sentence somebody can act on. The guard is meant to be loose: it catches
       a scan that has clearly gone wrong, not a big function. */
    const doc = kit.load(INDEX);
    let longest = 0, worst = '';
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i];
      if (!/^(async )?function [A-Za-z_$]/.test(l)) continue;
      let depth = 0;
      for (let j = i; j < doc.lines.length && j < i + 4000; j++) {
        for (const ch of doc.lines[j]) {
          if (ch === '{') depth++; else if (ch === '}') depth--;
        }
        if (j > i && depth <= 0) {
          if (j - i + 1 > longest) { longest = j - i + 1; worst = l.trim().slice(0, 48); }
          break;
        }
      }
    }
    expect(longest, 'something was measured').toBeGreaterThan(50);
    expect(kit.RUN_MAX_LINES,
      'the guard must clear the longest function (' + worst + ' at ' + longest + ' lines)')
      .toBeGreaterThan(longest);
  });
});
