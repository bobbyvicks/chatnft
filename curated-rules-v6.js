/* Feed the validated collection into the native team-review importer.
   The full policy list includes explicit unrestricted pairs, so an older
   import cannot leave glasses hiding eyes after v6 removes that restriction. */
(() => {
  const button=document.getElementById('rulev6');
  button.onclick=async()=>{
    if(button.disabled)return;
    button.disabled=true;
    const note=document.getElementById('ruleimportnote');note.hidden=false;note.textContent='Checking the v6 collection…';
    const workspace=activeWs;
    try{
      const response=await fetch('rules/strict-fit-v6-collection.json');
      if(!response.ok)throw Error('Could not load the v6 rules. Try again.');
      const bundle=await response.json();
      if(bundle.revision!=='strict-fit-v6')throw Error('Unexpected rules version.');
      const items=await dbAll(),traits=items.filter(i=>i.kind==='trait');
      if(activeWs!==workspace)throw Error('The project changed. Load v6 again in the intended project.');
      const have=new Set(traits.map(t=>(t.layer||'unsorted')+'/'+ruleImportName(t.name)));
      const missing=Object.entries(bundle.names).flatMap(([layer,names])=>names
        .filter(n=>!have.has(layer+'/'+ruleImportName(n))).map(n=>layer+'/'+n));
      if(missing.length)throw Error('Import the current renamed trait folders first. Missing '+missing.length+
        ' traits, including '+missing.slice(0,5).join(', ')+'. No v6 rules were loaded.');
      const plan=planRuleImport(bundle.rules,traits);
      if(['missingTraits','missingLayers','badOps','ambiguous'].some(k=>plan[k].length)||!plan.order.length)
        throw Error('The v6 rules do not match this project. No v6 rules were loaded.');
      const file=new File([JSON.stringify(bundle.rules)],'strict-fit-v6.json',{type:'application/json'});
      if(!await importRuleFile(file))return;
      if(activeWs!==workspace)return;
      const oldOrder=LAYERS.slice();
      LAYERS=bundle.order.filter(l=>oldOrder.includes(l));
      LAYERS.push(...oldOrder.filter(l=>!LAYERS.includes(l)&&l!=='unsorted'));
      if(oldOrder.includes('unsorted'))LAYERS.push('unsorted');
      try{await saveLayers();}catch(e){LAYERS=oldOrder;throw Error('The rules loaded, but the layer order could not be saved. Set eyes → glasses → hats, with masks last, in Layers.');}
      note.textContent+=' V6 draw order saved. Continue in Review pairs; use Download for LaunchMyNFT above to export your team’s latest answers.';
    }catch(error){note.textContent=error.message||'The v6 rules could not be loaded.';}
    finally{button.disabled=false;}
  };
})();
