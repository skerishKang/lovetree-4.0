/**
 * Pages Functions 프록시 — 프런트가 부르는 서버 경계만 고정 업스트림으로 넘긴다.
 *
 * - 넘기는 경로는 workspace·관리자 읽기·미디어 UUID 경로와 지정한 auth 경로뿐이다.
 *   나머지 `/api/*`·`/auth/*` 는 404 JSON 이고, 정적 자산으로 폴백하지 않는다.
 * - 업스트림은 `env.LOVETREE_API_ORIGIN` 하나에서만 온다. 요청 헤더·쿼리·본문으로
 *   목적지를 바꿀 수 없고, 경로도 위 목록 밖으로 확장되지 않는다.
 * - 업스트림이 HTML(정적 호스트 폴백)이나 계약 밖 형식을 주면 502 JSON 으로 끊는다.
 *   "HTML 200"을 성공으로 바꾸지 않는다.
 *
 * 출처 — 같은 경로의 프록시 구현은 이 하나만 남긴다.
 * 응답 본문 완료까지의 기한·실제 읽기 취소(504)·응답 크기 상한·형식 검사·허용 헤더 목록과
 * 시험 대부분은 PR #68(`e2884e6`)의 것이고, 경로별 메서드 제한(405)과 `public/_routes.json`
 * 라우팅, 로컬 앞원진 검증(`scripts/dev-auth-chain.mjs`, `LOVETREE_DEV_FRONT_PORT`)은
 * PR #69에서 더했다. 컴2가 프록시를 단독 정리한다.
 */
// 경로마다 브라우저가 실제로 쓰는 메서드만 넘긴다. 그 밖은 COM2까지 내려보내지 않는다.
const MEDIA_ITEM = /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:png|jpg|gif|webp|mp4|webm)$/;
const ALLOWED = new Map([
  ['/api/media', new Set(['GET', 'POST'])],
  ['/api/workspace', new Set(['GET', 'PUT'])],
  ['/api/admin/session', new Set(['GET'])],
  ['/api/admin/roles', new Set(['GET'])],
  ['/auth/login', new Set(['GET'])],
  ['/auth/callback', new Set(['GET', 'POST'])],
  ['/auth/logout', new Set(['POST'])]
]);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const REQUEST_HEADERS = ['cookie', 'content-type', 'accept', 'accept-language', 'authorization', 'origin', 'x-lovetree-subject', 'x-lovetree-upload-id'];
const RESPONSE_HEADERS = ['content-type', 'location', 'cache-control', 'x-content-type-options', 'www-authenticate', 'content-security-policy'];

// 응답 본문 상한. 서버가 받아들이는 문서 상한(`server/http.js` DEFAULT_MAX_BODY_BYTES = 4MiB,
// `LOVETREE_MAX_BODY_BYTES`로 조정)보다 넉넉해야 정상 기록이 프록시에서 잘리지 않는다.
// 두 값의 관계는 `tests/pages-proxy.test.mjs`가 실제 상수를 import 해 견준다.
export const DEFAULT_RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;

export function upstreamOrigin(env) {
  const raw = typeof env?.LOVETREE_API_ORIGIN === 'string' ? env.LOVETREE_API_ORIGIN.trim() : '';
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.username || url.password) return null;
  if (url.pathname !== '/' || url.search || url.hash) return null;
  if (url.protocol === 'https:') return url.origin;
  // 격리 검증용 loopback만 http를 허용한다. 평문 공인 주소는 받지 않는다.
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) return url.origin;
  return null;
}

export function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

class UpstreamTooLarge extends Error {}

// 기한은 헤더 수신이 아니라 **응답 본문 완료**까지 적용한다. 헤더만 오고 본문이 멈춘
// 업스트림을 그대로 흘리면 클라이언트가 영원히 기다리므로, 읽기를 우리 손으로 끝낸다.
async function readWithDeadline(upstream, { limit, timedOut, cancel }) {
  if (!upstream.body) return new Uint8Array(0);
  const reader = upstream.body.getReader();
  cancel.current = () => reader.cancel().catch(() => {});
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut()) return null;
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new UpstreamTooLarge('too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    cancel.current = null;
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged;
}

export function createProxy({ fetcher = (...args) => fetch(...args), timeoutMs = 15_000, maxResponseBytes = DEFAULT_RESPONSE_LIMIT_BYTES } = {}) {
  return async function onRequest({ request, env }) {
    const incoming = new URL(request.url);
    const media = incoming.pathname === '/api/media' || MEDIA_ITEM.test(incoming.pathname);
    const methods = ALLOWED.get(incoming.pathname) || (MEDIA_ITEM.test(incoming.pathname) ? new Set(['GET','DELETE']) : null);
    if (!methods) return jsonError(404, 'not_proxied', '이 경로는 서버로 넘기지 않아요.');
    if (!methods.has(request.method)) return jsonError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');

    const origin = upstreamOrigin(env);
    if (!origin) return jsonError(503, 'storage_unavailable', '서버 저장 주소가 설정되지 않았어요.');

    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    // 타이머는 응답 본문까지 읽고 나서야 해제한다. 만료되면 업스트림 요청과 읽기를 함께 취소한다.
    const controller = new AbortController();
    const cancel = { current: null };
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
      cancel.current?.();
    }, Math.max(0, media ? Math.max(timeoutMs, 60_000) : timeoutMs));
    const timedOut = () => expired;

    try {
      const sendsBody = request.method !== 'GET' && request.method !== 'HEAD';
      const upstream = await fetcher(`${origin}${incoming.pathname}${incoming.search}`, {
        method: request.method,
        headers,
        ...(sendsBody ? { body: request.body, duplex: 'half' } : {}),
        redirect: 'manual',
        signal: controller.signal
      });
      if (expired) { await upstream.body?.cancel().catch(() => {}); return jsonError(504, 'upstream_timeout', '서버 응답이 제때 오지 않았어요.'); }

      // 정적 호스트 폴백(HTML)이나 계약 밖 형식은 성공이 아니다.
      const type = String(upstream.headers.get('content-type') || '').toLowerCase();
      const invalid = type.includes('text/html')
        || (incoming.pathname === '/api/workspace' && !type.includes('application/json'))
        || (media && !(type.includes('application/json') || (MEDIA_ITEM.test(incoming.pathname) && request.method === 'GET' && upstream.ok && /^(?:image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm))(?:;|$)/.test(type))));
      if (invalid) {
        await upstream.body?.cancel().catch(() => {});
        return jsonError(502, 'upstream_invalid_response', type.includes('text/html')
          ? '서버가 문서가 아닌 응답을 보냈어요.'
          : '서버 응답 형식이 예상과 달라요.');
      }

      const body = await readWithDeadline(upstream, { limit: maxResponseBytes, timedOut, cancel });
      if (body === null) return jsonError(504, 'upstream_timeout', '서버 응답이 제때 오지 않았어요.');

      const out = new Headers();
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
      }
      const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
      for (const cookie of cookies) out.append('set-cookie', cookie);

      const empty = upstream.status === 204 || upstream.status === 304 || body.byteLength === 0;
      return new Response(empty ? null : body, { status: upstream.status, headers: out });
    } catch (error) {
      if (expired) return jsonError(504, 'upstream_timeout', '서버 응답이 제때 오지 않았어요.');
      if (error instanceof UpstreamTooLarge) return jsonError(502, 'upstream_response_too_large', '서버 응답이 너무 커 중계를 멈췄어요.');
      return jsonError(502, 'upstream_unreachable', '서버에 닿지 못했어요.');
    } finally {
      clearTimeout(timer);
    }
  };
}
