import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenRegistry } from '../src/views/registry.js';

const screen = (id, pattern, result = null) => ({ id, matches: route => (pattern === null ? true : pattern.test(route)), activate: () => result });

test('먼저 선언된 화면이 이기고, 마지막 대체 화면이 나머지를 받는다', () => {
  const registry = createScreenRegistry([
    screen('book', /^book\//, 'book'),
    screen('trees', /^trees$/),
    screen('orbit', null)
  ]);
  assert.deepEqual(registry.ids, ['book', 'trees', 'orbit']);
  assert.equal(registry.resolve('book/t1').id, 'book');
  assert.equal(registry.resolve('trees').id, 'trees');
  assert.equal(registry.resolve('start').id, 'orbit');
  assert.equal(registry.resolve('').id, 'orbit');
  assert.equal(registry.resolve('book').id, 'orbit', '하위 경로가 아니면 대체 화면');
});

test('같은 경로가 겹치면 앞 항목이 이긴다(render 순서와 같은 규칙)', () => {
  const registry = createScreenRegistry([
    screen('missing-tree', /^book\//, 'workspace'),
    screen('book', /^book\//, 'book'),
    screen('orbit', null)
  ]);
  assert.equal(registry.resolve('book/t1').id, 'missing-tree');
});

test('id 중복·모양 오류·대체 화면 부재를 거부한다', () => {
  assert.throws(() => createScreenRegistry([]), /화면 등록표/);
  assert.throws(() => createScreenRegistry([
    screen('same', /a/), screen('same', /b/), screen('orbit', null)
  ]), /중복/);
  assert.throws(() => createScreenRegistry([
    { id: 'bad', matches: 'x', activate: () => {} }, screen('orbit', null)
  ]), /matches와 activate/);
  assert.throws(() => createScreenRegistry([
    { id: 'no-activate', matches: () => true, activate: null }
  ]), /matches와 activate/);
  assert.throws(() => createScreenRegistry([screen('book', /^book\//)]), /대체 화면/,
    '마지막 화면이 모든 경로를 받지 않으면 경로가 새어 나간다');
});

test('activate 가 돌려준 dispose 를 그대로 쓸 수 있다', () => {
  let disposed = 0;
  const registry = createScreenRegistry([
    { id: 'shelf', matches: r => r === 'trees', activate: () => () => { disposed += 1; } },
    { id: 'orbit', matches: () => true, activate: () => undefined }
  ]);
  const dispose = registry.resolve('trees').activate();
  assert.equal(typeof dispose, 'function');
  dispose();
  assert.equal(disposed, 1);
  assert.equal(registry.resolve('start').activate(), undefined, '일반 렌더 화면은 dispose 가 없다');
});
