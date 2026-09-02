const {decode}=require('./png.cjs');
const fs=require('fs'), path=require('path');
const ROOT='E:/X content/pixel art_';
const files=[];
(function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){ if(!/rejected|wip|previews|backups|^base$/i.test(e.name)) walk(p); }
  else if(/\.png$/i.test(e.name)) files.push(p);
} })(path.join(ROOT,'traits'));
const d2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const CAND={ 'cyan #00FFFF':[0,255,255], 'green #00FF00':[0,255,0],
             'spring #00FF1E':[0,255,30], 'aqua #4BFFB4':[75,255,180] };
const res={}; for(const k in CAND) res[k]=[];
for(const f of files){
  if(f.includes('base')) continue;
  let im; try{ im=decode(f); }catch(e){ continue; }
  const worst={}; for(const k in CAND) worst[k]={d:Infinity,px:0};
  const seen=new Map();
  for(let p=0;p<im.width*im.height;p++){ const i=p*4; if(im.data[i+3]<128) continue;
    const k=(im.data[i]<<16)|(im.data[i+1]<<8)|im.data[i+2]; seen.set(k,(seen.get(k)||0)+1); }
  for(const [k,n] of seen){
    const c=[(k>>16)&255,(k>>8)&255,k&255];
    for(const name in CAND){ const d=d2(c,CAND[name]);
      if(d<=30){ worst[name].px+=n; if(d<worst[name].d) worst[name].d=d; } }
  }
  for(const name in CAND) if(worst[name].px>0)
    res[name].push({f:path.relative(ROOT,f), d:+worst[name].d.toFixed(1), px:worst[name].px});
}
for(const name in CAND){
  const r=res[name].sort((a,b)=>b.px-a.px);
  console.log('\n'+name+' - trait files with any colour within 30:');
  if(!r.length){ console.log('   none'); continue; }
  for(const x of r.slice(0,8)) console.log('   '+x.d.toFixed(1).padStart(5)+'  '+x.px.toLocaleString().padStart(9)+' px  '+x.f);
  console.log('   ('+r.length+' files total, '+r.filter(x=>x.f.includes('background')).length+' of them backgrounds)');
}
