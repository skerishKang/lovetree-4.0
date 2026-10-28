/**
 * 화면 공통 mount/dispose 계약 — 궤도·책장·기억책이 같은 방법으로 붙고 같은 방법으로 정리된다.
 *
 * - shadow root와 AbortController를 한 자리에서 만든다. 이벤트는 `signal`로 붙이고,
 *   observer·RAF·dialog처럼 signal로 정리되지 않는 것은 `track()`에 맡긴다.
 * - `dispose()`는 여러 번 불러도 실제 정리는 한 번만 하고, 등록의 역순으로 실행한다.
 * - host가 바뀌지 않아도(같은 요소에 다시 mount) 이전 정리가 끝난 뒤 새 화면이 붙는다.
 */
export function createView(host) {
  if (!host || typeof host.attachShadow !== 'function') throw new TypeError('화면을 붙일 host 요소가 필요해요.');
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
