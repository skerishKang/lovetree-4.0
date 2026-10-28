import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/views/lifecycle.js';

function fakeHost() {
  const roots = [];
  return {
    roots,
    attachShadow(init) { const root = { mode: init?.mode, mounted: true }; roots.push(root); return root; }
  };
}

test('host에 shadow root를 한 번 붙이고 root·signal을 그대로 준다', () => {
  const host = fakeHost();
  const view = createView(host);
  assert.equal(host.roots.length, 1);
  assert.equal(host.roots[0].mode, 'open');
  assert.equal(view.root, host.roots[0]);
  assert.equal(view.signal.aborted, false);
});

test('dispose는 등록의 역순으로 정리하고 이벤트 signal을 끊는다', () => {
  const view = createView(fakeHost());
  const order = [];
  view.track(() => order.push('first'));
  view.track(() => order.push('second'));
  view.dispose();
  assert.deepEqual(order, ['second', 'first']);
  assert.equal(view.signal.aborted, true, 'signal 로 붙은 이벤트가 함께 해제된다');
});

test('dispose는 여러 번 불러도 실제 정리는 한 번만 한다', () => {
  const view = createView(fakeHost());
  let count = 0;
  view.track(() => { count += 1; });
  view.dispose();
  view.dispose();
  view.dispose();
  assert.equal(count, 1);
});

test('정리 중 하나가 던져도 나머지 정리는 계속된다', () => {
  const view = createView(fakeHost());
  const done = [];
  view.track(() => done.push('a'));
  view.track(() => { throw new Error('boom'); });
  view.track(() => done.push('c'));
  view.dispose();
  assert.deepEqual(done, ['c', 'a']);
  assert.equal(view.signal.aborted, true);
});

test('이미 dispose된 뒤 등록한 정리는 즉시 실행된다', () => {
  const view = createView(fakeHost());
  view.dispose();
  let ran = false;
  view.track(() => { ran = true; });
  assert.equal(ran, true, '정리되지 않는 자원이 남지 않는다');
});

test('host가 없으면 조용히 넘어가지 않고 거부한다', () => {
  assert.throws(() => createView(null), /host/);
  assert.throws(() => createView({}), /host/);
});
