/* THE FIX PIXELS PAGE: A ROW THAT HOLDS STILL, AND ROOM TO SEE.

   "when im chosing a pixell size and the text beside it gets to a new point
   it moves the whole area ... (causes accidental clicks on import a image
   button, make the whole fit pixels screen better in the sense where we can
   make previews bigger and show the previously edited work on the right side
   of the screen and have (last edited on main but for fix pixels) make those
   pages fill the screen"

   The readout lived inside the control row, and the row wraps - so every time
   the sentence changed length the row relaid out around it. Measured before,
   stepping the size through 0, 4, 8, 12, 16, 24 and 3:

     1440 wide   row 63 / 90 / 117 px; Snap moved from 1148,436 to 153,491,
                 a line down and 995px to the left; Fix it moved down 54px
      900 wide   row 63 / 90 / 135 - a 72px swing
*/
import { test, expect } from '@playwright/test';

const ready = async (page, w) => {
  await page.setViewportSize({ width: w, height: 950 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRecentAdd === 'function');
};

/* Pixel art of any size, in blocks. Wrapped in parentheses at every call
   site: this string starts with a newline, and `return` followed by one is
   `return;` - which handed fixBatch an array of undefined. */
const art = (S, cell, name) => `
  (async () => {
    const c = document.createElement('canvas');
    c.width = ${S}; c.height = ${S};
    const g = c.getContext('2d');
    for (let y = 0; y < ${S} / ${cell}; y++) for (let x = 0; x < ${S} / ${cell}; x++) {
      g.fillStyle = ['#2e222f', '#8b5fbf', '#f2a65a', '#e8d5b7'][(x * 5 + y * 3) % 4];
      g.fillRect(x * ${cell}, y * ${cell}, ${cell}, ${cell});
    }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    return new File([b], ${JSON.stringify(name)}, { type: 'image/png' });
  })()
`;

const openFixer = (page, src) => page.evaluate(async (s) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  showPage('fixer', false);
  // eslint-disable-next-line no-new-func
  const f = await new Function('return (' + s + ')')();
  await fixLoad(f);
  const sn = document.getElementById('fixsnap');
  sn.checked = false; sn.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('fixforce').disabled = false;
}, src);

const IDS = ['fixmode', 'fixforce', 'fixgrid', 'fixsnap', 'fixrun', 'fixdrop', 'fixfolderbtn'];

const boxes = (page) => page.evaluate((ids) => {
  const o = {};
  for (const id of ids) {
    const r = document.getElementById(id).getBoundingClientRect();
    o[id] = Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width);
  }
  o.__row = Math.round(document.querySelector('#fixer .agjob').getBoundingClientRect().height);
  o.__say = Math.round(document.getElementById('fixsize').getBoundingClientRect().height);
  o.__text = document.getElementById('fixsize').textContent;
  return o;
}, IDS);

for (const W of [1440, 1180, 900]) {
  test('NOTHING IN THE CONTROL ROW MOVES WHEN THE READOUT CHANGES, at ' + W,
    async ({ page }) => {
      await ready(page, W);
      await openFixer(page, art(96, 4, 'p.png'));
      const seen = [];
      for (const v of [0, 4, 8, 12, 16, 24, 3]) {
        await page.evaluate((n) => {
          const f = document.getElementById('fixforce');
          f.value = String(n); f.dispatchEvent(new Event('input', { bubbles: true }));
        }, v);
        seen.push(await boxes(page));
      }
      /* THE POSITIVE CONTROL FIRST: the readout really did change, or this
         passes on a page where nothing was ever going to move. */
      expect(new Set(seen.map(s => s.__text)).size,
        'the readout said several different things').toBeGreaterThan(3);
      /* And no control moved a pixel through any of it. */
      const moved = IDS.filter(id => new Set(seen.map(s => s[id])).size > 1);
      expect(moved, 'controls that moved while the sentence changed').toEqual([]);
      /* The row and the readout line both hold their height, so what is below
         them - the previews and the buttons under those - holds still too. */
      expect(new Set(seen.map(s => s.__row)).size, 'the row keeps its height').toBe(1);
      expect(new Set(seen.map(s => s.__say)).size, 'and so does the readout line').toBe(1);
    });
}

test('THE PAGE FILLS THE SCREEN AND THE PREVIEWS TAKE THE ROOM', async ({ page }) => {
  await ready(page, 1920);
  await openFixer(page, art(96, 4, 'p.png'));
  const r = await page.evaluate(() => ({
    panel: Math.round(document.getElementById('fixer').getBoundingClientRect().width),
    preview: Math.round(document.getElementById('fixbefore').getBoundingClientRect().width),
    doc: Math.round(document.documentElement.scrollWidth),
    view: window.innerWidth,
  }));
  /* Was 1180 and 420 on a 1920 screen - 740px of empty page beside two
     previews at a third of a trait's size. */
  expect(r.panel, 'the panel is most of the screen').toBeGreaterThan(1700);
  expect(r.preview, 'and the preview is well past the old 420 cap').toBe(720);
  /* A 96vw panel is how a page picks up a sideways scrollbar. */
  expect(r.doc, 'and nothing overflows sideways').toBe(r.view);
});

test('and the pages made of prose keep their column', async ({ page }) => {
  await ready(page, 1920);
  /* THE CONTROL. Widening .panelbox itself would pass the test above and set
     every paragraph on the site to a 1900px line. */
  const r = await page.evaluate(() => {
    try { authed = true; } catch (_) {} gateShow(false);
    showPage('agent', false);
    const s = [...document.querySelectorAll('.panelbox')]
      .find(e => e.offsetParent !== null);
    return s ? Math.round(s.getBoundingClientRect().width) : -1;
  });
  expect(r, 'the agent page is still a readable column').toBe(1180);
});

test('WHAT YOU ALREADY FIXED IS ON THE RIGHT, AND SURVIVES THE NEXT RUN',
  async ({ page }) => {
    await ready(page, 1600);
    const r = await page.evaluate(async (srcs) => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      showPage('fixer', false);
      // eslint-disable-next-line no-new-func
      const mk = (s) => new Function('return (' + s + ')')();
      const before = document.getElementById('fixrail').hidden;
      await fixBatch([await mk(srcs.a), await mk(srcs.b)]);
      const afterOne = document.querySelectorAll('#fixrecentbody .frow').length;
      /* The grid is emptied at the start of every run and its thumbnails
         revoked. Surviving that is the entire point of this list. */
      await fixBatch([await mk(srcs.c)]);
      const names = [...document.querySelectorAll('#fixrecentbody .rname')]
        .map(n => n.textContent);
      const live = [...document.querySelectorAll('#fixrecentbody img')]
        .every(i => i.src.indexOf('blob:') === 0);
      /* And a single image lands on the same list. */
      await fixLoad(await mk(srcs.d));
      await fixRun();
      await new Promise(res => setTimeout(res, 400));
      const withSingle = [...document.querySelectorAll('#fixrecentbody .rname')]
        .map(n => n.textContent);
      const rail = document.getElementById('fixrail').getBoundingClientRect();
      const work = document.querySelector('.fixwork').getBoundingClientRect();
      return { before, afterOne, names, live, withSingle,
        rightOfWork: Math.round(rail.left) >= Math.round(work.right),
        count: document.getElementById('fixrecentcount').textContent };
    }, { a: art(640, 5, 'a.png'), b: art(640, 8, 'b.png'),
      c: art(320, 4, 'c.png'), d: art(96, 4, 'd.png') });

    expect(r.before, 'hidden until there is something in it').toBe(true);
    expect(r.afterOne, 'both files from the first run').toBe(2);
    /* NEWEST FIRST, and the two from the run before are still there. */
    expect(r.names).toEqual(['c-fixed.png', 'b-fixed.png', 'a-fixed.png']);
    expect(r.live, 'and their thumbnails were not revoked with the grid').toBe(true);
    expect(r.withSingle[0], 'a single run goes on the same list').toBe('d-fixed.png');
    expect(r.count).toBe('4');
    expect(r.rightOfWork, 'the list is beside the work, not under it').toBe(true);
  });

test('and it is capped, revoking what falls off the end', async ({ page }) => {
  await ready(page, 1600);
  const r = await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    showPage('fixer', false);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const revoked = [];
    const real = URL.revokeObjectURL;
    URL.revokeObjectURL = (u) => { revoked.push(u); return real.call(URL, u); };
    try {
      for (let i = 0; i < 30; i++) {
        fixRecentAdd({ name: 'n' + i + '.png', data: new Uint8Array([1]),
          cells: 160, w: 1280, h: 1280, tw: 40, th: 40 }, blob);
      }
    } finally { URL.revokeObjectURL = real; }
    return { rows: document.querySelectorAll('#fixrecentbody .frow').length,
      first: document.querySelector('#fixrecentbody .rname').textContent,
      revoked: revoked.length,
      count: document.getElementById('fixrecentcount').textContent };
  });
  /* 24 kept, newest first, and the six that fell off gave their thumbnails
     back - an object URL is not collected on its own. */
  expect(r.rows).toBe(24);
  expect(r.first).toBe('n29.png');
  expect(r.revoked).toBe(6);
  expect(r.count).toBe('the last 24');
});

test('and a row opens that picture in the editor', async ({ page }) => {
  await ready(page, 1600);
  const r = await page.evaluate(async (src) => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    showPage('fixer', false);
    // eslint-disable-next-line no-new-func
    await fixBatch([await new Function('return (' + src + ')')()]);
    document.querySelector('#fixrecentbody .frow').click();
    await new Promise(res => setTimeout(res, 400));
    return { w: art.width, h: art.height, name: fileName };
  }, art(640, 5, 'openme.png'));
  /* The same thing the batch tiles do, from the list that outlives them. */
  expect(r.w + 'x' + r.h).toBe('1280x1280');
  expect(r.name).toContain('openme');
});

test('THE ROW IS ONE LINE, AND FIX IT IS THE SIZE OF ITS WORDS', async ({ page }) => {
  await ready(page, 1600);
  await openFixer(page, art(96, 4, 'p.png'));
  const r = await page.evaluate(() => {
    const row = document.querySelector('#fixer .agjob').getBoundingClientRect();
    const run = document.getElementById('fixrun').getBoundingClientRect();
    const snap = document.getElementById('fixsnap').getBoundingClientRect();
    return { rowH: Math.round(row.height), runW: Math.round(run.width),
      rowW: Math.round(row.width), snapLeft: Math.round(snap.left) };
  });
  /* Was 63px - two lines - with Fix it 1180px wide on the second and the
     switches shoved to the far right by a margin-left:auto. */
  expect(r.rowH, 'one line').toBeLessThan(50);
  expect(r.runW, 'not a bar across the screen').toBeLessThan(200);
  expect(r.snapLeft, 'and the switches sit with the rest, not at the far edge')
    .toBeLessThan(r.rowW / 2 + 200);
});

test('and on a narrow screen the button goes back to full width', async ({ page }) => {
  await ready(page, 420);
  /* THE CONTROL for the rule above. Below 760 the row stacks, and a button
     sized to its words in a stacked column is a small target in a lot of
     empty space - which is what width:100% is right for. */
  await openFixer(page, art(96, 4, 'p.png'));
  const r = await page.evaluate(() => {
    const run = document.getElementById('fixrun').getBoundingClientRect();
    const row = document.querySelector('#fixer .agjob').getBoundingClientRect();
    return { run: Math.round(run.width), row: Math.round(row.width),
      doc: Math.round(document.documentElement.scrollWidth), view: window.innerWidth };
  });
  expect(r.run, 'the full width of the row').toBe(r.row);
  expect(r.doc, 'and the phone has no sideways scroll').toBe(r.view);
});

/* ---- the page is the screen, not a card in the middle of it -------- */

const showFixer = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  showPage('fixer', false);
  await new Promise(r => setTimeout(r, 200));
});

for (const H of [1000, 1400]) {
  test('THE PANEL IS THE PAGE, at a window ' + H + ' tall', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: H });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixRecentAdd === 'function');
    await showFixer(page);
    const r = await page.evaluate(() => {
      const b = document.getElementById('fixer').getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom),
        view: window.innerHeight };
    });
    /* Was y378 to y744 in a 1000px window - 378px of ground above it and 256
       below, 63% of the screen empty, on the one page that is a workbench. */
    expect(r.top, 'it starts near the top').toBeLessThan(220);
    expect(r.view - r.bottom, 'and ends at the bottom').toBeLessThan(60);
  });
}

test('and nothing from another page comes with it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRecentAdd === 'function');
  await showFixer(page);
  /* THE GUARD FOR WHAT THIS BROKE ONCE. The page-hiding rules are one id, one
     attribute and one class; so is `#land[data-page="fixer"] .panelbox`, and
     it is written later - so a display declared on THAT beats their
     display:none. The first version of the fill did exactly that and the
     Agent panel came back, 493px tall, on the Fix pixels page. */
  const r = await page.evaluate(() => {
    const shown = [...document.querySelectorAll('#land > section, #land > div')]
      .filter(e => getComputedStyle(e).display !== 'none')
      .map(e => e.id || e.className.split(' ')[0]);
    return { shown, agent: getComputedStyle(document.querySelector('.pg-agent')).display };
  });
  expect(r.agent, 'the agent page stays on the agent page').toBe('none');
  expect(r.shown.filter(n => /pg-|panelbox/.test(n)),
    'no other page section is showing').toEqual([]);
});

test('THE BUTTON ROWS ARE ROWS', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRecentAdd === 'function');
  const r = await page.evaluate(async (srcs) => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    showPage('fixer', false);
    // eslint-disable-next-line no-new-func
    const mk = (s) => new Function('return (' + s + ')')();
    await fixBatch([await mk(srcs.a), await mk(srcs.b)]);
    const top = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
    const wide = (id) => Math.round(document.getElementById(id).getBoundingClientRect().width);
    return { dl: top('fixbatchdl'), sv: top('fixbatchsave'),
      dlW: wide('fixbatchdl'), svW: wide('fixbatchsave'),
      tile: Math.round(document.querySelector('.fixtile img').getBoundingClientRect().width),
      note: Math.round(document.querySelector('#fixer > .note').getBoundingClientRect().width) };
  }, { a: art(640, 5, 'a.png'), b: art(640, 8, 'b.png') });
  /* .btnrow has always said .btnrow .btn{flex:1} and never had a flex parent
     to hear it, so every bare one was a column of buttons shrunk to their
     words: measured at y782 and y816, 138px and 121px wide. */
  expect(r.dl, 'both batch buttons on one line').toBe(r.sv);
  expect(r.dlW, 'and the same width as each other').toBe(r.svW);
  expect(r.dlW, 'without being stretched across the workbench').toBeLessThan(400);
  /* A folder run is what this page is for and its results were 110px square. */
  expect(r.tile, 'the results are big enough to judge').toBeGreaterThan(180);
  /* And the prose is a line, not a banner: it was 1498px once the panel grew. */
  expect(r.note, 'the explanation is still readable').toBeLessThan(800);
});

test('AN EMPTY PAGE IS ALL DROP ZONE, AND KEEPS NO ROOM FOR A HIDDEN RAIL',
  async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixRecentAdd === 'function');
    await showFixer(page);
    const r = await page.evaluate(() => {
      const drop = document.getElementById('fixdrop').getBoundingClientRect();
      const work = document.querySelector('.fixwork').getBoundingClientRect();
      const cols = document.querySelector('.fixcols').getBoundingClientRect();
      return { dropH: Math.round(drop.height), dropTop: Math.round(drop.top),
        rowTop: Math.round(document.querySelector('#fixer .agjob').getBoundingClientRect().top),
        workW: Math.round(work.width), colsW: Math.round(cols.width),
        railHidden: document.getElementById('fixrail').hidden };
    });
    expect(r.railHidden, 'nothing fixed yet').toBe(true);
    /* A grid track exists whether or not anything is placed in it, so the
       hidden aside was costing 300px of width on an empty page. */
    expect(r.colsW - r.workW, 'no column kept for a rail that is not there')
      .toBeLessThan(4);
    /* The dropzone is the page while it is the only thing on it - it was a
       150px box with 463px of empty panel underneath. */
    expect(r.dropH, 'the drop target is the panel').toBeGreaterThan(400);
    /* And the controls are still below it, not above: .drop carries order:3
       from the landing grid and that reaches into any flex parent. */
    expect(r.rowTop, 'the controls stay under the drop zone')
      .toBeGreaterThan(r.dropTop);
  });

test('and it gives the room back the moment there is something to show',
  async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixRecentAdd === 'function');
    /* THE CONTROL. A dropzone that always grew would pass the test above and
       push every preview off the bottom of the page. */
    await openFixer(page, art(96, 4, 'p.png'));
    const r = await page.evaluate(() => ({
      dropH: Math.round(document.getElementById('fixdrop').getBoundingClientRect().height),
      pairShown: !document.getElementById('fixpair').hidden,
    }));
    expect(r.pairShown, 'a picture is loaded').toBe(true);
    expect(r.dropH, 'and the drop zone is back to its own size').toBeLessThan(260);
  });
