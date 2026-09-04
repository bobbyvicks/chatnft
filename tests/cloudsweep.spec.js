/* The storage sweep had the bug its sibling was fixed for the same day.

   cloudRows was rewritten to page properly, with a comment saying completion
   must NOT be inferred from a short batch. cloudSweep, thirty lines away in the
   same file, still did exactly that, and had a hard page ceiling on top.

   Measured with an empty keep-list, so every file in the bucket is an orphan
   and "how many did it find" is readable from what it removes:

     files   server cap   list calls   swept   MISSED
     2,500      100           20       2,000     500    the 20-page ceiling
       300       50            1          50     250    the short-batch stop
        40      100            1          40       0    control, correct

   The second is the sharper one: a server returning 50 when asked for 100 makes
   every full page look short, so it stopped after ONE and found 17% of them.

   IT IS INVISIBLE RATHER THAN DESTRUCTIVE, which is why it could sit there.
   The sweep only deletes what the keep-list does not name, so seeing less means
   deleting less - orphaned PNGs pile up in the bucket, nothing lists them, and
   the push reports success either way.

   THE LAST TEST IS THE ONE THAT MATTERS MOST. Making the sweep see more is only
   safe if it still refuses to delete anything the keep-list names. A sweep that
   found everything and deleted a live image would be far worse than one that
   found too little.
*/
import { test, expect } from '@playwright/test';

/* Runs the real cloudSweep against a bucket of `total` files served `cap` at a
   time, keeping whatever `keep` names. */
const sweep = (page, total, cap, keep) => page.evaluate(async ([n, c, keepList]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));

  const files = [];
  for (let i = 0; i < n; i++) files.push({ name: 'f' + String(i).padStart(5, '0') + '.png' });
  let listCalls = 0, deleteCalls = 0, deletedPaths = [];
  const real = window.fetch;
  const json = (o) => new Response(JSON.stringify(o),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (u, o) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/storage/v1/object/list') >= 0) {
      listCalls++;
      const b = JSON.parse(o.body);
      // The server honours its OWN cap, which may be lower than the limit asked
      // for - that is the case the short-batch stop got wrong.
      return json(files.slice(b.offset, b.offset + Math.min(b.limit, c)));
    }
    if (s.indexOf('/storage/v1/object/traits') >= 0 && (o && o.method) === 'DELETE') {
      deleteCalls++;
      deletedPaths = JSON.parse(o.body).prefixes;
      return json({});
    }
    return real(u, o);
  };
  let swept = 0;
  try { swept = await cloudSweep('team1', { id: 'c1' }, keepList); } finally { window.fetch = real; }
  return { swept, missed: n - swept, listCalls, deleteCalls, deletedPaths };
}, [total, cap, keep || []]);

const keepAll = (n) => {
  const a = [];
  for (let i = 0; i < n; i++) a.push('team1/c1/f' + String(i).padStart(5, '0') + '.png');
  return a;
};

test.describe('clearing up orphaned images', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudSweep === 'function');
  });

  test('a bucket past the old ceiling is swept whole', async ({ page }) => {
    // 20 pages of 100 was a silent ceiling at 2,000: a bucket of 2,500 kept 500
    // orphans forever and the push said nothing.
    const r = await sweep(page, 2500, 100);
    expect(r.swept, 'every orphan').toBe(2500);
    expect(r.missed).toBe(0);
    expect(r.listCalls, 'which takes more than the old twenty').toBeGreaterThan(20);
  });

  test('a server capping below the requested limit does not stop it', async ({ page }) => {
    // The case the short-batch stop got wrong, and the same one cloudRows was
    // fixed for. Every full page looks short, so it stopped after one.
    const r = await sweep(page, 300, 50);
    expect(r.swept, 'still every orphan').toBe(300);
    expect(r.listCalls, 'across several pages').toBeGreaterThan(1);
  });

  test('an ordinary bucket is unchanged', async ({ page }) => {
    // The control at the other end: paging must not make the common case worse
    // or spin on it.
    const r = await sweep(page, 40, 100);
    expect(r.swept).toBe(40);
    expect(r.listCalls, 'one page and one to find the end').toBeLessThanOrEqual(2);
  });

  test('an empty bucket costs one call and deletes nothing', async ({ page }) => {
    const r = await sweep(page, 0, 100);
    expect(r.swept).toBe(0);
    expect(r.listCalls).toBe(1);
    expect(r.deleteCalls, 'nothing to remove, so nothing is asked').toBe(0);
  });

  test('and it still never deletes an image the collection is using', async ({ page }) => {
    // THE ONE THAT MATTERS. Making the sweep see MORE is only safe while it
    // still refuses everything the keep-list names - finding everything and
    // deleting a live image would be far worse than finding too little.
    const r = await sweep(page, 40, 100, keepAll(40));
    expect(r.deleteCalls, 'not one delete is issued').toBe(0);
    expect(r.swept, 'and it reports removing nothing').toBe(0);
  });

  test('a keep-list covering some of them removes exactly the rest', async ({ page }) => {
    // The positive control for the one above: it must still delete what is
    // genuinely orphaned, or "deletes nothing" would pass by doing nothing.
    const r = await sweep(page, 40, 100, keepAll(30));
    expect(r.swept, 'the ten that nothing points at').toBe(10);
    expect(r.deleteCalls).toBe(1);
    for (const p of r.deletedPaths) {
      const n = parseInt(p.match(/f(\d+)\.png$/)[1], 10);
      expect(n, 'and never one of the thirty being kept').toBeGreaterThanOrEqual(30);
    }
  });
});
