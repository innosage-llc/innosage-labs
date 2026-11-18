import assert from 'node:assert/strict';
import test from 'node:test';
import { draftStore, draftText } from './draftDocumentModel.ts';

const key = {pageId: 'page', kind: 'transcript'};
const content = value => [{id: 'page', type: 'tiptap', content: JSON.stringify({
  type: 'doc', content: [{type:'paragraph', content:[{type:'text', text:value}]}, {type:'paragraph'}],
})}];
const memory = () => {
  let saved = null;
  return {read:async () => saved, write:async contents => { saved = contents; }};
};

test('retains a committed revision across fresh owners and repeated acknowledgments', async () => {
  const disk = memory();
  const a = draftStore(key, disk);
  assert.equal(await a.recover(), undefined);
  assert.equal((await a.commit(0, content('陈宁'))).revision, 1);
  const b = draftStore(key, disk);
  assert.equal(draftText(await b.recover()), '陈宁\n');
  assert.equal((await b.commit(0, content('陈宁'))).revision, 1);
  await assert.rejects(b.commit(0, content('陈安')), /changed/);
  assert.equal((await b.commit(1, content('陈宁已核对'))).revision, 2);
  assert.equal(draftText(await a.recover()), '陈宁已核对\n');
});

test('serializes overlapping owners for the same identity', async () => {
  const disk = memory();
  const a = draftStore(key, disk);
  const b = draftStore(key, disk);
  const out = await Promise.allSettled([a.commit(0, content('first')), b.commit(0, content('second'))]);
  assert.equal(out[0].status, 'fulfilled');
  assert.equal(out[1].status, 'rejected');
  assert.equal(draftText(await a.recover()), 'first\n');
});

test('does not acknowledge failed persistence and can save again without losing the prior revision', async () => {
  const disk = memory();
  const a = draftStore(key, disk);
  await a.commit(0, content('saved'));
  const b = draftStore(key, {...disk, write: async () => { throw new Error('disk is full'); }});
  await assert.rejects(b.commit(1, content('new')), /disk is full/);
  assert.equal(draftText(await a.recover()), 'saved\n');
  assert.equal((await a.commit(1, content('new'))).revision, 2);
});

test('fails on corrupt saved data instead of resetting from the original', async () => {
  const a = draftStore(key, {read:async () => 'broken', write:async () => assert.fail('must not write')});
  await assert.rejects(a.recover(), /recovery/);
  await assert.rejects(a.commit(0, content('replacing')), /recovery/);
});
