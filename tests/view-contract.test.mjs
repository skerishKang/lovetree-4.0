import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/views/lifecycle.js';

function fakeHost() {
  const roots = [];
  return {
    roots,
    shadowRoot: null,
    attachShadow(init) {
      // 실제 DOM과 같다: 한 host에는 shadow root가 하나뿐이다.
      if (this.shadowRoot) throw new Error('Shadow root cannot be created on a host which already hosts a shadow tree.');
      const root = { mode: init?.mode, mounted: true };
      this.shadowRoot = root;
      roots.push(root);
      return root;
    }
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

test('같은 host에 다시 mount하지 않는다 — 계약은 "새 host에 mount, 기존 화면 dispose는 호출자"', () => {
  const host = fakeHost();
  const first = createView(host);
  first.dispose();
  assert.throws(() => createView(host), /새 host/,
    'shadow root가 남은 host에는 다시 붙이지 않는다(플랫폼도 거부한다)');
  const second = createView(fakeHost());
  assert.notEqual(second.root, first.root, '새 host에는 새 shadow root가 붙는다');
  second.dispose();
});

test('signal은 track 정리보다 먼저 끊긴다 — dispose가 닫는 dialog의 close 콜백이 남지 않는 이유', () => {
  const view = createView(fakeHost());
  let abortedWhenCleanupRan = null;
  view.track(() => { abortedWhenCleanupRan = view.signal.aborted; });
  view.dispose();
  assert.equal(abortedWhenCleanupRan, true, 'track(() => modal.close()) 실행 시점에 이미 이벤트 리스너는 해제되어 있다');
});
