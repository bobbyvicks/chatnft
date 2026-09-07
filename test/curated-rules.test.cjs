const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),html=read('index.html');
const bundle=JSON.parse(read('rules/strict-fit-v7-collection.json')),canonical=JSON.parse(read('rules/trait-rules-strict-fit-v7.json'));
const traits=Object.entries(bundle.names).flatMap(([layer,ns])=>ns.map(n=>({kind:'trait',layer,name:n.slice(0,-4),rarity:1})));
const range=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function setup(){
 const c=vm.createContext({console,Math,File,JSON});
 vm.runInContext('var LAYERS='+JSON.stringify(bundle.order)+',RULES=[],DECISIONS=[],DECIDE_ORDER=[],ALWAYS_PRESENT=["skins"],emptyChance=0,clashRef=null,clashLen=-1,clashMap=null;'+
 'function traitKey(r){return r?(r.layer||"unsorted")+"/"+(r.name||""):"";}function traitWeight(r){return r.rarity||1;}function rnd(){return Math.random();}'+
 'function pairOf(a,b){return a<b?[a,b]:[b,a];}function pairId(a,b){return pairOf(a,b).join("\\u0000");}function ruleId(g){return g.join("\\u0000");}',c);
 vm.runInContext(range('function ruleGroup(list)','/* The WHOLE group')+range('function ruleImportName','async function saveRules')+
  range('function clashSet(k)','async function saveGrid')+range('function buildCombo(pools)','/* How many times to try')+
  range('function weightedPick(recs)','/* Paint one trait into a box')+range('function decideOrder(){','/* Written whenever something works out an order'),c);
 return c;
}
test('v7 bundled data enforces the reviewed exclusions in 10000 native Pixelbench draws',()=>{
 const c=setup(),p=c.planRuleImport(bundle.rules,traits);assert.equal(p.actions,446);
 for(const k of ['missingTraits','missingLayers','badOps','ambiguous'])assert.equal(p[k].length,0,k);
 c.RULES=p.groups;c.DECIDE_ORDER=p.order;
 const pools=Object.fromEntries(bundle.order.map(l=>[l,traits.filter(t=>t.layer===l)]));
 for(let i=0;i<10000;i++){
  const result=c.buildCombo(pools);assert.equal(result.violated,false);
  const selected=Object.fromEntries(result.combo.map(t=>[t.layer,t.name+'.png']));
  for(const r of canonical)if(r.trait.includes(selected[r.layer]))for(const a of r.thenStatements){
   if(a.action==='hide layer')assert.equal(selected[a.targetLayer],undefined);
   else if(selected[a.targetLayer])assert(a.targetTrait.includes(selected[a.targetLayer]));
  }
 }
});
test('complete review import clears stale glasses-eye exclusions while retaining human answers',()=>{
 const c=setup(),a='glasses/Pit Vipers',b='eyes/Bloodshot Eyes';
 c.RULES=[[a,b]];const p=c.planRuleImport(bundle.rules,traits);
 c.RULES=c.RULES.concat(p.groups);c.DECISIONS=c.mergeDecisions([],p.decisions);
 for(const d of c.DECISIONS)c.applyDecision(d.a,d.b,d.ok);
 assert(!c.RULES.some(g=>g.includes(a)&&g.includes(b)));
 const human={a:'masks/Solgods Mask',b:'hats/Green K Visor',ok:true,src:'you',at:1};
 const merged=c.mergeDecisions([human],p.decisions);assert.equal(merged.find(d=>c.pairId(d.a,d.b)===c.pairId(human.a,human.b)).ok,true);
});
test('saved decisions retain file provenance through a reload and can be superseded by the next import',async()=>{
 const c=setup(),rows=[];c.dbPut=async r=>rows.push(JSON.parse(JSON.stringify(r)));c.shareRules=async()=>false;c.RULES_ID='rules';c.DECISIONS_ID='decisions';
 c.DECISIONS=[{a:'hats/cap',b:'hair/mop',ok:false,src:'file',at:1},{a:'hats/cap',b:'hair/bob',ok:true,src:'you',at:1}];
 vm.runInContext(range('async function saveRules(){','/* Rules, the order they are decided'),c);await c.saveRules();
 const saved=rows.find(r=>r.id==='decisions').decisions;assert.equal(saved[0].src,'file');assert.equal(saved[1].src,'you');
 const merged=c.mergeDecisions(saved,[{...saved[0],ok:true,at:2},{...saved[1],ok:false,src:'file',at:2}]);
 assert.equal(merged[0].ok,true);assert.equal(merged[1].ok,true);
});
function controls(c,items){
 const els={rulesload:{disabled:false},ruleimportnote:{hidden:true,textContent:''}};
 for(const id of Object.keys(els))assert(html.includes('id="'+id+'"'));
 c.document={getElementById:id=>els[id]};c.activeWs=null;c.dbAll=async()=>items;
 c.fetch=async()=>({ok:true,json:async()=>bundle});c.importRuleFile=async f=>{c.imported=JSON.parse(await f.text());return true;};
 c.saveLayers=async()=>{c.savedOrder=Array.from(c.LAYERS);};
 vm.runInContext(read('curated-rules-v7.js'),c);return els;
}
test('Load the rules button passes the full review to the native importer and saves the correct paint order',async()=>{
 const c=setup(),els=controls(c,traits);c.LAYERS=bundle.order.slice().reverse();await els.rulesload.onclick();
 assert.deepEqual(c.imported,bundle.rules);assert.deepEqual(c.savedOrder,bundle.order);assert.equal(els.rulesload.disabled,false);assert.match(els.ruleimportnote.textContent,/V7 draw order saved/);
});
test('Load the rules refuses a missing inventory and a failed fetch before changing any rules',async()=>{
 const c=setup(),els=controls(c,traits.slice(1));await els.rulesload.onclick();assert.equal(c.imported,undefined);assert.match(els.ruleimportnote.textContent,/Missing 1/);
 c.fetch=async()=>({ok:false});await els.rulesload.onclick();assert.equal(c.imported,undefined);assert.equal(c.savedOrder,undefined);assert.match(els.ruleimportnote.textContent,/Could not load/);
});
