/* The final review pass: 317 traits, one at a time.

   The handoff seeds a queue with stable ids, a sequence, the layer, the
   original and current names, and a pending final-pass state, and asks for a
   pass that walks it.

   THE STABLE ID IS THE PART THIS APP DID NOT HAVE. A trait's key here is
   "t_"+name+"_"+layer+"_"+status, so renaming it makes a DIFFERENT record -
   and the whole point of a queue is that entry 12 is still entry 12 after it
   has been renamed. The queue's id rides on the record as reviewId and
   saveTrait carries it across a rename, the same way it already carries the
   rarity and the server row. The rename test below is the one that matters:
   it renames a trait and then finds it again by id.

   AND NOTHING ARRIVES APPROVED. The handoff is explicit that existing approval
   is not final-pass approval, and the seeded file says 316 pending for that
   reason. A load that carried the file's flags in would start the pass
   pretending work had been done.
*/
import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers.js';

/* Two traits and a small queue naming them, in the shape the real file uses. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  for (const [n, l, v] of [['Backrooms Hallway', 'backgrounds', 80],
    ['Punk Eyes', 'eyes', 140]])
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n,
      layer: l, status: 'approved', blob: await png(v), w: 16, h: 16, at: 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['backgrounds', 'eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

const QUEUE = {
  schemaVersion: 1, collectionRevision: 'strict-fit-v11',
  activeTraitId: 'trait-aaa',
  order: ['backgrounds', 'eyes'],
  traits: [
    { id: 'trait-aaa', sequence: 1, layer: 'backgrounds',
      originalName: 'Backrooms Hallway.png', currentName: 'Backrooms Hallway.png',
      finalName: null, width: 1280, height: 1280,
      reviewStatus: 'in_review', artworkAccepted: false, nameAccepted: false },
    { id: 'trait-bbb', sequence: 2, layer: 'eyes',
      originalName: 'Punk Eyes.png', currentName: 'Punk Eyes.png',
      finalName: null, width: 1280, height: 1280,
      reviewStatus: 'pending', artworkAccepted: false, nameAccepted: false },
    { id: 'trait-ccc', sequence: 3, layer: 'hats',
      originalName: 'Missing Cap.png', currentName: 'Missing Cap.png',
      finalName: null, reviewStatus: 'pending',
      artworkAccepted: false, nameAccepted: false },
  ],
};

const load = (page, doc) => page.evaluate(async (d) => {
  const f = new File([JSON.stringify(d)], 'review-queue.json',
    { type: 'application/json' });
  const ok = await importReviewQueue(f);
  await renderReview();
  return { ok, note: document.getElementById('reviewnote').textContent };
}, doc);

const shown = (page) => page.evaluate(() => ({
  count: document.getElementById('reviewcount').textContent,
  where: document.getElementById('revwhere').textContent,
  was: document.getElementById('revwas').textContent,
  name: document.getElementById('revname').value,
  bodyShown: !document.getElementById('reviewbody').hidden,
  openDisabled: document.getElementById('revopen2').disabled,
  activeId: REVIEW ? REVIEW.activeId : null,
}));

test.describe('the final review pass', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importReviewQueue === 'function');
    await seed(page);
    await gotoPage(page, 'project');
  });

  test('loads the queue and opens at the first trait', async ({ page }) => {
    const r = await load(page, QUEUE);
    expect(r.ok).toBe(true);
    const s = await shown(page);
    /* The whole line, still pinned exactly - the count now carries what is
       left as well as what is done. */
    expect(s.count).toBe('1 of 3, 0 finished, 3 left');
    expect(s.where).toBe('backgrounds — Backrooms Hallway');
    expect(s.name).toBe('Backrooms Hallway');
  });

  test('AND A BARE STATUS STILL ARRIVES UNREVIEWED', async ({ page }) => {
    /* The handoff says existing approval is not final-pass approval. A load
       that honoured the file's own flags would start the pass claiming work
       that nobody in it has done. */
    const pre = JSON.parse(JSON.stringify(QUEUE));
    pre.traits.forEach(t => { t.artworkAccepted = true; t.nameAccepted = true;
      t.reviewStatus = 'approved'; });
    await load(page, pre);
    const flags = await page.evaluate(() =>
      REVIEW.entries.map(e => (e.artworkAccepted ? 'a' : '-') + (e.nameAccepted ? 'n' : '-')));
    expect(flags, 'every one starts unreviewed').toEqual(['--', '--', '--']);
  });

  test('BUT A RECORDED DECISION IS NOT WORK TO DO TWICE', async ({ page }) => {
    /* THE CASE THAT CHANGED, and the difference is a field rather than a
       mood. reviewStatus is the collection calling a trait good, which is the
       thing this pass exists to re-decide. approvedRevision is the pass's own
       receipt: when, the sha of what was approved, and the words the person
       used. Measured on the two real queues - the packaged handoff carries 0
       of these across 317 traits and the live one carries 1, against The
       Backrooms, reading “name is good and edit is good”. */
    const doc = JSON.parse(JSON.stringify(QUEUE));
    doc.traits[0].reviewStatus = 'approved';
    doc.traits[0].artworkAccepted = true;
    doc.traits[0].nameAccepted = true;
    doc.traits[0].approvedRevision = {
      approvedAt: '2026-09-08T17:01:32.928Z',
      userApproval: 'name is good and edit is good',
      approvedSha256: 'c59593b42aa6560546c5680fdacbc5787d72876b297594498400dd583991f682',
    };
    /* And a second entry that CLAIMS approval with no receipt behind it. */
    doc.traits[1].reviewStatus = 'approved';
    doc.traits[1].artworkAccepted = true;
    doc.traits[1].nameAccepted = true;
    const r = await load(page, doc);
    const flags = await page.evaluate(() => REVIEW.entries.map(e =>
      (e.artworkAccepted ? 'a' : '-') + (e.nameAccepted ? 'n' : '-')));
    expect(flags, 'the receipt is honoured, the bare claim is not')
      .toEqual(['an', '--', '--']);
    expect(r.note, 'and it says so rather than starting quietly ahead')
      .toContain('1 already decided in the file');
    expect(r.note, 'naming it, in the words that were used')
      .toContain('name is good and edit is good');
  });

  test('and an empty receipt is not a receipt', async ({ page }) => {
    /* A guard that accepts any object called approvedRevision would let an
       empty one through, which is how a file with the right shape and no
       content ticks a whole pass. */
    const doc = JSON.parse(JSON.stringify(QUEUE));
    doc.traits[0].artworkAccepted = true;
    doc.traits[0].nameAccepted = true;
    doc.traits[0].approvedRevision = { note: 'moved some files' };
    await load(page, doc);
    const flags = await page.evaluate(() => REVIEW.entries.map(e =>
      (e.artworkAccepted ? 'a' : '-') + (e.nameAccepted ? 'n' : '-')));
    expect(flags).toEqual(['--', '--', '--']);
  });

  test('and says which entries have no trait here', async ({ page }) => {
    /* An entry with nothing behind it cannot be reviewed. Drawing an empty box
       without saying why is how somebody concludes the tool is broken. */
    const r = await load(page, QUEUE);
    expect(r.note).toContain('not in this project');
    expect(r.note).toContain('hats/Missing Cap');
  });

  test('next and previous walk it, and the place is remembered',
    async ({ page }) => {
      await load(page, QUEUE);
      await page.click('#revnext');
      await page.waitForTimeout(200);
      expect((await shown(page)).where).toBe('eyes — Punk Eyes');
      /* Written down, not held in a variable: this is what makes 317 traits a
         pass rather than something you start again. */
      const stored = await page.evaluate(async () =>
        (await dbAll()).find(r => r.id === 'settings.review').activeId);
      expect(stored).toBe('trait-bbb');
      await page.click('#revprev');
      await page.waitForTimeout(200);
      expect((await shown(page)).where).toBe('backgrounds — Backrooms Hallway');
    });

  test('and it resumes there after a reload', async ({ page }) => {
    await load(page, QUEUE);
    await page.click('#revnext');
    await page.waitForTimeout(250);
    await page.reload();
    await page.waitForFunction(() => typeof renderReview === 'function');
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      await renderShelf();
    });
    await gotoPage(page, 'project');
    await page.waitForTimeout(400);
    expect((await shown(page)).where, 'the trait that was open').toBe('eyes — Punk Eyes');
  });

  test('artwork and name are two separate answers', async ({ page }) => {
    /* A picture can be right under the wrong name and the reverse, which is
       why the handoff asks for them tracked apart. */
    await load(page, QUEUE);
    await page.click('#revart');
    await page.waitForTimeout(200);
    let s = await shown(page);
    expect(s.was).toContain('artwork ✓');
    expect(s.was).toContain('name pending');
    expect(s.count, 'not finished on one answer').toContain('0 finished');
    await page.click('#revnamed');
    await page.waitForTimeout(400);
    s = await shown(page);
    expect(s.was).toContain('name ✓');
    expect(s.count).toContain('1 finished');
  });

  test('ACCEPTING A NEW NAME RENAMES THE TRAIT AND KEEPS ITS PLACE IN THE QUEUE',
    async ({ page }) => {
      /* THE ONE THAT MATTERS. The record key carries the name, so a rename
         makes a different record - exactly what a queue has to survive. The id
         rides on the record and saveTrait carries it across, so entry 1 is
         still entry 1 afterwards and still finds its artwork. */
      await load(page, QUEUE);
      await page.fill('#revname', 'Backrooms Corridor');
      await page.click('#revnamed');
      await page.waitForTimeout(600);
      const after = await page.evaluate(async () => {
        const traits = (await dbAll()).filter(r => r.kind === 'trait');
        return {
          names: traits.map(t => t.name).sort(),
          ids: traits.map(t => t.id).sort(),
          reviewIds: traits.map(t => t.reviewId || null).sort(),
          entry: REVIEW.entries[0],
        };
      });
      expect(after.names, 'renamed, not duplicated')
        .toEqual(['Backrooms Corridor', 'Punk Eyes']);
      expect(after.ids).toContain('t_Backrooms Corridor_backgrounds_approved');
      expect(after.reviewIds, 'and the queue id came with it').toContain('trait-aaa');
      expect(after.entry.nameAccepted).toBe(true);
      expect(after.entry.finalName).toBe('Backrooms Corridor');
      /* And the panel still finds the artwork for entry 1 under its new name. */
      const s = await shown(page);
      expect(s.where).toBe('backgrounds — Backrooms Corridor');
      expect(s.openDisabled, 'the trait is still reachable').toBe(false);
    });

  test('ACCEPTED MEANS THESE PIXELS: EDITING AFTERWARDS UN-FINISHES IT',
    async ({ page }) => {
      /* THE HOLE THIS CLOSES IS A LAUNCH HOLE. Artwork and name are two
         booleans that know nothing about the picture, so across 317 traits
         you accept one, come back, nudge two pixels, and the tick stays
         green - which makes "284 finished" a number that cannot be trusted
         at exactly the moment it is being used to decide the set is done.

         The acceptance is NOT cleared. "Accepted, then edited" is the thing
         worth seeing, and a tick that un-ticks itself reads as lost work. */
      await load(page, QUEUE);
      await page.click('#revart');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => {
        const e = REVIEW.entries[0];
        return { accepted: e.artworkAccepted, hash: e.artHash, now: e.artHashNow };
      });
      expect(after.accepted).toBe(true);
      expect(after.hash, 'what was accepted, not just that something was')
        .toMatch(/^[0-9a-f]{16}$/);
      expect(after.now, 'and it matches right now').toBe(after.hash);
      await page.fill('#revname', 'Backrooms Hallway');
      await page.click('#revnamed');
      await page.waitForTimeout(500);
      expect((await shown(page)).count, 'finished, for now').toContain('1 finished');

      /* Now edit the artwork the way a person would: open it, paint, save. */
      await page.evaluate(async () => {
        const rec = (await dbAll()).find(r => r.kind === 'trait'
          && r.reviewId === 'trait-aaa');
        await openTraitRecord(rec);
        await new Promise(r => setTimeout(r, 300));
        snapshot();
        ctx.fillStyle = 'rgb(3,3,3)';
        ctx.fillRect(1, 1, 2, 2);
        await saveTrait();
        await new Promise(r => setTimeout(r, 400));
      });
      await page.waitForTimeout(400);
      const drifted = await page.evaluate(() => {
        const e = REVIEW.entries[0];
        return { accepted: e.artworkAccepted, same: e.artHash === e.artHashNow,
          stale: artworkStale(e), done: reviewDone(e) };
      });
      expect(drifted.accepted, 'still shows it was accepted').toBe(true);
      expect(drifted.same, 'but not these pixels').toBe(false);
      expect(drifted.stale).toBe(true);
      expect(drifted.done, 'so it is not finished any more').toBe(false);
    });

  test('and accepting it again makes it true again', async ({ page }) => {
    /* The way out has to be one press, or the flag is a trap rather than a
       measurement. */
    await load(page, QUEUE);
    await page.click('#revart');
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const rec = (await dbAll()).find(r => r.kind === 'trait'
        && r.reviewId === 'trait-aaa');
      await openTraitRecord(rec);
      await new Promise(r => setTimeout(r, 300));
      snapshot();
      ctx.fillStyle = 'rgb(3,3,3)';
      ctx.fillRect(1, 1, 2, 2);
      await saveTrait();
      await new Promise(r => setTimeout(r, 400));
      /* Back out of the editor the way a person does: the review panel is on
         the project page, underneath it, and its buttons are not clickable
         while the editor is over the top. */
      await closeEditor();
      await new Promise(r => setTimeout(r, 300));
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => artworkStale(REVIEW.entries[0]))).toBe(true);
    /* Off, then on: the second press records what is there now. */
    await page.click('#revart');
    await page.waitForTimeout(250);
    await page.click('#revart');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => artworkStale(REVIEW.entries[0])),
      'accepted again, and true again').toBe(false);
  });

  test('an acceptance from before this existed is taken at its word',
    async ({ page }) => {
      /* A queue saved by an older version has accepted flags and no
         fingerprint behind them. Treating those as stale would invalidate
         work somebody really did, on no evidence at all. */
      await load(page, QUEUE);
      const held = await page.evaluate(() => {
        const e = REVIEW.entries[0];
        e.artworkAccepted = true; e.nameAccepted = true;
        e.artHash = null; e.artHashNow = null;
        return { stale: artworkStale(e), done: reviewDone(e) };
      });
      expect(held.stale).toBe(false);
      expect(held.done, 'and it still counts as finished').toBe(true);
    });

  test('and a queue with repeated ids is refused rather than half-loaded',
    async ({ page }) => {
      const bad = JSON.parse(JSON.stringify(QUEUE));
      bad.traits[1].id = 'trait-aaa';
      const r = await load(page, bad);
      expect(r.ok).toBe(false);
      expect(r.note).toContain('repeated ids');
      expect(await page.evaluate(() => REVIEW), 'nothing was started').toBe(null);
    });

  test('and skipping moves on and is remembered', async ({ page }) => {
    await load(page, QUEUE);
    await page.click('#revskip');
    await page.waitForTimeout(300);
    expect((await shown(page)).where).toBe('eyes — Punk Eyes');
    const first = await page.evaluate(() => REVIEW.entries[0]);
    expect(first.skipped).toBe(true);
  });

  test('NEXT UNFINISHED IS HOW YOU COME BACK TO A SKIPPED ONE',
    async ({ page }) => {
      /* The handoff asks for "skip/revisit". Skip was built and revisit was
         not: with 317 entries and a pass done over several sittings, finding
         the next pending one meant pressing Next until it appeared. */
      await load(page, QUEUE);
      /* Finish entry 2 so it has to be stepped over. */
      await page.click('#revnext');
      await page.waitForTimeout(200);
      await page.click('#revart');
      await page.fill('#revname', 'Punk Eyes');
      await page.click('#revnamed');
      await page.waitForTimeout(500);
      /* Back to the first, then jump: it must land on 3, not on the finished 2. */
      await page.click('#revprev');
      await page.waitForTimeout(200);
      await page.click('#revleft');
      await page.waitForTimeout(300);
      expect((await shown(page)).where, 'stepped over the finished one')
        .toBe('hats — Missing Cap');
    });

  test('and it says when it wrapped rather than looking like nothing happened',
    async ({ page }) => {
      /* Reappearing at the top of a 317-entry queue with no word is
         indistinguishable from a dead button. */
      await load(page, QUEUE);
      await page.evaluate(() => { window.__said = [];
        const real = window.toast;
        window.toast = m => { window.__said.push(String(m)); if (real) real(m); }; });
      /* From the last entry, the only way on is round the front. */
      await page.click('#revnext'); await page.waitForTimeout(150);
      await page.click('#revnext'); await page.waitForTimeout(150);
      await page.click('#revleft'); await page.waitForTimeout(300);
      const said = await page.evaluate(() => window.__said.join(' | '));
      expect(said).toContain('Wrapped round to the start');
      expect((await shown(page)).where).toBe('backgrounds — Backrooms Hallway');
    });

  test('and it does not pretend to move when the current one is the last left',
    async ({ page }) => {
      /* Landing back on the entry you are already looking at, with a message
         saying it wrapped, is a button reporting a move it did not make. */
      await load(page, QUEUE);
      /* Finish the first two, then sit on the third and only unanswered one. */
      await page.click('#revart');
      await page.fill('#revname', 'Backrooms Hallway');
      await page.click('#revnamed');
      await page.waitForTimeout(500);
      await page.click('#revnext'); await page.waitForTimeout(200);
      await page.click('#revart');
      await page.fill('#revname', 'Punk Eyes');
      await page.click('#revnamed');
      await page.waitForTimeout(500);
      await page.click('#revnext'); await page.waitForTimeout(200);
      expect((await shown(page)).where, 'on the last one').toBe('hats — Missing Cap');
      await page.evaluate(() => { window.__said = [];
        const real = window.toast;
        window.toast = m => { window.__said.push(String(m)); if (real) real(m); }; });
      await page.click('#revleft');
      await page.waitForTimeout(300);
      const said = await page.evaluate(() => window.__said.join(' | '));
      expect(said, 'it says why it stayed put').toContain('the only one still unanswered');
      expect(said, 'and does not claim to have wrapped').not.toContain('Wrapped');
      expect((await shown(page)).where, 'still here').toBe('hats — Missing Cap');
    });

  test('and the count says how many are left', async ({ page }) => {
    /* At entry 200 of 317 the question is how many remain, not how many are
       done - subtracting in your head is a thing the count should have saved. */
    await load(page, QUEUE);
    expect((await shown(page)).count).toContain('3 left');
    await page.click('#revart');
    await page.fill('#revname', 'Backrooms Hallway');
    await page.click('#revnamed');
    await page.waitForTimeout(500);
    expect((await shown(page)).count).toContain('2 left');
  });

  test('the keys work, and stop the moment you are typing a name',
    async ({ page }) => {
      /* THE GUARD THAT MATTERS. The name box sits inside this panel, so a
         single-letter shortcut that swallows a keystroke mid-name is worse
         than having no shortcut at all. */
      await load(page, QUEUE);
      await page.click('#revwhere');            // focus off any field
      await page.keyboard.press('n');
      await page.waitForTimeout(250);
      expect((await shown(page)).where, 'n moved on').toBe('eyes — Punk Eyes');
      await page.keyboard.press('p');
      await page.waitForTimeout(250);
      expect((await shown(page)).where, 'p went back')
        .toBe('backgrounds — Backrooms Hallway');
      /* Now type into the name box: the letters must land there and move nothing. */
      await page.click('#revname');
      await page.fill('#revname', '');
      await page.type('#revname', 'snap');
      await page.waitForTimeout(250);
      const after = await shown(page);
      expect(after.name, 'every letter went into the field').toBe('snap');
      expect(after.where, 'and none of them navigated')
        .toBe('backgrounds — Backrooms Hallway');
    });

  test('the panel is on the project page and not the others', async ({ page }) => {
    await load(page, QUEUE);
    const tall = () => page.evaluate(() =>
      document.getElementById('review').getBoundingClientRect().height > 0);
    expect(await tall(), 'here').toBe(true);
    await gotoPage(page, 'home');
    expect(await tall(), 'not on the main page').toBe(false);
    await gotoPage(page, 'settings');
    expect(await tall(), 'nor in settings').toBe(false);
  });
});
