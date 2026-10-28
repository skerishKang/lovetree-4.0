/**
 * Pages Functions 프록시 — 프런트가 부르는 서버 경계만 고정 업스트림으로 넘긴다.
 *
 * - 넘기는 경로는 `/api/workspace` 와 `/auth/login`·`/auth/callback`·`/auth/logout` 뿐이다.
 *   나머지 `/api/*`·`/auth/*` 는 404 JSON 이고, 정적 자산으로 폴백하지 않는다.
 * - 업스트림은 `env.LOVETREE_API_ORIGIN` 하나에서만 온다. 요청 헤더·쿼리·본문으로
 *   목적지를 바꿀 수 없고, 경로도 위 목록 밖으로 확장되지 않는다.
 * - 업스트림이 HTML(정적 호스트 폴백)이나 계약 밖 형식을 주면 502 JSON 으로 끊는다.
 *   "HTML 200"을 성공으로 바꾸지 않는다.
 */
const ALLOWED = new Set(['/api/workspace', '/auth/login', '/auth/callback', '/auth/logout']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const REQUEST_HEADERS = ['cookie', 'content-type', 'accept', 'accept-language', 'authorization', 'origin'];
const RESPONSE_HEADERS = ['content-type', 'location', 'cache-control', 'x-content-type-options', 'www-authenticate'];

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

export function createProxy({ fetcher = (...args) => fetch(...args), timeoutMs = 15_000 } = {}) {
  return async function onRequest({ request, env }) {
    const incoming = new URL(request.url);
    if (!ALLOWED.has(incoming.pathname)) return jsonError(404, 'not_proxied', '이 경로는 서버로 넘기지 않아요.');

    const origin = upstreamOrigin(env);
    if (!origin) return jsonError(503, 'storage_unavailable', '서버 저장 주소가 설정되지 않았어요.');

    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
    let upstream;
    try {
      upstream = await fetcher(`${origin}${incoming.pathname}${incoming.search}`, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
        signal: controller.signal
      });
    } catch {
      return controller.signal.aborted
        ? jsonError(504, 'upstream_timeout', '서버 응답이 제때 오지 않았어요.')
        : jsonError(502, 'upstream_unreachable', '서버에 닿지 못했어요.');
    } finally {
      clearTimeout(timer);
    }

    // 정적 호스트 폴백(HTML)이나 계약 밖 형식은 성공이 아니다.
    const type = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html')) return jsonError(502, 'upstream_invalid_response', '서버가 문서가 아닌 응답을 보냈어요.');
    if (incoming.pathname === '/api/workspace' && !type.includes('application/json')) {
      return jsonError(502, 'upstream_invalid_response', '서버 응답 형식이 예상과 달라요.');
    }

    const out = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
    for (const cookie of cookies) out.append('set-cookie', cookie);

    const body = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;
    return new Response(body, { status: upstream.status, headers: out });
  };
}
