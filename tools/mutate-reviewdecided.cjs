/* Can these seventeen tests fail? PREDICTIONS, written before the run.

   This change loosens a rule the handoff asked for, so the mutants are aimed
   at the loosening: the bare status must still mean nothing, an empty receipt
   must still mean nothing, and the adoption must be said out loud.

   The first mutant is the exact defect the rule guards against - treating
   reviewStatus as evidence - rather than a generic "return true", because a
   blunt mutant reds half the file and proves nothing about which test is doing
   the work.
*/
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/reviewqueue.spec.js',
  ntests: 17,
  mutants: [
    /* The defect this exists to prevent: the collection's own status counted
       as a decision made during the final pass. */
    { name: 'a bare reviewStatus counts as a recorded decision',
      find: '  const r=e&&e.approvedRevision;',
      with: '  const r=(e&&e.approvedRevision)||(e&&e.reviewStatus==="approved"?{approvedAt:1}:null);',
      kills: ['A BARE STATUS STILL ARRIVES UNREVIEWED',
        'A RECORDED DECISION IS NOT WORK TO DO TWICE'] },

    /* A receipt with nothing in it: the right shape, no content. */
    { name: 'an empty receipt counts as a decision',
      find: '  if(!r.approvedAt&&!r.approvedSha256&&!r.userApproval) return null;',
      with: '  if(false) return null;',
      kills: ['an empty receipt is not a receipt'] },

    /* The decision is read and then ignored. */
    { name: 'the flags are not adopted from the receipt',
      find: '      artworkAccepted:!!(decided&&decided.artwork),',
      with: '      artworkAccepted:false,',
      kills: ['A RECORDED DECISION IS NOT WORK TO DO TWICE'] },

    /* Adopted in silence, which is the same failure pointing the other way. */
    { name: 'the pass starts with entries ticked and does not say so',
      find: '  if(already.length) bits.push(already.length+" already decided in the file"',
      with: '  if(false) bits.push(already.length+" already decided in the file"',
      kills: ['A RECORDED DECISION IS NOT WORK TO DO TWICE'] },
  ],
}));
