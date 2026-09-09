/* Opening a named file, so an agent stops forking the site.

   A person clicks the drop zone and picks a file from a dialog. An agent
   cannot, and that one gap is why a whole separate integration copy of this
   site exists: local-source-import.js was written to put the entry back, and
   everything else followed from having a fork to put it in.

     index.html?source=/imports/whatever.png&name=Whatever

   THE TESTS THAT MATTER ARE THE REFUSALS. A page that fetches whatever path a
   link names is a page that reads files on behalf of whoever wrote the link,
   and every guard here has a test because dropping any one of them is the
   whole difference.

   AND IT STAGES RATHER THAN OPENS. "Entering the editor does not automatically
   recolour, outline or remove a base colour" is the standing workflow rule this
   review pass rests on; a link that opened art by arriving would break it
   before anybody pressed anything.
*/
import { test, expect } from '@playwright/test';

/* Stages a link WITHOUT navigating, so a bad one can be tried without the
   page's own boot swallowing the error. */
const stage = (page, href) => page.evaluate(async (h) => {
  $('err').textContent = '';
  LINKED = null;
  const out = await linkStage(h);
  return { staged: out ? { name: out.name, url: out.url } : null,
    err: $('err').textContent,
    bar: !document.getElementById('linkbar').hidden,
    shown: document.getElementById('linkname').textContent };
}, href);

/* THE SAME PORT THE CONFIG SERVES ON, not a number written twice. This was a
   bare 5771 while playwright.config.js gained PB_PORT so two clones can run on
   one machine - and with the suite on 5772, these six tests quietly navigated
   to whatever was listening on 5771, which was another clone's server, and
   failed with "Failed to fetch" against a page that was not ours. A test that
   can be pointed at somebody else's build by an environment variable it does
   not read is a test of nothing in particular. */
const origin = 'http://127.0.0.1:' + (Number(process.env.PB_PORT) || 5771);

test.describe('a linked source', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof linkStage === 'function');
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
  });

  test('A LINK NAMING A STAGED PNG IS OFFERED, NOT OPENED', async ({ page }) => {
    /* The bar appears and the art does not. Opening is still a press. */
    const r = await stage(page, origin + '/index.html?source=/imports/probe.png&name=Probe');
    expect(r.err, 'nothing went wrong').toBe('');
    expect(r.staged, 'it resolved').toBeTruthy();
    expect(r.staged.name).toBe('Probe');
    expect(r.bar, 'and says so').toBe(true);
    expect(r.shown).toBe('Probe');
    const opened = await page.evaluate(() =>
      !document.getElementById('app').hidden);
    expect(opened, 'but the editor is not open').toBe(false);
  });

  test('and PB.openLinked() is that press, straight to "as it is"',
    async ({ page }) => {
      /* The agent's one call. It goes to Open as it is - the choice that leaves
         every pixel where it is - because any other choice reprocesses art. */
      await stage(page, origin + '/index.html?source=/imports/probe.png&name=Probe');
      await page.evaluate(() => PB.openLinked());
      await page.waitForFunction(() => !document.getElementById('app').hidden,
        null, { timeout: 15000 });
      const r = await page.evaluate(() => ({
        w: art.width, h: art.height, name: fileName,
        /* Every pixel where it was: the fixture is a 24x24 with one red pixel
           at 5,5, and "as it is" must not have rebuilt or rescaled it. */
        at55: [...ctx.getImageData(5, 5, 1, 1).data],
      }));
      expect(r.w + 'x' + r.h, 'the size it was on disk').toBe('24x24');
      expect(r.name).toBe('Probe.png');
      expect(r.at55, 'and the pixel is exactly where it was')
        .toEqual([220, 40, 40, 255]);
    });

  test('A LINK OUTSIDE THE IMPORTS FOLDER IS REFUSED', async ({ page }) => {
    /* THE ONE THAT MATTERS MOST. Without the path rule this fetches whatever a
       link names, which is a page reading files for whoever wrote the link. */
    const r = await stage(page, origin + '/index.html?source=/index.html');
    expect(r.staged).toBe(null);
    expect(r.err).toContain('imports folder');
    expect(r.bar, 'and nothing is offered').toBe(false);
  });

  test('and so is one on another site', async ({ page }) => {
    const r = await stage(page,
      origin + '/index.html?source=https://example.com/imports/x.png');
    expect(r.staged).toBe(null);
    expect(r.err).toContain('imports folder');
  });

  test('and so is a path that climbs out of it', async ({ page }) => {
    /* ../ resolves before the check, so this is really asking whether the
       check runs on the RESOLVED path rather than the text in the link. */
    const r = await stage(page,
      origin + '/index.html?source=/imports/../secret.png');
    expect(r.staged).toBe(null);
    expect(r.err).toContain('imports folder');
  });

  test('and so is a second path segment', async ({ page }) => {
    const r = await stage(page, origin + '/index.html?source=/imports/a/b.png');
    expect(r.staged).toBe(null);
    expect(r.err).toContain('imports folder');
  });

  test('and so is anything that is not a .png', async ({ page }) => {
    const r = await stage(page, origin + '/index.html?source=/imports/probe.json');
    expect(r.staged).toBe(null);
    expect(r.err).toContain('imports folder');
  });

  test('AND BYTES THAT ARE NOT A PNG FAIL VISIBLY WHEN OPENED',
    async ({ page }) => {
      /* THREE LAYERS, AND THIS TEST IS ABOUT WHICH ONE CATCHES WHAT - the
         first draft of it was wrong about that and passed a file it should
         not have.

           the path      says what was ASKED FOR
           Content-Type  says what the server CLAIMS it sent
           decoding      is the only thing that knows what it IS

         This server sets Content-Type from the file extension, so a file
         called .png is announced as image/png whatever is inside it. The
         type check is still worth having - it catches a server answering with
         a login page - but it cannot catch this, and a test that claimed
         otherwise would be resting on a server that happened to lie the right
         way. What catches it is the decode, and it says so out loud. */
      const r = await stage(page, origin + '/index.html?source=/imports/notreally.png');
      expect(r.staged, 'it stages: the server vouched for the type').toBeTruthy();
      const err = await page.evaluate(async () => {
        try { await PB.openLinked(); } catch (_) {}
        await new Promise(r => setTimeout(r, 500));
        return { err: $('err').textContent,
          opened: !document.getElementById('app').hidden };
      });
      expect(err.err, 'and the decode refuses it in as many words')
        .toContain('could not be decoded');
      expect(err.opened, 'nothing was opened').toBe(false);
    });

  test('a page with no link says nothing at all', async ({ page }) => {
    /* The quiet case. An error on every ordinary visit would train everybody
       to ignore the one that matters. */
    const r = await stage(page, origin + '/index.html');
    expect(r.staged).toBe(null);
    expect(r.err).toBe('');
    expect(r.bar).toBe(false);
  });

  test('and a missing file says so rather than offering nothing quietly',
    async ({ page }) => {
      const r = await stage(page, origin + '/index.html?source=/imports/nothere.png');
      expect(r.staged).toBe(null);
      expect(r.err).toContain('could not be loaded');
    });

  test('the name in the link cannot smuggle a path', async ({ page }) => {
    /* It becomes a filename downstream; slashes in it are a directory nobody
       asked for. */
    const r = await stage(page,
      origin + '/index.html?source=/imports/probe.png&name=' + encodeURIComponent('../../x/y'));
    expect(r.staged.name, 'flattened').toBe('..-..-x-y');
  });

  test('and forgetting it puts the page back where it was', async ({ page }) => {
    await stage(page, origin + '/index.html?source=/imports/probe.png&name=Probe');
    await page.click('#linkdrop');
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => ({
      linked: PB.linked(),
      bar: !document.getElementById('linkbar').hidden,
    }));
    expect(r.linked).toBe(null);
    expect(r.bar).toBe(false);
  });
});
