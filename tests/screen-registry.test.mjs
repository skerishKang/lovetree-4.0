import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenRegistry } from '../src/views/registry.js';

const screen = (id, pattern, result = null) => ({ id, matches: route => (pattern === null ? true : pattern.test(route)), activate: () => result });
const fallback = (id = 'orbit') => ({ id, fallback: true, activate: () => undefined });

test('먼저 선언된 화면이 이기고, 대체 화면이 나머지 경로를 받는다', () => {
  const registry = createScreenRegistry([
    screen('book', /^book\//, 'book'),
    screen('trees', /^trees$/),
    fallback()
  ]);
  assert.deepEqual(registry.ids, ['book', 'trees', 'orbit']);
  assert.equal(registry.resolve('book/t1').id, 'book');
  assert.equal(registry.resolve('trees').id, 'trees');
  assert.equal(registry.resolve('start').id, 'orbit');
  assert.equal(registry.resolve('book').id, 'orbit', '하위 경로가 아니면 대체 화면');
});

test('같은 경로가 겹치면 앞 항목이 이긴다(render 순서와 같은 규칙)', () => {
  const registry = createScreenRegistry([
    screen('missing-tree', /^book\//, 'workspace'),
    screen('book', /^book\//, 'book'),
    fallback()
  ]);
  assert.equal(registry.resolve('book/t1').id, 'missing-tree');
});

test('어떤 경로든 화면을 돌려준다 — 누락은 표본 검사가 아니라 표시로 막는다', () => {
  const registry = createScreenRegistry([
    screen('book', /^book\//),
    { id: 'orbit', fallback: true, activate: () => undefined }
  ]);
  for (const route of ['', 'start', 'trees', 'tree/t1', 'book/t1', 'demo-book/t1', 'examples', '\u0000', '아무/경로']) {
    assert.equal(registry.resolve(route).id, route.startsWith('book/') ? 'book' : 'orbit', route);
  }
});

test('id 중복·모양 오류·대체 화면 규칙을 거부한다', () => {
  assert.throws(() => createScreenRegistry([]), /화면 등록표/);
  assert.throws(() => createScreenRegistry([screen('same', /a/), screen('same', /b/), fallback()]), /중복/);
  assert.throws(() => createScreenRegistry([{ id: 'bad', matches: 'x', activate: () => {} }, fallback()]), /matches나 fallback/);
  assert.throws(() => createScreenRegistry([{ id: 'no-activate', matches: () => true }]), /activate/);
  assert.throws(() => createScreenRegistry([screen('book', /^book\//)]), /fallback: true/,
    '대체 화면 표시가 없으면 등록표를 만들지 않는다');
  assert.throws(() => createScreenRegistry([fallback('a'), fallback('b')]), /하나만/);
});

test('activate 가 돌려준 dispose 를 그대로 쓸 수 있다', () => {
  let disposed = 0;
  const registry = createScreenRegistry([
    { id: 'shelf', matches: r => r === 'trees', activate: () => () => { disposed += 1; } },
    { id: 'orbit', fallback: true, activate: () => undefined }
  ]);
  const dispose = registry.resolve('trees').activate();
  assert.equal(typeof dispose, 'function');
  dispose();
  assert.equal(disposed, 1);
  assert.equal(registry.resolve('start').activate(), undefined, '일반 렌더 화면은 dispose 가 없다');
});
