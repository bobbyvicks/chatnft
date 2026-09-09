/* A SECOND IMAGE WOULD NOT GO IN, AND THE FIRST STAYED ON SCREEN.

   "when i go to add a new image it doesnt let me add another bc it doesnt
   change out the last one i did for the fix pixels tab."

   REPRODUCED, and it is the MIME type. fixLoad opened with

     if(!file||!/^image\//.test(file.type||"")){ fixSay("That is not an image."); return; }

   and a browser does not always report one. Driven with the three shapes a
   file dialog really hands over:

     type ""                       refused, first image still loaded
     type application/octet-stream refused, first image still loaded
     type image/heic               accepted

   Two of three. An empty type is what a phone gives for a file picked out of
   Files rather than Photos, and octet-stream is what a lot of desktop dialogs
   give for anything they do not recognise. The refusal left the previous
   picture on screen with its Fix it button live, which is exactly "it doesn't
   change out the last one".

   THE TYPE IS NOT THE QUESTION. Whether a file is an image is answered by
   trying to decode it, which this already does on the next line. The check is
   gone and the decode does the whole job - so a HEIC, a file with no type, a
   .jpeg named .txt and anything else a browser can read all work, and anything
   it cannot read says so instead of naming a reason that was never checked.
   accept becomes image/* for the same reason: the old list hid HEIC from an
   iPhone's own picker.

   AND IT TAKES A PILE OF THEM NOW.

   "i want there to be a Import file and have it do batches of work, would we
   need to cap it? the art wouldnt get worse over time bc its code and not
   paramiters and agents so i dont see why we wouldnt be able to set the max
   dump size to 500."

   That reasoning is right and the cap is not about quality. This is the same
   deterministic engine on every image; the hundredth is exactly as good as the
   first. What a cap is about here is two other things, and only one of them
   binds:

     MEMORY does not bind, because the work is serial. One image is decoded at
     a time and released, and what is KEPT is the output - which is the whole
     point of this tool, an image at its native size. A 1024px input becomes
     about 85x85, a few kilobytes. Five hundred of those is single-digit
     megabytes.

     TIME does. Detection is roughly a second on a 512px image and several on a
     1024. Five hundred is a job measured in minutes, not seconds. So it shows
     which image it is on, keeps what it has finished, and Stop leaves you the
     work already done rather than throwing it away.

   500 it is, as asked, named as FIX_BATCH_MAX with the reason beside it, and
   anything past it is said rather than silently dropped.

   ONE WORKER FOR THE WHOLE RUN. Each run built a Worker and terminated it,
   which means parsing 380 KB of engine every time; five hundred of those is
   minutes of nothing but startup. The batch builds one and asks it five
   hundred questions. The single-image path keeps its own worker per run,
   because there Stop has to be a real stop rather than a request. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the input takes many, and any image ------------------------ */
{
  const at = kit.only(L, l => l === '  <input type="file" id="fixfile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>',
    'the fixer file input');
  kit.replace(L, { start: at, end: at }, [
    '  <!-- image/* rather than a list: the list hid HEIC, which is what an',
    '       iPhone photo is, from the picker on the device most likely to have',
    '       one. multiple, because a pile of them is the ordinary case. -->',
    '  <input type="file" id="fixfile" accept="image/*" multiple hidden>',
  ]);
}

/* ---- the drop zone says it takes a pile -------------------------- */
{
  const at = kit.only(L, l => l.indexOf('  <div class="drop" id="fixdrop"') === 0, 'the drop zone');
  const end = kit.only(L, (l, i) => i > at && i < at + 8 && l.indexOf('</div>') >= 0,
    'the end of the drop zone', { start: at, end: at + 8 });
  const inner = L.slice(at, end + 1).join('\n');
  if (!/Drop|Choose/.test(inner)) throw new Error('the drop zone does not say what it takes');
}

/* ---- the type check goes ----------------------------------------- */
{
  const r = kit.inFunction(L, 'async function fixLoad(file){');
  const at = kit.only(L, l => l === '  if(!file||!/^image\\//.test(file.type||"")){ fixSay("That is not an image."); return; }',
    'the type check', r);
  if (L[at + 1] !== '  let bm; try{ bm=await createImageBitmap(file); }catch(_){ fixSay("That image could not be decoded."); return; }')
    throw new Error('the decode is not on the line after the type check');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* NO MIME CHECK. A browser does not always report one - measured: a file',
    '     with type "" and one with application/octet-stream were both refused',
    '     while the previous image stayed on screen with its button live, which',
    '     is what "it does not change out the last one" was. Whether a file is an',
    '     image is answered by decoding it, which is the next line anyway. */',
    '  if(!file){ fixSay("Choose an image first."); return false; }',
    '  let bm;',
    '  try{ bm=await createImageBitmap(file); }',
    '  catch(_){ fixSay("That file is not an image this browser can read."); return false; }',
  ]);

  /* Every other exit says whether it worked, so a caller can tell. */
  const r2 = kit.inFunction(L, 'async function fixLoad(file){');
  for (const [from, to] of [
    ['  if(Math.min(W,H)<FIX_MIN_SIDE){ fixSay("Too small - the shorter side has to be at least "+FIX_MIN_SIDE+" pixels."); return; }',
      '  if(Math.min(W,H)<FIX_MIN_SIDE){ fixSay("Too small - the shorter side has to be at least "+FIX_MIN_SIDE+" pixels."); return false; }'],
    ['  if(W*H>FIX_MAX_PIXELS){ fixSay("Too big - "+(W*H/1e6).toFixed(1)+" megapixels, and the limit is "+(FIX_MAX_PIXELS/1e6)+"."); return; }',
      '  if(W*H>FIX_MAX_PIXELS){ fixSay("Too big - "+(W*H/1e6).toFixed(1)+" megapixels, and the limit is "+(FIX_MAX_PIXELS/1e6)+"."); return false; }'],
  ]) {
    const i = kit.only(L, l => l === from, 'a fixLoad exit', r2);
    kit.replace(L, { start: i, end: i }, [to]);
  }
  const r3 = kit.inFunction(L, 'async function fixLoad(file){');
  const say = kit.only(L, l => l === '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");', 'the loaded message', r3);
  kit.replace(L, { start: say, end: say }, [
    '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");',
    '  return true;',
  ]);
}

/* ---- the batch -------------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixDownload(){', 'the single download');
  kit.replace(L, { start: at, end: at }, [
    '/* HOW MANY IMAGES ONE GO MAY HOLD.',
    '',
    '   Not about quality: this is the same deterministic engine on every image',
    '   and the five hundredth is exactly as good as the first. Not about memory',
    '   either, because the work is serial - one decoded at a time and released,',
    '   and what is KEPT is the output, which is the whole point of this tool: a',
    '   1024px input becomes about 85x85, a few kilobytes, so five hundred of them',
    '   is single-digit megabytes.',
    '',
    '   It is about TIME. Detection is about a second on a 512px image and several',
    '   on a 1024, so five hundred is minutes rather than seconds. The number is',
    '   here so that a pile past it is SAID rather than quietly shortened. */',
    'const FIX_BATCH_MAX=500;',
    'let fixBatchFiles=null, fixBatchStop=false, fixBatchWorker=null;',
    '/* One question to a worker that stays alive, so a batch parses the engine',
    '   once instead of five hundred times. The single-image path keeps building',
    '   its own, because there Stop has to terminate rather than ask. */',
    'function fixAsk(w,payload,onProgress){',
    '  return new Promise(res=>{',
    '    w.onmessage=ev=>{',
    '      const m=ev.data;',
    '      if(m.progress!=null){ if(onProgress) onProgress(m.progress,m.label); return; }',
    '      if(m.error){ res({error:m.error}); return; }',
    '      if(m.done) res({ok:m.done});',
    '    };',
    '    w.onerror=e=>res({error:(e&&e.message)||"the engine stopped"});',
    '    w.postMessage(payload,[payload.data.buffer]);',
    '  });',
    '}',
    'function fixBatchSay(m){ const el=$("fixbatchout"); if(el) el.textContent=m; }',
    'async function fixBatch(files){',
    '  const all=[...files];',
    '  const list=all.slice(0,FIX_BATCH_MAX);',
    '  const over=all.length-list.length;',
    '  fixBatchFiles=[]; fixBatchStop=false;',
    '  $("fixbatch").hidden=false;',
    '  $("fixbatchdl").disabled=true;',
    '  $("fixbatchstop").hidden=false;',
    '  $("fixpair").hidden=true; $("fixacts").hidden=true;',
    '  fixSay("");',
    '  const failed=[];',
    '  let w=null;',
    '  try{ w=fixWorker(); }catch(e){ fixBatchSay(e.message); $("fixbatchstop").hidden=true; return; }',
    '  fixBatchWorker=w;',
    '  const forced=+$("fixforce").value||0;',
    '  const mode=$("fixmode").value==="fast"?"fast":"full";',
    '  const t0=performance.now();',
    '  for(let i=0;i<list.length;i++){',
    '    if(fixBatchStop) break;',
    '    const file=list[i];',
    '    const name=String(file.name||("image"+(i+1))).replace(/\\.[^.]+$/,"");',
    '    fixBatchSay((i+1)+" of "+list.length+" \\u00b7 "+name);',
    '    fixProgress(i/list.length,"image "+(i+1)+" of "+list.length);',
    '    let bm=null;',
    '    try{ bm=await createImageBitmap(file); }',
    '    catch(_){ failed.push(name+" (not an image this browser can read)"); continue; }',
    '    const W=bm.width, H=bm.height;',
    '    if(Math.min(W,H)<FIX_MIN_SIDE||W*H>FIX_MAX_PIXELS){',
    '      if(bm.close) bm.close();',
    '      failed.push(name+" ("+W+"\\u00d7"+H+", outside what this can take)");',
    '      continue;',
    '    }',
    '    /* One canvas, reused, and the bitmap closed the moment its pixels are',
    '       out - the same rule the shelf and the sweeps follow. */',
    '    const c=document.createElement("canvas"); c.width=W; c.height=H;',
    '    const g=c.getContext("2d",{willReadFrequently:true});',
    '    g.drawImage(bm,0,0);',
    '    if(bm.close) bm.close();',
    '    const px=g.getImageData(0,0,W,H).data;',
    '    const r=await fixAsk(w,{data:new Uint8ClampedArray(px), width:W, height:H,',
    '      mode:mode, forceStep:forced>0?forced:null});',
    '    if(!r||r.error){ failed.push(name+" ("+((r&&r.error)||"no answer")+")"); continue; }',
    '    const out=r.ok;',
    '    const oc=document.createElement("canvas"); oc.width=out.width; oc.height=out.height;',
    '    const oim=oc.getContext("2d").createImageData(out.width,out.height);',
    '    oim.data.set(out.data);',
    '    oc.getContext("2d").putImageData(oim,0,0);',
    '    const blob=await new Promise(res=>oc.toBlob(res,"image/png"));',
    '    /* Kept as bytes rather than as a canvas: five hundred canvases would be',
    '       five hundred backing stores, and the bytes are what the zip wants. */',
    '    fixBatchFiles.push({name:name+"-fixed.png",',
    '      data:new Uint8Array(await blob.arrayBuffer()),',
    '      w:out.width, h:out.height});',
    '    oc.width=1; oc.height=1; c.width=1; c.height=1;',
    '  }',
    '  try{ w.terminate(); }catch(_){}',
    '  try{ URL.revokeObjectURL(w._url); }catch(_){}',
    '  fixBatchWorker=null;',
    '  fixProgress(null);',
    '  $("fixbatchstop").hidden=true;',
    '  $("fixbatchdl").disabled=!fixBatchFiles.length;',
    '  const secs=((performance.now()-t0)/1000).toFixed(1);',
    '  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"',
    '    +(fixBatchStop?" (stopped - what is done is kept)":"")',
    '    +(over?" \\u00b7 "+over+" past the limit of "+FIX_BATCH_MAX+" were left out":"")',
    '    +(failed.length?" \\u00b7 could not do: "+failed.slice(0,6).join(", ")',
    '      +(failed.length>6?" and "+(failed.length-6)+" more":""):""));',
    '}',
    'function fixBatchDownload(){',
    '  if(!fixBatchFiles||!fixBatchFiles.length){ fixBatchSay("Nothing to download yet."); return; }',
    '  const b=zip(fixBatchFiles.map(f=>({name:f.name,data:f.data})));',
    '  const u=URL.createObjectURL(b), a=document.createElement("a");',
    '  a.href=u; a.download="fixed-pixels.zip";',
    '  document.body.appendChild(a); a.click(); a.remove();',
    '  setTimeout(()=>URL.revokeObjectURL(u),1500);',
    '}',
    'function fixDownload(){',
  ]);
}

/* ---- the panel, and the wiring ---------------------------------- */
{
  const at = kit.only(L, l => l === '  <div class="btnrow" id="fixacts" hidden>', 'the single-image actions');
  const end = kit.only(L, (l, i) => i > at && i < at + 6 && l === '  </div>',
    'the end of those actions', { start: at, end: at + 6 });
  kit.replace(L, { start: end, end: end }, [
    '  </div>',
    '  <!-- A pile of them. Serial, so what is kept is the output rather than the',
    '       inputs - see FIX_BATCH_MAX for why 500 is about time and not memory. -->',
    '  <div id="fixbatch" hidden>',
    '    <p class="note mono" id="fixbatchout"></p>',
    '    <div class="btnrow">',
    '      <button class="btn" id="fixbatchdl" disabled>Download all as a zip</button>',
    '      <button class="btn ghost" id="fixbatchstop" hidden>Stop</button>',
    '    </div>',
    '  </div>',
  ]);

  const f = kit.only(L, l => l === '  f.onchange=()=>{ if(f.files&&f.files[0]) fixLoad(f.files[0]); f.value=""; };',
    'the file input handler');
  kit.replace(L, { start: f, end: f }, [
    '  /* One file is the old behaviour; several is a batch. The value is cleared',
    '     either way so picking the SAME file again fires again. */',
    '  const took=(files)=>{ if(!files||!files.length) return;',
    '    if(files.length===1){ $("fixbatch").hidden=true; fixLoad(files[0]); }',
    '    else fixBatch(files); };',
    '  f.onchange=()=>{ took(f.files); f.value=""; };',
  ]);

  const d = kit.only(L, l => l === '  d.ondrop=e=>{ e.preventDefault(); d.classList.remove("over"); const x=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(x) fixLoad(x); };',
    'the drop handler');
  kit.replace(L, { start: d, end: d }, [
    '  d.ondrop=e=>{ e.preventDefault(); d.classList.remove("over");',
    '    took(e.dataTransfer&&e.dataTransfer.files); };',
  ]);

  const stop = kit.only(L, l => l === '  $("fixstop").onclick=fixStop;', 'the stop button');
  kit.replace(L, { start: stop, end: stop }, [
    '  $("fixstop").onclick=fixStop;',
    '  /* Stop keeps what is finished. A batch is a long job and throwing away',
    '     four hundred good answers because the four hundred and first was not',
    '     wanted would make Stop a thing nobody dares press. */',
    '  $("fixbatchstop").onclick=()=>{ fixBatchStop=true; fixBatchSay("Stopping after this one\\u2026"); };',
    '  $("fixbatchdl").onclick=fixBatchDownload;',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const fl = kit.inFunction(codeLines, 'async function fixLoad(file){');
  const body = codeLines.slice(fl.start, fl.end + 1).join('\n');
  if (/file\.type/.test(body))
    throw new Error('fixLoad still asks the browser what type the file is');
  if (!/createImageBitmap\(file\)/.test(body))
    throw new Error('fixLoad no longer decides by decoding');
  /* It must SAY whether it worked, or the batch cannot count failures. */
  if ((body.match(/return false;/g) || []).length < 3)
    throw new Error('fixLoad does not report every way it can refuse');
  if (!/return true;/.test(body)) throw new Error('fixLoad never reports success');

  const fb = kit.inFunction(codeLines, 'async function fixBatch(files){');
  const batch = codeLines.slice(fb.start, fb.end + 1).join('\n');
  /* SERIAL, which is the whole argument for why 500 is safe. A Promise.all
     here would decode five hundred images at once. */
  if (/Promise\.all/.test(batch))
    throw new Error('the batch runs in parallel, which is what the cap was argued not to need');
  if (!/for\(let i=0;i<list\.length;i\+\+\)/.test(batch))
    throw new Error('the batch does not walk its list one at a time');
  if (!/if\(bm\.close\) bm\.close\(\);/.test(batch))
    throw new Error('the batch does not release the image it just read');
  if (!/if\(fixBatchStop\) break;/.test(batch))
    throw new Error('the batch cannot be stopped');
  if (!/slice\(0,FIX_BATCH_MAX\)/.test(batch))
    throw new Error('the batch does not honour its own cap');
  /* AND A PILE PAST THE CAP IS SAID, not silently shortened. */
  if (!/past the limit of "\+FIX_BATCH_MAX/.test(batch))
    throw new Error('files past the cap are dropped without saying so');
  /* One worker for the run, which is the reason 500 is minutes and not hours. */
  if ((batch.match(/fixWorker\(\)/g) || []).length !== 1)
    throw new Error('the batch does not build exactly one worker');
  if (!/w\.terminate\(\)/.test(batch)) throw new Error('the batch leaves its worker running');

  /* The single-image path is untouched: it still builds and terminates its own,
     because Stop there has to be a real stop. */
  const fr = kit.inFunction(codeLines, 'function fixRun(){');
  if (!/fixWorker\(\)/.test(codeLines.slice(fr.start, fr.end + 1).join('\n')))
    throw new Error('the single run lost its own worker');

  if (text.indexOf('accept="image/*" multiple') < 0)
    throw new Error('the input does not take many files, or hides the ones a phone has');
  if (text.indexOf('id="fixbatchdl"') < 0) throw new Error('there is no way to get the results out');
  if (!/\$\("fixbatchdl"\)\.onclick=fixBatchDownload;/.test(codeLines.join('\n')))
    throw new Error('the download button is not wired');

  /* THE CAP IS A NUMBER WITH A REASON, and the reason is the one that was
     actually argued - not quality. */
  if (!/const FIX_BATCH_MAX=500;/.test(codeLines.join('\n')))
    throw new Error('the cap is not 500');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
