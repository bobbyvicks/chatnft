import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveCatalog, diffCatalog, byKey, verifyCapture, rowHash, PROJECT_REF } from './catalog.mjs';
import { findSecrets } from '../secrets.mjs';

test('the capture is PixelBench\'s, from before A0, holds schema only, and no secret', () => {
  const live = loadLiveCatalog();
  assert.equal(live.project, PROJECT_REF);
  const keys = new Set(live.rows.map(r => r.k));
  assert.ok(keys.has('col|team_members|user_id'), 'no team_members: not the PixelBench project');
  assert.ok(![...keys].some(k => k.startsWith('col|posts|')), 'a posts table: this is not PixelBench');
  assert.ok(!keys.has('col|collections|protocol') && !keys.has('col|traits|replaces'), 'captured after A0');
  assert.ok(keys.has('col|collections|rules'), 'the live-only rules column is missing from the capture');
  for (const k of keys)
    assert.match(k, /^(col|con|idx|pol|trg|rls|priv|fn|schema|own|role|defacl|meta)\|/, 'an unknown kind of row: ' + k);
  /* The raw strings, not JSON.stringify's escaped ones: a quoted header
     inside a trigger's arguments would hide behind the escapes. */
  const text = live.rows.map(r => Object.values(r).filter(v => typeof v === 'string').join('\n')).join('\n');
  assert.deepEqual(findSecrets(text), [], 'something secret-shaped is in the capture');
});

test('the capture is exactly what live returned: its count, its keys, every row against its own hash', () => {
  assert.deepEqual(verifyCapture(loadLiveCatalog()), []);
});

test('calibration: the check sees a dropped row, a changed body and a flipped boolean', () => {
  const live = loadLiveCatalog();
  const copy = () => ({ check: live.check, rows: live.rows.map(r => Object.assign({}, r)) });
  const dropped = copy(); dropped.rows.splice(Math.floor(dropped.rows.length / 2), 1);
  assert.ok(verifyCapture(dropped).some(p => p.startsWith('n:')), 'a dropped row went unseen');
  const body = copy(); const withDef = body.rows.find(r => typeof r.def === 'string' && rowHash(r) !== null);
  withDef.def = withDef.def.replace(/.$/s, c => (c === ' ' ? '_' : ' '));
  assert.ok(verifyCapture(body).some(p => p.includes(withDef.k)), 'a changed character went unseen');
  const flag = copy(); const priv = flag.rows.find(r => r.k.startsWith('priv|'));
  priv.has = !priv.has;
  assert.ok(verifyCapture(flag).some(p => p.includes(priv.k)), 'a flipped boolean went unseen');
});

test('the diff sees one changed row and nothing else - its calibration', () => {
  const a = [{ k: 'col|t|a', type: 'integer' }, { k: 'col|t|b', type: 'text' }, { k: 'meta|x', v: 1 }];
  const b = [{ k: 'col|t|a', type: 'integer' }, { k: 'col|t|b', type: 'uuid' }, { k: 'meta|x', v: 2 }];
  assert.deepEqual(diffCatalog(a, a), []);
  assert.deepEqual(diffCatalog(a, b).map(d => d.k), ['col|t|b']);
  assert.deepEqual(diffCatalog(a, b.slice(1)).map(d => d.k), ['col|t|a', 'col|t|b']);
});

test('two rows with one key are refused, not merged', () => {
  assert.throws(() => byKey([{ k: 'x' }, { k: 'x' }]), /share the key/);
});
