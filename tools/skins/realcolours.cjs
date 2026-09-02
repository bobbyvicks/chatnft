const {decode}=require('./png.cjs');
const fs=require('fs'), path=require('path');
const ROOT='E:/X content/pixel art_';
/* Every colour the real collection actually uses, from the approved traits -
   not from a list I invented. This is the population my palette search should
   have used and did not. */
const files=[];
(function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){ if(!/rejected|wip|previews|backups/i.test(e.name)) walk(p); }
  else if(/\.png$/i.test(e.name)) files.push(p);
} })(path.join(ROOT,'traits'));
try{ (function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){ if(!/rejected|wip/i.test(e.name)) walk(p); }
  else if(/\.png$/i.test(e.name)) files.push(p);
} })(path.join(ROOT,'new-traits')); }catch(_){}

const KEY_FILL=[0,255,255], KEY_INK=[0,255,0];
const d2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const pal=new Map();          /* colour -> pixels */
let read=0, failed=0;
const hits={fill:{},ink:{}};
for(const f of files){
  let im; try{ im=decode(f); }catch(e){ failed++; continue; }
  read++;
  const seen=new Map();
  for(let p=0;p<im.width*im.height;p++){
    const i=p*4; if(im.data[i+3]<128) continue;
    const k=(im.data[i]<<16)|(im.data[i+1]<<8)|im.data[i+2];
    seen.set(k,(seen.get(k)||0)+1);
  }
  for(const [k,n] of seen){
    pal.set(k,(pal.get(k)||0)+n);
    const c=[(k>>16)&255,(k>>8)&255,k&255];
    for(const [name,key] of [['fill',KEY_FILL],['ink',KEY_INK]]){
      const dd=d2(c,key);
      for(const tol of [0,12,30,60]){
        if(dd<=tol){ hits[name][tol]=hits[name][tol]||{files:new Set(),px:0};
          hits[name][tol].files.add(f); hits[name][tol].px+=n; }
      }
    }
  }
}
console.log('read '+read+' trait PNGs ('+failed+' unreadable), '+pal.size+' distinct colours in the collection\n');
for(const [name,key] of [['KEY_FILL cyan #00FFFF',KEY_FILL],['KEY_INK green #00FF00',KEY_INK]]){
  const k=name.startsWith('KEY_FILL')?'fill':'ink';
  console.log(name+':');
  for(const tol of [0,12,30,60]){
    const h=hits[k][tol];
    console.log('   within '+String(tol).padStart(2)+': '+(h?h.files.size+' files, '+h.px.toLocaleString()+' pixels':'nothing'));
  }
  /* which files are the worst offenders */
  const h=hits[k][30];
  if(h) console.log('   examples: '+[...h.files].slice(0,4).map(f=>path.relative(ROOT,f)).join('  |  '));
  console.log('');
}
fs.writeFileSync('real-trait-palette.json',
  JSON.stringify([...pal.entries()].sort((a,b)=>b[1]-a[1]).map(([k,n])=>
    ({rgb:[(k>>16)&255,(k>>8)&255,k&255], px:n}))));
console.log('wrote real-trait-palette.json ('+pal.size+' colours with pixel counts)');
