import test from 'node:test';
import assert from 'node:assert/strict';
import { viewContext } from '../src/views/contract.js';

test('문맥은 treeId·momentId·readOnly 만 담고, 빈 값은 null·false 로 정규화한다', () => {
  assert.deepEqual({ ...viewContext() }, { treeId: null, momentId: null, readOnly: false });
  assert.deepEqual({ ...viewContext({ treeId: 't1', momentId: 'm1', readOnly: true }) }, { treeId: 't1', momentId: 'm1', readOnly: true });
  assert.deepEqual({ ...viewContext({ treeId: '', momentId: 'm1', readOnly: 1 }) }, { treeId: null, momentId: 'm1', readOnly: true });
  assert.deepEqual({ ...viewContext({ treeId: 42, momentId: {}, readOnly: 'yes' }) }, { treeId: null, momentId: null, readOnly: true });
});

test('문맥은 고정되어 화면이 바꿀 수 없다', () => {
  const context = viewContext({ treeId: 't1' });
  assert.equal(Object.isFrozen(context), true);
  assert.throws(() => { 'use strict'; context.treeId = 'other'; }, TypeError);
  assert.equal(context.treeId, 't1');
});
