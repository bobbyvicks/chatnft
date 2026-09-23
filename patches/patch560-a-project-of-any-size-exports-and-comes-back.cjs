/* A PROJECT OF ANY SIZE EXPORTS, AND COMES BACK.

   Found 2026-09-22 by the discovery pass, ranked thirty-third of 39.
   Export project put every picture into one JSON string - JSON.stringify of
   the whole project - and a JavaScript string cannot pass 2^29-24
   characters. Past about 384 MiB of pictures that threw, nothing caught it,
   and the press did nothing: no file and no word, so the person believed
   they had a backup. Measured by the verifier one picture either side: 23 x
   16 MiB exported, 24 did not. Import read the file with file.text(), which
   for a file past the same size resolves to an EMPTY string in this
   Chromium, so the same backup, had it been written, would have imported as
   "That is not a project file". The real collection is 69 MB; this is about
   the day it is not.

   The file is now written in parts - the settings, then each item as its
   own string - so no one string holds the project. The bytes are the ones
   JSON.stringify of the whole project gives: same keys, same order.

   And read the same way when it is too big for one string: the settings
   first, then each item on its own, scanned out of the text as it streams
   in. A file that fits is read as it always was.

   A failure either way is said: the export toasts what went wrong. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);

{
  const fn = kit.inFunction(L, 'async function exportProject(){');
  const i = at('    items:out};', 'the document end', fn);
  const want = [
    '    items:out};',
    '  const b=new Blob([JSON.stringify(doc)],{type:"application/json"});',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the export moved at +' + k);
  kit.replace(L, { start: i, end: i + 1 }, [
    '    items:null};',
    '  /* IN PARTS. JSON.stringify of the whole project was one string, and a',
    '     string cannot pass 2^29-24 characters: past about 384 MiB of pictures',
    '     it threw and the press did nothing. The settings, then each item as',
    '     its own string - the same bytes, since items is the last key. */',
    '  let b=null;',
    '  try{',
    '    const head=JSON.stringify(doc);',
    '    const cut=head.lastIndexOf(\'"items":null}\');',
    '    if(cut<0) throw new Error("the project header is not what was written");',
    '    const parts=[head.slice(0,cut)+\'"items":[\'];',
    '    for(let i=0;i<out.length;i++){ if(i) parts.push(","); parts.push(JSON.stringify(out[i])); }',
    '    parts.push("]}");',
    '    b=new Blob(parts,{type:"application/json"});',
    '  }catch(e){',
    '    toast("Could not write the project file: "+((e&&e.message)||"it is too large for this browser"));',
    '    return;',
    '  }',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function importProject(file){');
  const i = at('  try{ doc=JSON.parse(await file.text()); }', 'the import read', fn);
  kit.replace(L, { start: i, end: i }, [
    '  try{ doc=await readProjectFile(file); }',
  ]);
  const f = kit.inFunction(L, 'async function importProject(file){');
  kit.replace(L, { start: f.start, end: f.start }, [
    '/* A PROJECT FILE, READ. One that fits in a string is parsed as it always',
    '   was. One that does not - file.text() resolves to an EMPTY string past',
    '   2^29-24 characters here, which read as "That is not a project file" -',
    '   is read in pieces: everything before the items, then each item scanned',
    '   out on its own. Items is the last key, as exportProject writes it; a',
    '   file shaped otherwise that is this large is not one this page wrote. */',
    'let PROJECT_TEXT_MAX=400*1024*1024;',
    'async function readProjectFile(file){',
    '  if(file.size<=PROJECT_TEXT_MAX) return JSON.parse(await file.text());',
    '  const reader=file.stream().getReader();',
    '  const dec=new TextDecoder();',
    '  let buf="", doc=null, items=null, pos=0, done=false;',
    '  const more=async()=>{',
    '    const r=await reader.read();',
    '    if(r.done){ buf+=dec.decode(); done=true; return false; }',
    '    buf+=dec.decode(r.value,{stream:true});',
    '    return true;',
    '  };',
    '  /* Everything up to the items. A raw "items":[ cannot sit inside a JSON',
    '     string - its quotes would be escaped there - and no earlier key holds',
    '     an object with an items key. */',
    '  let at=-1;',
    '  while((at=buf.indexOf(\'"items":[\'))<0){ if(!await more()) throw new Error("no items"); }',
    '  doc=JSON.parse(buf.slice(0,at)+\'"items":[]}\');',
    '  items=doc.items;',
    '  buf=buf.slice(at+9); pos=0;',
    '  /* Then one object at a time, by depth, outside strings. */',
    '  for(;;){',
    '    while(pos<buf.length && (buf[pos]===","||buf[pos]===" "||buf[pos]==="\\n"||buf[pos]==="\\r"||buf[pos]==="\\t")) pos++;',
    '    if(pos>=buf.length){ if(!await more()) throw new Error("the file ends inside the items"); continue; }',
    '    if(buf[pos]==="]") return doc;',
    '    if(buf[pos]!=="{") throw new Error("not a project item");',
    '    let depth=0, inStr=false, esc=false, end=-1, k=pos;',
    '    for(;;){',
    '      for(;k<buf.length;k++){',
    '        const ch=buf[k];',
    '        if(inStr){ if(esc) esc=false; else if(ch==="\\\\") esc=true; else if(ch===\'"\') inStr=false; continue; }',
    '        if(ch===\'"\') inStr=true;',
    '        else if(ch==="{") depth++;',
    '        else if(ch==="}"){ depth--; if(!depth){ end=k; break; } }',
    '      }',
    '      if(end>=0) break;',
    '      if(!await more()) throw new Error("the file ends inside an item");',
    '    }',
    '    items.push(JSON.parse(buf.slice(pos,end+1)));',
    '    buf=buf.slice(end+1); pos=0;',
    '  }',
    '}',
    'async function importProject(file){',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('new Blob([JSON.stringify(doc)]')) throw new Error('the one-string export is still there');
  if (times('readProjectFile(file)') !== 2) throw new Error('readProjectFile');
});

fs.renameSync(TMP, FILE);
console.log('patch560 written, ' + grew + ' bytes');
