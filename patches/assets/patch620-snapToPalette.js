function snapToPalette(d,n,w,opts){
  const pal=paletteRGB();
  const exact=new Set(pal.map(p=>p.h));
  /* ONCE PER CALL, not once per colour looked up. */
  const palLab=pal.map(p=>labOf(p.r,p.g,p.b));
  /* THE DISTINCT COLOURS, AND HOW MANY PIXELS EACH HAS. */
  const count=new Map();
  /* THE OPAQUE PIXELS, so the run can say how much of the picture moved.
     `worst` is a maximum over DISTINCT colours and knows nothing about
     area: a colour on four cells can set it while a skin whose whole face
     moved sets nothing. */
  let opaque=0;
  for(let i=0;i<n;i++){
    const o=i*4;
    if(d[o+3]===0) continue;
    opaque++;
    const key=(d[o]<<16)|(d[o+1]<<8)|d[o+2];
    count.set(key,(count.get(key)||0)+1);
  }
  const hexOf=key=>"#"+((key>>>0)&0xffffff).toString(16).padStart(6,"0");
  const cols=[...count.entries()].map(([key,px])=>({key:key,px:px,r:(key>>16)&255,g:(key>>8)&255,b:key&255}));
  /* Largest first, ties by value, so the grouping is a function of the
     picture and nothing else. */
  cols.sort((a,b)=>b.px-a.px||a.key-b.key);
  /* CANDIDATE GROUPS THROUGH A GRID over Lab, cells the size of the box
     below, so a colour is only compared with groups in its own cell and
     the 26 around it - everything outside was skipped by the box anyway.
     The earliest-made group that passes wins, which is what the scan in
     creation order answered: identical on all 261 real traits under the
     old 8,192 cap, and no cap. */
  const grid=new Map();
  const cellOf=lab=>[Math.floor(lab[0]/5),Math.floor(lab[1]/16),Math.floor(lab[2]/16)];
  const groups=[];
  const hit=new Map();
  for(const c of cols){
    if(exact.has(hexOf(c.key))){ hit.set(c.key,null); continue; }
    const lab=labOf(c.r,c.g,c.b);
    let grp=null;
    {
      const [x,y,z]=cellOf(lab);
      let first=Infinity;
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(let dz=-1;dz<=1;dz++){
        const list=grid.get((x+dx)+","+(y+dy)+","+(z+dz));
        if(!list) continue;
        /* Each cell lists its groups in the order they were made. */
        for(const g of list){
          if(g.idx>=first) break;
          const q=g.lab;
          /* A cheap box first: 2.3 dE cannot span more than about 4 in L
             or 14 in chroma, so anything outside this box is not a member
             and the trigonometry is skipped. */
          if(Math.abs(q[0]-lab[0])>5||Math.abs(q[1]-lab[1])>16||Math.abs(q[2]-lab[2])>16) continue;
          if(deltaE2000(q[0],q[1],q[2],lab[0],lab[1],lab[2])<=SNAP_GROUP_DE){ first=g.idx; grp=g; break; }
        }
      }
    }
    if(!grp){
      grp={idx:groups.length, lab:lab, sumL:0, suma:0, sumb:0, px:0, members:[]}; groups.push(grp);
      const k=cellOf(lab).join(","), l=grid.get(k);
      if(l) l.push(grp); else grid.set(k,[grp]);
    }
    grp.sumL+=lab[0]*c.px; grp.suma+=lab[1]*c.px; grp.sumb+=lab[2]*c.px; grp.px+=c.px;
    grp.members.push({c:c, lab:lab});
  }
  /* ONE PALETTE COLOUR PER GROUP, nearest to its pixel-weighted mean.
     THE WHOLE PALETTE, not a shortlist. Measured over 24,389 colours: the
     true nearest is inside the four cheapest by plain Lab distance only
     73% of the time, and inside the cheapest twenty-four only 96% - so a
     shortlist buys speed by being wrong, which is the opposite of what
     was asked for. A full 256 measured 0.066ms. */
  for(const g of groups){
    g.m=[g.sumL/g.px, g.suma/g.px, g.sumb/g.px];
    /* The nearest, unless it sends a colourful group to grey (patch613). */
    g.target=palettePick(g.m,pal,palLab).best;
  }
  /* DRAWN SHADES STAY APART (patch617).

     Each group above takes its own nearest colour, so two shades the artist
     drew 5 dE or more apart - what "SHADES MERGED" below counts - can land
     on ONE palette colour and come out as one. patch615's swap made that
     much more common: a new colour that sits between two drawn shades takes
     both. Dark Skin's head shadow and chest lines went into its flat brown,
     GATE Hoodie's mid navy #0d204a (L13) fell onto the dark navy #050c30
     with its own shadows (L5), Circuit Board lost its two greens.

     So where one palette colour takes groups 5 dE or more apart, those
     groups are split into SHADES - a group joins a shade only when its
     dominant colour is under 5 dE from every group already in it - and the
     shades are given palette colours again, all together, at the lowest
     cost, where
       cost = every shade's cells x its distance to its colour
            + for every two shades 5 dE or more apart that still share a
              colour (or a shade and a group or exactly-drawn colour already
              on the colour it takes): the smaller one's cells x the
              distance between them.
     That second line is what the nearest-colour rule could not see: two
     shades merged lose the difference between them, and it is charged as
     if the smaller one had been painted in the other's colour. A merge
     stays when splitting it costs more - a one-cell speck is not moved
     far to stand apart, a drawn shadow is.
     A shade may only take
       - a colour at most SHADE_EXTRA dE further from it than the colour
         they all shared, among its SHADE_TOP nearest;
       - a colour that keeps LIGHT/DARK ORDER: a shade SHADE_ORDER_L or more
         darker (CIE L*) than another never comes out lighter than it -
         against the other shades, and against every other group or exact
         colour within SHADE_NEAR dE that it was not already inverted
         against;
       - not a grey, when it is colourful: patch613's rule (C* at least
         SNAP_GREY_MIN_C, the grey's under SNAP_GREY_RATIO of it);
       - when it is colourful (C* SHADE_HUE_C or more), a colour within
         SHADE_HUE degrees of its drawn hue (a grey counts as no hue) and
         within SHADE_AB of it in the a*b* plane unless the shared colour was
         already further; and any shade, a colour within SHADE_LCAP L* of
         its drawn lightness unless the shared colour was already further.
         Without these the split was bought with a wrong colour: HODLING's
         golden-brown strands went olive, Punk Frumpy's dark brown went
         purple-black, Dark Skin's shadow maroon, Water Skin's cyan grey,
         Chef Hat's pale folds harsh mid grey (round 3 sheets). Where no
         colour passes, the shades stay merged, as today;
       - no new light/dark inversion at any DRAWN BOUNDARY: two member
         colours that touch in the picture (w, the row length) and are
         SHADE_ORDER_L or more apart in L* never come out the other way
         round, between shades of the set or against a colour outside it;
       - when it is near-grey (C* under SHADE_GREY_MAX), not a colour more
         than SHADE_GREY_C more colourful (C*): without this Diamond Ore's
         grey stone went purple-grey #706277, Omegle's light-grey panel
         lines cream #f9e7c4 and then mint #c7dcd0, XRP Chain's silver
         mint #b1c3c1, all to stand apart.
         The swap's true greys stay grey; a grey with no grey to go to stays
         merged;
       - not pure white #ffffff or pure black #000000 unless the shade was
         drawn within SHADE_BW dE of it: Jason Mask's ivory face (#f8eedc,
         8.7 dE from white) split into pure-white patches to stand apart
         from its cream, and pure white or black reads as a highlight or an
         outline, not as a shade of the fill;
       - when it has only a little colour (C* SHADE_HUE_C2 up to SHADE_HUE_C),
         not a colour whose hue is more than SHADE_HUE2 degrees from its own
         (a grey target is left to the grey rules): Jason Mask's warm ivory
         next went to cool mint-white #e3ede7;
       - when it is colourful (round 5), not a colour whose hue is more than
         SHADE_HUE_ADD degrees further from its drawn hue than the shared
         colour's (unless the shared colour is SHADE_HUE_FAR dE or more off),
         nor one keeping less than SHADE_CKEEP of its chroma (unless the
         shared colour kept less): Jason Mask's beige shadow went sage, Teal
         Galaxy Skin's dark teal went green and grey, each to stand apart.
     The shared colour itself is always allowed, and "everyone stays" is the
     starting answer, so a set changes only when something is strictly
     cheaper. A group whose colour no distinct shade shares is never looked
     at: on a picture with no merge this changes nothing. Deterministic:
     colours in the order their first group was made, shades in creation
     order, candidates by distance then palette order, the search bounded
     at SHADE_NODES steps per colour. The constants live here, not at top
     level, because the worker carries this function as its text
     (fixWorker). */
  /* opts.shades===false: each group keeps its own nearest colour, the step as it was before
     patch617 (tests/palettenocap.spec.js holds the grouping to a written-out scan that way). */
  const SHADE_APART=!(opts&&opts.shades===false), SHADE_DE=5, SHADE_EXTRA=6, SHADE_ORDER_L=2, SHADE_NEAR=20, SHADE_TOP=6, SHADE_NODES=20000, SHADE_LOSE=1, SHADE_GREY_MAX=10, SHADE_GREY_C=4, SHADE_HUE_C=10, SHADE_HUE=20, SHADE_AB=12, SHADE_LCAP=8, SHADE_EDGE=true, SHADE_EDGE_SHARE=0, SHADE_BW=3, SHADE_HUE_C2=5, SHADE_HUE2=45, SHADE_CKEEP=0.5, SHADE_HUE_ADD=6, SHADE_HUE_FAR=7;
  let apart=0;
  if(SHADE_APART){
    const lOf=new Map();
    const palL=p=>{ let v=lOf.get(p.h); if(v===undefined){ v=labOf(p.r,p.g,p.b); lOf.set(p.h,v); } return v; };
    const de=(a,b)=>deltaE2000(a[0],a[1],a[2],b[0],b[1],b[2]);
    /* who holds each palette colour: groups by their target, and colours
       the picture draws exactly (they never move) */
    const holders=new Map();
    const hold=(h,e)=>{ const a=holders.get(h); if(a) a.push(e); else holders.set(h,[e]); };
    const ents=[];
    for(const g of groups){ const e={g:g, lab:g.lab, m:g.m, px:g.px}; ents.push(e); hold(g.target.h,e); }
    for(const [key,px] of count){
      if(!exact.has(hexOf(key))) continue;
      const p=pal.find(q=>q.h===hexOf(key));
      const lab=labOf(p.r,p.g,p.b);
      const e={g:null, lab:lab, m:lab, px:px, fixed:p, key:key}; ents.push(e); hold(p.h,e);
    }
    /* WHICH COLOURS TOUCH IN THE PICTURE (patch617), built once, only when a
       merge is looked at: for each drawn colour, the colours of the cells to
       its right and below and how many such edges. w is the row length;
       without it (an old caller) the edge check is skipped. */
    let adj=null;
    const entOf=new Map();
    for(const e of ents){ if(e.g){ for(const mm of e.g.members) entOf.set(mm.c.key,e); } else entOf.set(e.key,e); }
    const labKey=k=>{ const e=entOf.get(k); if(!e) return null; if(!e.g) return e.lab; for(const mm of e.g.members) if(mm.c.key===k) return mm.lab; return null; };
    const touch=()=>{
      if(adj) return adj;
      adj=new Map();
      const add=(a,b)=>{ let m=adj.get(a); if(!m){ m=new Map(); adj.set(a,m); } m.set(b,(m.get(b)||0)+1); };
      const H=Math.floor(n/w);
      for(let y=0;y<H;y++) for(let x=0;x<w;x++){
        const i=y*w+x, o=i*4;
        if(d[o+3]===0) continue;
        const k=(d[o]<<16)|(d[o+1]<<8)|d[o+2];
        if(x+1<w && d[o+7]!==0){ const k2=(d[o+4]<<16)|(d[o+5]<<8)|d[o+6]; if(k2!==k){ add(k,k2); add(k2,k); } }
        if(y+1<H && d[o+w*4+3]!==0){ const p2=o+w*4, k2=(d[p2]<<16)|(d[p2+1]<<8)|d[p2+2]; if(k2!==k){ add(k,k2); add(k2,k); } }
      }
      return adj;
    };
    const useEdges=SHADE_EDGE && w>0 && n%w===0;
    const hueOff=(x,y)=>{ let h=Math.abs(Math.atan2(x[2],x[1])-Math.atan2(y[2],y[1]))*180/Math.PI; return h>180 ? 360-h : h; };
    const outOf=e=>e.g ? e.g.target : e.fixed;
    const order=[], seen=new Set();
    for(const g of groups){ if(!seen.has(g.target.h)){ seen.add(g.target.h); order.push(g.target); } }
    const inv=(sL,oL,eL,fL)=>(sL+SHADE_ORDER_L<=eL && oL>fL) || (eL+SHADE_ORDER_L<=sL && fL>oL);
    for(const t of order){
      const arr=holders.get(t.h).filter(e=>e.g && e.g.target===t);
      if(arr.length<2) continue;
      let far=false;
      for(let i=0;i<arr.length&&!far;i++) for(let j=i+1;j<arr.length;j++){ if(de(arr[i].lab,arr[j].lab)>=SHADE_DE){ far=true; break; } }
      if(!far) continue;
      /* the shades: complete linkage on dominant colours, creation order */
      const shades=[];
      for(const e of arr){
        let s=null;
        for(const sh of shades){ if(sh.ents.every(x=>de(x.lab,e.lab)<SHADE_DE)){ s=sh; break; } }
        if(!s){ s={ents:[], px:0, L:0, a:0, b:0}; shades.push(s); }
        s.ents.push(e); s.px+=e.px; s.L+=e.m[0]*e.px; s.a+=e.m[1]*e.px; s.b+=e.m[2]*e.px;
      }
      const K=shades.length;
      for(const s of shades){ s.m=[s.L/s.px, s.a/s.px, s.b/s.px]; s.base=de(s.m,palL(t)); }
      /* LIGHT/DARK ORDER AT EVERY DRAWN BOUNDARY. The order rule below
         compares shade MEANS; a shade's members can still sit next to
         colours of another shade, or of a colour outside the set, the other
         way round. So for every shade: the member edges to each other shade
         (sk = edges where this shade's member is SHADE_ORDER_L or more
         darker, sl = lighter), and the member edges to colours outside the
         set (their input L*, the outside entity, edges). */
      const shadeOf=new Map();
      shades.forEach((s,k)=>{ for(const e of s.ents) shadeOf.set(e,k); s.pd=new Array(K).fill(0); s.pl=new Array(K).fill(0); s.out=[]; s.ordered=0; });
      if(useEdges){
        const A=touch();
        shades.forEach((s,k)=>{
          for(const e of s.ents) for(const mm of e.g.members){
            const nb=A.get(mm.c.key); if(!nb) continue;
            for(const [k2,c2] of nb){
              const e2=entOf.get(k2); if(!e2) continue;
              const l2=labKey(k2); if(!l2) continue;
              const L1=mm.lab[0], L2=l2[0];
              if(Math.abs(L1-L2)<SHADE_ORDER_L) continue;
              const j=shadeOf.get(e2);
              if(j===k) continue;
              if(j!==undefined){ if(L1<L2) s.pd[j]+=c2; else s.pl[j]+=c2; }
              else { s.out.push({L1:L1, L2:L2, e:e2, c:c2}); s.ordered+=c2; }
            }
          }
        });
      }
      /* what two shades lose by sharing a colour */
      const lose=shades.map(a=>shades.map(b=>{ if(a===b) return 0; const e=de(a.m,b.m); return e>=SHADE_DE ? SHADE_LOSE*Math.min(a.px,b.px)*e : 0; }));
      const inSet=new Set(arr);
      /* everyone else near enough in colour to be the same thing's shading */
      const near=ents.filter(e=>!inSet.has(e) && shades.some(s=>Math.abs(e.m[0]-s.m[0])<=SHADE_NEAR && de(e.m,s.m)<=SHADE_NEAR));
      const tL=palL(t)[0];
      for(const s of shades){
        const Cs=Math.hypot(s.m[1],s.m[2]);
        const cand=[];
        for(const p of pal){
          const q=palL(p), dist=de(s.m,q);
          if(dist>s.base+SHADE_EXTRA) continue;
          if(p!==t){
            if(Cs>=SNAP_GREY_MIN_C && Math.hypot(q[1],q[2])<Cs*SNAP_GREY_RATIO) continue;
            if(Cs<SHADE_GREY_MAX && Math.hypot(q[1],q[2])>Cs+SHADE_GREY_C) continue;
            if(near.some(e=>{ const eo=palL(outOf(e))[0]; return inv(s.m[0],q[0],e.m[0],eo) && !inv(s.m[0],tL,e.m[0],eo); })) continue;
            /* HUE (patch617): a colourful shade keeps its drawn hue within
               SHADE_HUE degrees - HODLING's golden-brown strands went olive,
               Punk Frumpy's dark brown went purple-black, to stand apart. */
            if(Cs>=SHADE_HUE_C){
              let dh=Math.abs(Math.atan2(q[2],q[1])-Math.atan2(s.m[2],s.m[1]))*180/Math.PI;
              if(dh>180) dh=360-dh;
              /* a grey has no hue to keep */
              if(Math.hypot(q[1],q[2])<SHADE_GREY_C) dh=180;
              if(dh>SHADE_HUE) continue;
              /* HUE SWING (round 5): nor more than SHADE_HUE_ADD degrees further
                 from its drawn hue than the colour it shared (a grey shared colour
                 counts as on hue): Jason Mask's beige shadow #d0c8a8 (hue 98)
                 went from #bab8a4 (105) to sage #bfc6a4 (117), Teal Galaxy
                 Skin's dark teal (195) from #0b5e65 (208) to green #165a4c (175).
                 Not when the shared colour is itself SHADE_HUE_FAR dE or more
                 off (plainly another colour, nothing right to keep): Water
                 Skin's pale cyan lines (7.8 dE from cyan #00e3f4) stay apart
                 from its cyan in mint #8ff8e2. */
              if(s.base<SHADE_HUE_FAR && dh>(Math.hypot(palL(t)[1],palL(t)[2])<SHADE_GREY_C ? 0 : hueOff(palL(t),s.m))+SHADE_HUE_ADD) continue;
              /* CHROMA (round 5): nor keep less than SHADE_CKEEP of its colour
                 (C*), unless the shared colour already kept less: Teal Galaxy
                 Skin's dark teal (C* 14) went to grey #344241 (C* 6). */
              const Cq=Math.hypot(q[1],q[2]);
              if(Cq<SHADE_CKEEP*Cs && Cq<Math.hypot(palL(t)[1],palL(t)[2])) continue;
              /* and its colour (hue and chroma together, the a*b* plane) no
                 more than SHADE_AB from what was drawn, unless the shared
                 colour was already further: Dark Skin's shadow went maroon
                 #6e2727 (16 degrees, but twice as saturated), Water Skin's
                 cyan went grey-blue #9babb2. */
              const tq=palL(t);
              if(Math.hypot(q[1]-s.m[1],q[2]-s.m[2])>Math.max(SHADE_AB,Math.hypot(tq[1]-s.m[1],tq[2]-s.m[2]))) continue;
            }
            /* A FAINT TINT KEEPS ITS SIDE (patch617): a shade with a little
               colour (C* SHADE_HUE_C2 to SHADE_HUE_C) does not move to a
               colour whose hue is more than SHADE_HUE2 degrees away - Jason
               Mask's warm ivory went to cool mint-white #e3ede7 to stand
               apart. A grey target is left to the grey rules above. */
            if(Cs>=SHADE_HUE_C2 && Cs<SHADE_HUE_C && Math.hypot(q[1],q[2])>=SHADE_GREY_C){
              let dh=Math.abs(Math.atan2(q[2],q[1])-Math.atan2(s.m[2],s.m[1]))*180/Math.PI;
              if(dh>180) dh=360-dh;
              if(dh>SHADE_HUE2) continue;
            }
            /* PURE WHITE / BLACK (patch617): only for a shade drawn that way. */
            if(((p.r&p.g&p.b)===255 || (p.r|p.g|p.b)===0) && dist>SHADE_BW) continue;
            /* VALUE (patch617): standing apart may not push a shade's
               lightness more than SHADE_LCAP L* from its drawn lightness,
               unless the shared colour was already that far - Chef Hat's pale
               folds went to harsh mid greys, Burlap's weave darker. */
            if(Math.abs(q[0]-s.m[0])>Math.max(SHADE_LCAP,Math.abs(tL-s.m[0]))) continue;
            /* ORDER AT DRAWN BOUNDARIES, against colours outside the set. */
            if(s.ordered>0){
              let bad=0;
              for(const x of s.out){ const eo=palL(outOf(x.e))[0]; if(inv(x.L1,q[0],x.L2,eo) && !inv(x.L1,tL,x.L2,eo)) bad+=x.c; }
              if(bad>SHADE_EDGE_SHARE*s.ordered) continue;
            }
          }
          /* sharing with whoever outside this set already holds p */
          let other=0;
          for(const e of holders.get(p.h)||[]){
            if(inSet.has(e)) continue;
            const x=de(s.m,e.m);
            if(x>=SHADE_DE) other+=SHADE_LOSE*Math.min(s.px,e.px)*x;
          }
          cand.push({p:p, q:q, d:dist, own:s.px*dist+other});
        }
        cand.sort((x,y)=>x.d-y.d);
        s.cand=cand.slice(0,SHADE_TOP);
        if(!s.cand.some(c=>c.p===t)) s.cand.push(cand.find(c=>c.p===t));
        s.low=Math.min(...s.cand.map(c=>c.own));
      }
      /* the starting answer: everyone stays */
      let bestCost=0;
      for(let i=0;i<K;i++){ bestCost+=shades[i].cand.find(c=>c.p===t).own; for(let j=i+1;j<K;j++) bestCost+=lose[i][j]; }
      const startCost=bestCost;
      let bestPick=null, nodes=0;
      const rest=new Array(K+1).fill(0);
      for(let k=K-1;k>=0;k--) rest[k]=rest[k+1]+shades[k].low;
      const pick=new Array(K);
      const walk=(k,cost)=>{
        if(++nodes>SHADE_NODES || cost+rest[k]>=bestCost-1e-9) return;
        if(k===K){ bestCost=cost; bestPick=pick.slice(); return; }
        for(const c of shades[k].cand){
          let add=c.own, ok=true;
          for(let j=0;j<k;j++){
            if(pick[j].p===c.p) add+=lose[k][j];
            else if(inv(shades[k].m[0],c.q[0],shades[j].m[0],pick[j].q[0])){ ok=false; break; }
            else {
              /* member edges between the two shades: k lighter than j now
                 inverts every edge where k's member was the darker */
              const qk=c.q[0], qj=pick[j].q[0], sk=shades[k];
              const bad=qk>qj ? sk.pd[j] : qk<qj ? sk.pl[j] : 0;
              if(bad>0 && bad>SHADE_EDGE_SHARE*(sk.pd[j]+sk.pl[j])){ ok=false; break; }
            }
          }
          if(!ok) continue;
          pick[k]=c; walk(k+1,cost+add);
        }
      };
      walk(0,0);
      if(!bestPick || !(bestCost<startCost)) continue;
      shades.forEach((s,k)=>{
        const p=bestPick[k].p;
        if(p===t) return;
        for(const e of s.ents){
          const h=holders.get(t.h); h.splice(h.indexOf(e),1);
          e.g.target=p; hold(p.h,e);
        }
        apart++;
      });
    }
  }
  let moved=0, pixels=0, worst=0;
  const byTarget=new Map();
  for(const g of groups){
    const best=g.target;
    const tl=labOf(best.r,best.g,best.b);
    for(const mm of g.members){
      /* A dE, unrounded: about 1 is the smallest difference anybody can
         see, 10 is plainly another colour. It was rounded per colour
         before the maximum was taken, so 9.5 read as "a clear change"
         and 0.6 as "barely visible"; the word is chosen on the true
         value now and the number rounded only where it is printed. */
      const far=deltaE2000(mm.lab[0],mm.lab[1],mm.lab[2],tl[0],tl[1],tl[2]);
      if(far>worst) worst=far;
      hit.set(mm.c.key,best); moved++;
    }
    const arr=byTarget.get(best.h)||[]; arr.push(g); byTarget.set(best.h,arr);
  }
  /* SHADES MERGED: groups that share a palette colour with another group
     whose dominant colour is 5 dE or more away - two drawn shades that
     came out as one. The library recorded this failure as "dark shading
     merged"; now it is a number. */
  let merged=0, mergedWorst=0;
  for(const arr of byTarget.values()){
    if(arr.length<2) continue;
    for(let i=0;i<arr.length;i++){
      let far=0;
      for(let j=0;j<arr.length;j++){
        if(i===j) continue;
        const a=arr[i].lab, b=arr[j].lab;
        const e=deltaE2000(a[0],a[1],a[2],b[0],b[1],b[2]);
        if(e>far) far=e;
      }
      if(far>=5){ merged++; if(far>mergedWorst) mergedWorst=far; }
    }
  }
  for(let i=0;i<n;i++){
    const o=i*4;
    if(d[o+3]===0) continue;
    const t=hit.get((d[o]<<16)|(d[o+1]<<8)|d[o+2]);
    if(!t) continue;
    d[o]=t.r; d[o+1]=t.g; d[o+2]=t.b;
    pixels++;
  }
  return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst, opaque:opaque, share:opaque?pixels/opaque:0, apart:apart};
}
