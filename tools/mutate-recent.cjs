/* PREDICTIONS for the Last edited list, written before the run.

   A list of ten is the easiest kind of feature to get subtly wrong and have
   nobody notice: ten rows that are not the most recent ten look exactly like
   an answer. So the sort is mutated three different ways, and each is
   predicted against the one test that reads the actual order.

   The control changes a piece of presentation the tests are not supposed to be
   pinning, and predicts nothing moves. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/recent.spec.js',
  ntests: 13,
  mutants: [
    {
      name: 'the list is oldest first',
      find: '  const by=(a,b)=>(typeof b.at==="number"?b.at:-Infinity)\n                 -(typeof a.at==="number"?a.at:-Infinity);',
      with: '  const by=(a,b)=>(typeof a.at==="number"?a.at:-Infinity)\n                 -(typeof b.at==="number"?b.at:-Infinity);',
      kills: ['is the ten most recent, newest first',
        'a trait with no timestamp sorts last rather than vanishing',
        'and the list follows what the project actually holds'],
    },
    {
      name: 'the list is not sorted at all',
      find: '  const top=traits.slice().sort(by).slice(0,RECENT_ROWS);',
      with: '  const top=traits.slice().slice(0,RECENT_ROWS);',
      kills: ['is the ten most recent, newest first',
        'and the list follows what the project actually holds',
        'and a row opens the trait'],
    },
    {
      name: 'a trait with no timestamp goes first instead of last',
      find: '  const by=(a,b)=>(typeof b.at==="number"?b.at:-Infinity)\n                 -(typeof a.at==="number"?a.at:-Infinity);',
      with: '  const by=(a,b)=>(typeof b.at==="number"?b.at:Infinity)\n                 -(typeof a.at==="number"?a.at:Infinity);',
      kills: ['a trait with no timestamp sorts last rather than vanishing'],
    },
    {
      name: 'the cap is off',
      find: '  const top=traits.slice().sort(by).slice(0,RECENT_ROWS);',
      with: '  const top=traits.slice().sort(by);',
      kills: ['is the ten most recent, newest first', 'and says how many of how many'],
    },
    {
      name: 'base characters count as edits',
      find: '  const traits=(items||[]).filter(i=>i&&i.kind==="trait");',
      with: '  const traits=(items||[]).filter(i=>i&&(i.kind==="trait"||i.kind==="ref"));',
      kills: ['a base character is not an edit'],
    },
    {
      name: 'an empty project shows an empty panel',
      find: '  sec.hidden=!traits.length;',
      with: '  sec.hidden=false;',
      kills: ['an empty project has no list at all',
        'and it goes away again when the project is cleared'],
    },
    {
      name: 'the count always states a fraction',
      find: '  count.textContent = traits.length>top.length',
      with: '  count.textContent = traits.length>=top.length',
      kills: ['and just the number when that is all there is'],
    },
    {
      name: 'View more goes nowhere',
      find: '  if(more) more.onclick=()=>showPage("project",true);',
      with: '  if(more) more.onclick=()=>{};',
      kills: ['View more opens the project'],
    },
    {
      name: 'a row does not open its trait',
      find: '    row.onclick=open;',
      with: '    row.onclick=null;',
      kills: ['and a row opens the trait'],
    },
    {
      name: 'agoWords stops reading a number',
      find: '  const t = typeof when==="number" ? when : Date.parse(when||"");',
      with: '  const t = Date.parse(when||"");',
      kills: ['it names the layer and how long ago, in words',
        'a trait with no timestamp sorts last rather than vanishing'],
    },
    {
      name: 'CONTROL: the layer and the time swap places in the row',
      find: '    row.appendChild(ly);',
      with: '    row.insertBefore(ly,row.firstChild);',
      kills: [],
    },
  ],
}));
