/* ASKING CLAUDE HAS A DEADLINE, A SIZE, AND THE PROJECT'S OWN LAYERS.

   Found 2026-09-22 by the discovery pass, ranked twenty-fourth to
   twenty-seventh of 39 - four findings on the one path behind "No
   reference? Let Claude find it". This is the page half; api/identify.ts
   changes in the same commit.

   THE LAYERS. The server could answer only the fourteen default layer
   names, and the page assigned whatever came back to its layer picker
   without asking whether the project had it. A project that renamed hats
   to headwear got "hats", the picker went blank, the toast said "Found",
   and Save filed the trait as unsorted. The page now sends its live layer
   list and the server builds its answer from it; and an answer naming a
   layer the project does not have is said, not assigned.

   THE SIZE. The whole submission was re-encoded and posted as base64, and
   a body over the platform's 4.5 MB limit is refused before the function
   runs, with a reply that is not JSON - which the page showed as the word
   "bad_json". The real R Place Mosaic is 5,781,894 bytes of body. The
   picture is now halved until it fits in ASK_MAX_CHARS; the box Claude
   answers with is in fractions of the picture, so it lands on the full one
   unchanged.

   THE DEADLINE. Nothing bounded the wait: a stalled answer held the button
   on "Looking..." until the platform killed the function, then said
   "bad_json". The request is abandoned after ASK_DEADLINE_MS with a
   sentence that says so, and the server finishes its own work inside it.

   AND WHAT A REPLY THAT IS NOT JSON MEANS: too big, timed out, or the
   server failed, said by its status instead of "bad_json". */
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
  const fn = kit.inFunction(L, 'async function ask(mode,dataUrl){');
  const want = [
    'async function ask(mode,dataUrl){',
    '  /* The endpoint refuses an unsigned call now - it spends real credit, so it',
    '     checks who is asking rather than trusting that the page put a wall up. */',
    '  const t=await sbToken();',
    "  if(!t){ aiReady=true; throw new Error('Sign in to use this.'); }",
    "  const r=await fetch('/api/identify',{",
    "    method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},",
    '    body:JSON.stringify({mode,image:dataUrl}),',
    '  });',
    "  const j=await r.json().catch(()=>({error:'bad_json'}));",
    "  if(!r.ok){ aiReady = j.error!=='not_configured'; throw new Error(j.message||j.error||'failed'); }",
    '  aiReady=true;',
    '  return j;',
    '}',
  ];
  if (fn.end - fn.start + 1 !== want.length) throw new Error('ask changed length');
  for (let k = 0; k < want.length; k++) if (L[fn.start + k] !== want[k]) throw new Error('ask moved at +' + k + ': ' + L[fn.start + k]);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* A MINUTE, then the request is abandoned and the button comes back.',
    '   Nothing bounded this: a stalled answer held "Looking..." until the',
    '   platform killed the function. The server gives up on its own calls',
    '   inside this. A let, so a test can shorten it. */',
    'let ASK_DEADLINE_MS=60000;',
    '/* Base64 characters of picture a request may carry. The platform refuses',
    '   a body over 4.5 MB before the function runs; this leaves room for the',
    '   rest of the body and for how the limit is counted. */',
    'const ASK_MAX_CHARS=4000000;',
    '/* A reply that is not JSON never came from the function - the platform',
    '   answered instead - so its status is all there is to say. */',
    'function askStatusSaid(s){',
    "  if(s===413) return 'The picture was too big for the server to take.';",
    "  if(s===504) return 'Claude took too long and the server gave up - try again.';",
    "  if(s>=500) return 'The server failed ('+s+') - try again.';",
    "  return 'The server sent back something unreadable ('+s+').';",
    '}',
    'async function ask(mode,dataUrl){',
    '  /* The endpoint refuses an unsigned call now - it spends real credit, so it',
    '     checks who is asking rather than trusting that the page put a wall up. */',
    '  const t=await sbToken();',
    "  if(!t){ aiReady=true; throw new Error('Sign in to use this.'); }",
    '  const ctl=new AbortController();',
    '  const timer=setTimeout(()=>ctl.abort(),ASK_DEADLINE_MS);',
    '  try{',
    "    const r=await fetch('/api/identify',{",
    "      method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},",
    '      /* The project\'s own layers: the server answers from these, so a',
    '         renamed or added layer is one it can name. */',
    '      body:JSON.stringify({mode,image:dataUrl,layers:LAYERS.slice()}),',
    '      signal:ctl.signal,',
    '    });',
    '    let j=null;',
    '    try{ j=await r.json(); }catch(_){ j=null; }',
    '    if(!j||typeof j!=="object") throw new Error(askStatusSaid(r.status));',
    "    if(!r.ok){ aiReady = j.error!=='not_configured'; throw new Error(j.message||j.error||'failed'); }",
    '    aiReady=true;',
    '    return j;',
    '  }catch(e){',
    "    if(ctl.signal.aborted) throw new Error('Claude did not answer within a minute - try again.');",
    '    throw e;',
    '  }finally{ clearTimeout(timer); }',
    '}',
  ]);
}
{
  const fn = kit.inFunction(L, "$('locateai').onclick=async()=>{");
  const i = at("    const j=await ask('locate',c.toDataURL('image/png'));", 'the locate ask', fn);
  kit.replace(L, { start: i, end: i }, [
    '    /* HALVED UNTIL IT FITS. The whole picture used to go as it was, and',
    '       one over the platform\'s limit came back as "bad_json". The box is',
    '       answered in fractions, so it lands on the full picture unchanged. */',
    '    let send=c, url=c.toDataURL(\'image/png\');',
    '    while(url.length>ASK_MAX_CHARS && send.width>64 && send.height>64){',
    "      const h=document.createElement('canvas');",
    '      h.width=Math.max(1,Math.round(send.width/2)); h.height=Math.max(1,Math.round(send.height/2));',
    "      const g=h.getContext('2d'); g.imageSmoothingEnabled=false;",
    '      g.drawImage(send,0,0,h.width,h.height);',
    "      send=h; url=h.toDataURL('image/png');",
    '    }',
    "    if(url.length>ASK_MAX_CHARS){ toast('This picture is too big to send to Claude - crop it first'); return; }",
    "    const j=await ask('locate',url);",
  ]);
}
{
  const fn = kit.inFunction(L, "$('locateai').onclick=async()=>{");
  const i = at("    $('tname').value=j.name||''; if(j.layer) $('tlayer').value=j.layer;", 'the layer assign', fn);
  const want = [
    "    $('tname').value=j.name||''; if(j.layer) $('tlayer').value=j.layer;",
    '    toast(j.reliable',
    "      ? 'Found '+j.name+' — check the edges, this is a guess'",
    "      : 'Claude was unsure — a reference would be exact');",
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the toast moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    "    $('tname').value=j.name||'';",
    '    /* Only a layer this project has. One it lacks left the picker blank',
    '       under a toast saying "Found", and Save filed it as unsorted. */',
    '    const known=!!j.layer && LAYERS.indexOf(j.layer)>=0;',
    "    if(known) $('tlayer').value=j.layer;",
    '    toast(j.layer && !known',
    "      ? 'Found '+j.name+', but Claude put it on '+j.layer+', which this project does not have - pick its layer before saving'",
    '      : j.reliable',
    "      ? 'Found '+j.name+' — check the edges, this is a guess'",
    "      : 'Claude was unsure — a reference would be exact');",
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times("'bad_json'")) throw new Error('bad_json is still said');
  if (times('image:dataUrl,layers:LAYERS.slice()') !== 1) throw new Error('the layers are not sent once');
});

fs.renameSync(TMP, FILE);
console.log('patch554 written, ' + grew + ' bytes');
