/* A MESSAGE STAYS UP LONG ENOUGH TO READ IT.

   Every toast was on screen for 1.7 seconds, whatever it said. Fine for
   "Saved"; not fine for what a save inside a group can produce:

     Saved cap here only - this account is not allowed to write to the
     group. Ask whoever set it up to add you. - saved at 1280x1280, which
     is not on the collection 8 cell grid - 34 edge pixels set to black by
     the collection border rule

   54 words in 1.7 seconds is 1,900 words a minute. Reading plain prose is
   around 200 to 250, so what somebody actually got was the first five or six
   words - which for a message shaped as "what happened, then why" is the half
   they already knew.

   THE CONTROL IS THE POINT. Most of what this page says is short, and a
   version that simply made every message longer-lived would pass a test about
   long ones. Short messages come out at exactly the 1700 they had.
*/
import { test, expect } from '@playwright/test';

const ms = (page, m) => page.evaluate(msg => toastMs(msg), m);

test.describe('how long a message stays on screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof toastMs === 'function');
  });

  test('SHORT MESSAGES ARE UNCHANGED - the control', async ({ page }) => {
    /* The floor is the number that was there, so the shortest messages read
       exactly as they did. These are real messages this page sends.

       THREE WORDS, NOT FIVE. I wrote five here first and the patch script's
       own check refused it: 700 + 280*4 is 1820, which is over the floor.
       The boundary is asserted rather than described, because a floor nobody
       has measured is a number somebody hopes is right. */
    for (const m of ['Saved', 'Signed out', 'Order saved', 'Deleted'])
      expect(await ms(page, m), m).toBe(1700);
    /* And just past it, so the floor is known to END somewhere - otherwise
       this test also passes on a version that returns 1700 for everything. */
    expect(await ms(page, 'Order saved for the group'), 'five words is past the floor')
      .toBe(2100);
  });

  test('AND A LONG ONE GETS THE TIME IT NEEDS', async ({ page }) => {
    const m = 'cap is in the final project here only - this account is not'
      + ' allowed to write to the group. Ask whoever set it up to add you.';
    const got = await ms(page, m);
    /* 27 words. At the old 1.7 seconds that is 950 words a minute. */
    expect(got, 'well past the old fixed 1700').toBeGreaterThan(5000);
    expect(got / (m.trim().split(/\s+/).length), 'and it is paced by reading, not by a guess')
      .toBeGreaterThan(200);
  });

  test('the ceiling holds, and is an admission rather than a fit',
    async ({ page }) => {
      /* The longest messages want something that stays until it is dismissed.
         Nine seconds is where a bar that vanishes on its own stops being
         reasonable, and this pins that it is a ceiling rather than a number
         that happens to cover everything. */
      const huge = new Array(200).fill('word').join(' ');
      expect(await ms(page, huge)).toBe(9000);
    });

  test('and nothing about it can throw', async ({ page }) => {
    /* toast is called from catch blocks. A length routine that threw on an
       empty string would turn a handled failure into an unhandled one. */
    for (const m of ['', '   ', null, undefined, 0])
      expect(await page.evaluate(x => toastMs(x), m)).toBe(1700);
  });

  test('THE MESSAGE IS REALLY STILL THERE, on the page', async ({ page }) => {
    /* Not the arithmetic - the element. A duration nothing reads is a
       constant. */
    const seen = await page.evaluate(async () => {
      const el = document.getElementById('toast');
      const m = 'cap is in the final project here only - this account is not'
        + ' allowed to write to the group. Ask whoever set it up to add you.';
      /* THE SECOND WAIT IS DERIVED, NOT TYPED. I typed 8.2 seconds first and
         the message lasts 8.26 - a test that fails by 60ms reads as a flake
         and is really an author who did the arithmetic in their head. */
      const want = toastMs(m);
      const t0 = Date.now();
      toast(m);
      const at = until => new Promise(r => setTimeout(
        () => r(el.classList.contains('show')), Math.max(0, until - (Date.now() - t0))));
      const early = await at(2200);          /* past the old 1700 */
      const late = await at(want + 400);
      return { early, late, want };
    });
    expect(seen.early, 'still up where it used to have gone').toBe(true);
    expect(seen.late, 'and gone once there was time to read it').toBe(false);
  });

  test('and a short message still goes away on time - the other control',
    async ({ page }) => {
      const seen = await page.evaluate(async () => {
        const el = document.getElementById('toast');
        toast('Saved');
        await new Promise(r => setTimeout(r, 2100));
        return el.classList.contains('show');
      });
      expect(seen).toBe(false);
    });

  test('A SECOND MESSAGE IS NOT CUT SHORT BY THE FIRST', async ({ page }) => {
    /* One timer was shared by every message. A long one arriving while a
       short one was up inherited whatever was left of the short one - which
       was invisible while every message lasted the same time. */
    const stillUp = await page.evaluate(async () => {
      const el = document.getElementById('toast');
      toast('Saved');
      await new Promise(r => setTimeout(r, 300));
      toast('cap is in the final project here only - this account is not'
        + ' allowed to write to the group. Ask whoever set it up to add you.');
      await new Promise(r => setTimeout(r, 2200));
      return el.classList.contains('show');
    });
    expect(stillUp, 'the long one keeps its own time').toBe(true);
  });
});
