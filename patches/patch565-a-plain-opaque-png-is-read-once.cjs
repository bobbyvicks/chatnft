/* A PLAIN PNG WITH NO TRANSLUCENT PIXEL IS READ ONCE.

   Found 2026-09-22 by the discovery pass, ranked thirty-eighth of 39.
   fixDecodeFile reads every file twice - the browser's decode, then the
   page's own PNG reader - and compares them pixel by pixel. The reader
   exists so translucent pixels come through byte-exact (the browser's
   canvas rounds their colour), and the browser is its check. The verifier
   measured where the time goes over the 311 real files: browser 3.5 s,
   reader 19.8 s, compare 1.2 s, and 0 disagreements. Only 10 of the 311
   have a translucent pixel.

   When the browser's decode has no pixel with alpha between 1 and 254,
   this function's answer is the browser's pixels either way: where the
   reader agrees it returns identical bytes (alpha equal, opaque colour
   equal, colour under alpha 0 zeroed by both), and where it disagrees it
   returns the browser's. So for such a file the reader changes nothing
   but the label - EXCEPT that a disagreement is disclosed: the folder note
   names every file the browser had to read. A colour-managed PNG (gAMA,
   iCCP, sRGB or cHRM before the pixels), a 16-bit one or an interlaced
   one is where the two can disagree, so those still go through the reader
   and keep their disclosure. A plain 8-bit PNG with no translucent pixel
   skips it. */
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
  const fnR = () => kit.inFunction(L, 'async function fixDecodeFile(file){');
  const i = at('  if(!bytes||!pngIs(bytes)) return via("not a PNG");', 'the PNG check', fnR());
  kit.replace(L, { start: i, end: i }, [
    '  if(!bytes||!pngIs(bytes)) return via("not a PNG");',
    '  /* READ ONCE when reading twice could change nothing: a plain PNG whose',
    '     browser decode has no translucent pixel. See pngPlain. */',
    '  if(pngPlain(bytes)){',
    '    let part=false;',
    '    for(let o=3;o<browser.length;o+=4){ const a=browser[o]; if(a>0&&a<255){ part=true; break; } }',
    '    if(!part){',
    '      for(let o=0;o<browser.length;o+=4) if(!browser[o+3]){ browser[o]=0; browser[o+1]=0; browser[o+2]=0; }',
    '      return {data:browser, width:W, height:H, how:"png", why:""};',
    '    }',
    '  }',
  ]);
  const f = fnR();
  kit.replace(L, { start: f.start, end: f.start }, [
    '/* A PNG THE BROWSER READS EXACTLY, where it has no translucent pixel: 8-bit,',
    '   not interlaced, and no colour-management chunk before the pixels. A',
    '   16-bit, interlaced or colour-managed file is one where the browser and',
    '   the page\'s reader can disagree, and that disagreement is disclosed, so',
    '   those are still read both ways. */',
    'function pngPlain(bytes){',
    '  if(!bytes||bytes.length<33||!pngIs(bytes)) return false;',
    '  if(bytes[24]!==8 || bytes[28]!==0) return false;',
    '  let p=8;',
    '  while(p+8<=bytes.length){',
    '    const len=((bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3])>>>0;',
    '    const type=String.fromCharCode(bytes[p+4],bytes[p+5],bytes[p+6],bytes[p+7]);',
    '    if(type==="IDAT") return true;',
    '    if(type==="gAMA"||type==="iCCP"||type==="sRGB"||type==="cHRM") return false;',
    '    p+=12+len;',
    '  }',
    '  return false;',
    '}',
    'async function fixDecodeFile(file){',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  if (code.split('pngPlain(bytes)').length - 1 !== 2) throw new Error('pngPlain');
});

fs.renameSync(TMP, FILE);
console.log('patch565 written, ' + grew + ' bytes');
