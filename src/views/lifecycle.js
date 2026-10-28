/**
 * 화면 공통 mount/dispose 계약 — 궤도·책장·기억책이 같은 방법으로 붙고 같은 방법으로 정리된다.
 *
 * - shadow root와 AbortController를 한 자리에서 만든다. 이벤트는 `signal`로 붙이고,
 *   observer·RAF·dialog처럼 signal로 정리되지 않는 것은 `track()`에 맡긴다.
 * - `dispose()`는 여러 번 불러도 실제 정리는 한 번만 하고, 등록의 역순으로 실행한다.
 * - mount는 **새 host**에만 한다. 한 host에는 shadow root가 하나뿐이라 다시 붙일 수 없다.
 *   화면을 바꾸는 쪽(호출자)이 이전 화면을 dispose하고 host를 새로 만든다 — 이 앱은
 *   render마다 `#app`을 갈아 끼우므로 그 규칙과 같다.
 */
export function createView(host) {
  if (!host || typeof host.attachShadow !== 'function') throw new TypeError('화면을 붙일 host 요소가 필요해요.');
  if (host.shadowRoot) throw new Error('이미 shadow root가 있는 host에는 붙일 수 없어요. 화면을 바꿀 때는 호출자가 이전 화면을 dispose하고 새 host를 만들어 주세요.');
  const root = host.attachShadow({ mode: 'open' });
  const abort = new AbortController();
  const cleanups = [];
  let disposed = false;

  return {
    root,
    signal: abort.signal,
    /** signal로 정리되지 않는 자원(observer, animation frame, dialog)의 정리 함수를 등록한다. */
    track(cleanup) {
      if (typeof cleanup !== 'function') return cleanup;
      if (disposed) { cleanup(); return cleanup; }
      cleanups.push(cleanup);
      return cleanup;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      for (const cleanup of cleanups.reverse()) {
        try { cleanup(); } catch { /* 한 정리의 실패가 나머지를 막지 않는다 */ }
      }
      cleanups.length = 0;
    }
  };
}
