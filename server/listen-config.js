const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * COM2에서 이 서비스를 어디에 붙이나를 정하는 한 자리.
 *
 * 이 자산의 규칙은 "공개 리스너를 새로 만들지 않고 모두 127.0.0.1에만 바인딩"이다
 * (`docs/operations/COM2_PRIMARY_RUNTIME_SUPERVISOR_AND_TUNNEL_*.md`, 파일 레인 유닛의
 * `FILE_LANE_HOST=127.0.0.1`과 같다). 바깥으로 내보내는 일은 터널이 정한 호스트네임이
 * 대신하므로, 여기서 0.0.0.0을 받는 창은 만들지 않는다.
 *
 * 기본 포트는 8790 — 8788은 이미 `padiem-file-lane.service`가 같은 루프백에 잡고 있다.
 */
export function resolveListen({ env = {}, defaultPort = 8790 } = {}) {
  const rawHost = String(env.LOVETREE_HOST ?? '').trim();
  if (rawHost && !LOOPBACK.has(rawHost)) {
    throw new Error('LOVETREE_HOST는 127.0.0.1·localhost·::1만 됩니다. 공개 바인딩은 이 서비스의 방식이 아닙니다.');
  }
  const host = rawHost || '127.0.0.1';
  const port = Number(String(env.PORT ?? '').trim() || defaultPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT가 올바른 번호가 아닙니다: ${env.PORT ?? ''}`);
  }
  return Object.freeze({ host, port });
}
