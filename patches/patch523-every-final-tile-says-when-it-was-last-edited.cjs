/* EVERY FINAL TILE SAYS WHEN IT WAS LAST EDITED.

   Asked for 2026-09-21: "can i see on each trait a (last edited) overlay on
   the trait".

   A strip along the bottom of the picture: "edited 3 hours ago", "edited
   yesterday", with the exact time on hover. It reads the record's `at`,
   which every save writes and which the Last edited list on the home page
   already orders by, in the words that list uses (agoWords) - so the page
   has one idea of "last edited". A record with no `at` carries no strip
   rather than one saying 1970. Filing a trait into or out of the final
   project is not editing it; setTraitStatus leaves `at` alone and the tile
   keeps saying what it said.

   AND THE FIELD IS MADE TRUE FOR A TRAIT THAT CAME DOWN FROM THE GROUP. The
   puller wrote at:Date.now() - the moment of the download - so on any
   project anybody else has touched, which is every group project on every
   second device, the strip would have said "edited just now" about a trait
   drawn a month ago. The Last edited list has been saying the same since
   it was written. The server row carries updated_at, maintained by a
   database trigger on every save by anyone, and the puller writes that as
   `at` now, falling back to the download time only for a row without one.
   The shelf's fallback order for traits without a shelf order - newest `at`
   first - follows the same field, and so now follows when the trait was
   saved rather than which of eight parallel downloads finished first. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. the strip on the tile ------------------------------------------ */
{
  const fn = kit.inFunction(L, 'function finalTile(t,label,note,press){');
  swap('  el.appendChild(shelfTile(t,finalWatch));', [
    '  {',
    '    /* WHEN IT WAS LAST EDITED, over the bottom of the picture. The record\'s',
    '       `at`, in the words the Last edited list uses, so the page has one',
    '       idea of it. Nothing at all for a record with no `at` - not 1970. */',
    '    const art=document.createElement("div"); art.className="fsart";',
    '    art.appendChild(shelfTile(t,finalWatch));',
    '    const when=agoWords(t.at);',
    '    if(when){',
    '      const s=document.createElement("span"); s.className="fswhen";',
    '      s.textContent="edited "+when;',
    '      s.title="Last edited "+new Date(t.at).toLocaleString();',
    '      art.appendChild(s);',
    '    }',
    '    el.appendChild(art);',
    '  }',
  ], 'the tile picture', fn);
}
swap('#finalset .fsnote{font-size:10px; color:var(--muted); opacity:.8;}', [
  '#finalset .fsnote{font-size:10px; color:var(--muted); opacity:.8;}',
  '/* WHEN IT WAS LAST EDITED: a strip over the bottom of the picture, in the',
  '   dark the pick tick uses, taking no clicks - the tile is the control. */',
  '#finalset .item .fsart{position:relative;}',
  '#finalset .item .fswhen{position:absolute; left:0; right:0; bottom:0; padding:3px 4px;',
  '  font-size:10px; line-height:1.2; color:var(--ink); background:#0b0910cc;',
  '  border-radius:0 0 5px 5px; pointer-events:none; white-space:nowrap;',
  '  overflow:hidden; text-overflow:ellipsis; text-align:center;}',
], 'the strip style');

/* ---- 2. a pulled trait was edited when the group last saved it ---------- */
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  swap('          blob:blob, at:Date.now(), synced:true};', [
    '          /* `at` IS WHEN IT WAS LAST SAVED, BY ANYONE - the row\'s updated_at,',
    '             which a database trigger maintains - and not the moment it was',
    '             downloaded here. The Last edited list and the final page\'s',
    '             "edited ..." strip read it as the former; a download is not an',
    '             edit. The download time only for a row without a stamp. */',
    '          blob:blob, at:(Date.parse(w.row.updated_at||"")||Date.now()), synced:true};',
  ], 'the pulled record', fn);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code, text }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('s.textContent="edited "+when;');
  once('s.className="fswhen";');
  once('const when=agoWords(t.at);');
  once('at:(Date.parse(w.row.updated_at||"")||Date.now())');
  once('art.appendChild(shelfTile(t,finalWatch));');
  if (text.indexOf('#finalset .item .fswhen{') < 0) throw new Error('strip style missing');
  /* The strip is inside the tile, under the picture, before the name. */
  const a = code.indexOf('function finalTile(t,label,note,press){');
  const pic = code.indexOf('art.appendChild(shelfTile(t,finalWatch));', a);
  const nm = code.indexOf('const nm=document.createElement("b");', a);
  if (!(pic > a && nm > pic)) throw new Error('the strip is not where the picture is');
  /* Nothing else in the puller changed: the record still carries rowAt from the row. */
  const p = code.indexOf('const rec={id:w.id, rowId:w.row.id, path:w.row.path, rowAt:w.row.updated_at||null,');
  if (p < 0) throw new Error('the pulled record head moved');
});

fs.renameSync(TMP, FILE);
console.log('patch523 written, ' + grew + ' bytes');
