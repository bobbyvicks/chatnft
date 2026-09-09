/* The suite stops opening sections, because there are none.

   openAllSections unfolded every `.side section`. With the column gone it
   would find nothing and quietly succeed at 71 call sites - a helper that
   does nothing while every caller reads as though it did something. That is
   the same shape as the guards patch358 deletes from the page, and it goes
   the same way rather than being left to rot.

   openSection is kept: it clicks a heading by name and throws when there is
   no such heading, which is honest. It simply has nothing left to open in
   the editor, so its two remaining callers stop calling it - the controls
   they were reaching for are in the strip and in the colours panel now.
*/
const fs = require('fs');
const path = require('path');
const REPO = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/';

const read = f => fs.readFileSync(REPO + f, 'utf8');
const write = (f, t) => fs.writeFileSync(REPO + f, t);

/* ---- 1. every call site of openAllSections ------------------------------ */
let calls = 0, files = 0;
for (const f of fs.readdirSync(REPO + 'tests').filter(x => x.endsWith('.spec.js'))) {
  let t = read('tests/' + f);
  if (t.indexOf('openAllSections') < 0) continue;
  const crlf = t.indexOf('\r\n') >= 0;
  const nl = s => (crlf ? s.replace(/\n/g, '\r\n') : s);

  /* The call, on its own line, with whatever indent it carries. */
  const before = t;
  t = t.replace(new RegExp('^[ \\t]*await openAllSections\\(page\\);[ \\t]*\\r?\\n', 'gm'), '');
  calls += (before.match(/await openAllSections\(page\)/g) || []).length
    - (t.match(/await openAllSections\(page\)/g) || []).length;

  /* And the import, which may be alone or in a list. */
  t = t.replace(/import \{([^}]*)\} from '\.\/helpers\.js';/, (m, names) => {
    const kept = names.split(',').map(s => s.trim()).filter(s => s && s !== 'openAllSections');
    return "import { " + kept.join(', ') + " } from './helpers.js';";
  });

  if (t.indexOf('openAllSections') >= 0)
    throw new Error(f + ' still mentions openAllSections: '
      + t.slice(t.indexOf('openAllSections') - 80, t.indexOf('openAllSections') + 40));
  write('tests/' + f, t);
  files++;
}
console.log('removed ' + calls + ' openAllSections calls across ' + files + ' files');
/* 71 the first time. Zero on a re-run is not a failure - it means the work
   is already done - but zero WITH call sites still present is, so the two are
   told apart rather than both waved through. */
if (calls === 0) {
  const left = fs.readdirSync(REPO + 'tests').filter(x => x.endsWith('.spec.js'))
    .filter(x => read('tests/' + x).indexOf('openAllSections') >= 0);
  if (left.length) throw new Error('nothing removed, but it survives in: ' + left.join(', '));
  console.log('(already removed on an earlier run)');
} else if (calls < 60) throw new Error('expected around 71 calls, removed ' + calls);

/* ---- 2. the helper itself ----------------------------------------------- */
{
  let t = read('tests/helpers.js');
  const a = t.indexOf('/** Open every folded section, for tests that need controls in more than one. */');
  if (a < 0) throw new Error('helpers: openAllSections is already gone');
  const b = t.indexOf('/** Press Resize.', a);
  if (b < 0) throw new Error('helpers: could not bound openAllSections');
  t = t.slice(0, a) + `/* openAllSections is gone with the side column. It unfolded every
   \`.side section\`, and there is no .side - so it would have found nothing
   and succeeded silently at every one of its 71 call sites. Its absence is
   recorded here rather than left as a deletion nobody can account for.
   openSection below still works and still throws on a name that is not
   there; it just has nothing in the editor left to open. */

` + t.slice(b);
  /* The EXPORT, not the word - the note that replaces it says the name out
     loud, and a check for the bare word matches its own explanation. */
  if (t.indexOf('export async function openAllSections') >= 0)
    throw new Error('helpers still exports it');
  write('tests/helpers.js', t);
  console.log('helpers.js: openAllSections retired');
}

/* ---- 3. the two tests that named a section ------------------------------ */
{
  const f = 'tests/panel.spec.js';
  let t = read(f);
  const nl = s => s.replace(/\n/g, '\r\n');
  const swap = (from, to) => {
    from = nl(from); to = nl(to);
    const n = t.split(from).length - 1;
    if (n !== 1) throw new Error(f + ': expected 1 of ' + from.slice(0, 50) + ' (found ' + n + ')');
    t = t.split(from).join(to);
  };
  swap(`    await openSection(page, 'Colour');
    await openPanel(page, 'cl');`,
  `    /* The brush rows are in the strip and always on screen; the palette is
       in the colours panel. Neither is behind a heading any more. */
    await openPanel(page, 'cl');`);
  swap(`    await openSection(page, 'Colour');
    for (const id of ['cl', 'sv']) await openPanel(page, id);`,
  `    for (const id of ['cl', 'sv']) await openPanel(page, id);`);
  t = t.replace(/import \{([^}]*)\} from '\.\/helpers\.js';/, (m, names) => {
    const kept = names.split(',').map(s => s.trim()).filter(s => s && s !== 'openSection');
    return "import { " + kept.join(', ') + " } from './helpers.js';";
  });
  if (t.indexOf('openSection') >= 0) throw new Error('panel.spec.js still calls openSection');
  write(f, t);
  console.log('panel.spec.js: no longer opens sections');
}
