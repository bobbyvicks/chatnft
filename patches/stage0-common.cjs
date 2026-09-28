/* Shared by the stage-0 patches, patch600 to patch606 (auto cloud save
   design, D1). Each swaps exact-one anchors in index.html, checks what it
   assumes first and writes last, the patchkit way (tools/patchkit.cjs,
   patch596, patch598). This adds the two checks every one of them makes:
   the page's script still parses, and tools/page-integrity.cjs finds
   nothing it did not find before (the way patch367 does it).

   PB_REPO names the clone (default: the one these were written in) and
   PB_INDEX the file, as in patch596 onwards. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = process.env.PB_REPO
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo';
const kit = require(path.join(REPO, 'tools', 'patchkit.cjs'));
const FILE = process.env.PB_INDEX || path.join(REPO, 'index.html');
const NL = '\r\n';

function integrity(before, after) {
  const tool = path.join(REPO, 'tools', 'page-integrity.cjs');
  if (!fs.existsSync(tool)) throw new Error('page-integrity not found at ' + tool + ' - refusing to write unchecked');
  const tmpA = FILE + '.s0-before.tmp', tmpB = FILE + '.s0-after.tmp';
  fs.writeFileSync(tmpA, before); fs.writeFileSync(tmpB, after);
  const run = f => spawnSync(process.execPath, [tool, f], { encoding: 'utf8' });
  let a, b;
  try { a = run(tmpA); b = run(tmpB); } finally { fs.unlinkSync(tmpA); fs.unlinkSync(tmpB); }
  if (a.status === 2 || b.status === 2) throw new Error('page-integrity could not run: ' + (a.stderr || b.stderr));
  const findings = r => (r.stdout + r.stderr).split(/\r?\n/).filter(l => /^\s+line \d+:/.test(l))
    .map(l => l.replace(/^\s+line \d+:\s*/, ''));
  const had = new Set(findings(a));
  const fresh = findings(b).filter(l => !had.has(l));
  if (fresh.length) throw new Error('page-integrity has new findings:\n  ' + fresh.join('\n  '));
  console.log('page-integrity: ' + findings(a).length + ' pre-existing finding(s), 0 new');
}

function start(needs) {
  let text = fs.readFileSync(FILE, 'utf8');
  const before = text;
  if (text.indexOf(NL) < 0) throw new Error('index.html is not CRLF - every multi-line anchor would miss');
  for (const [marker, why] of needs || []) if (text.indexOf(marker) < 0) throw new Error(why);
  const join = x => (Array.isArray(x) ? x.join(NL) : x);
  return {
    swap(from, to) {
      from = join(from); to = join(to);
      const n = text.split(from).length - 1;
      if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 90) + ' (found ' + n + ')');
      if (from === to) throw new Error('the swap changes nothing');
      text = text.split(from).join(to);
    },
    finish(checks) {
      if (text === before) throw new Error('nothing changed');
      const script = kit.scriptOf(text);
      // eslint-disable-next-line no-new-func
      new Function(script);
      const code = kit.code(script);
      const must = (s, why) => { if (code.indexOf(s) < 0) throw new Error(why + ' - missing: ' + s); };
      if (checks) checks({ text, script, code, must });
      integrity(before, text);
      fs.writeFileSync(FILE, text);
      console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
    },
  };
}

module.exports = { start, NL, REPO, FILE };
