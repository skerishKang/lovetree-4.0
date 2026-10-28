/**
 * Pages 프런트와 COM2 저장 API를 같은 원진으로 잇는 프록시.
 *
 * 화면은 상대 경로만 부르고(`src/sync.js`의 same-origin fetch), 세션 쿠키는 host-only·
 * `SameSite=Lax`·HttpOnly라 다른 원진의 fetch에 실리지 않는다. 그래서 프런트와 API를 한
 * 원진에 세우되, 저장과 로그인은 COM2 Node 서비스가 답하게 한다. Pages Function이 이 파일의
 * 진입점을 부르고, 로컬 사슬(`scripts/dev-auth-chain.mjs`)은 같은 함수를 앞원진에 얹어
 * 같은 토폴로지를 검증한다.
 *
 * 나가는 주소는 배포 설정 하나가 고정한다(`LOVETREE_API_ORIGIN`). 검사 규칙은 PADIEM의
 * B14 upstream 스위치를 따른다 — scheme·host만 받고 userinfo·query·fragment·path와 예약
 * origin을 거부하며, 틀리면 추측하지 않고 닫는다. 붙이는 경로는 아래 닫힌 목록뿐이다.
 * 서버 간 중계 비밀은 이 경로를 지나지 않는다 — 중계 서명은 COM2가 자기 발신에 쓴다.
 *
 * 쿠키와 Location은 재작성하지 않는다. COM2는 절대 URL을 요청 Host가 아니라
 * `LOVETREE_PUBLIC_ORIGIN`(= 공개 앞원진)에서 만들고 Set-Cookie에 Domain을 싣지 않으므로
 * 앞원진에 그대로 붙는다. 장애는 HTML로 바꾸지 않는다 — 이 파일이 내보내는 본문은 항상
 * JSON이고 `no-store`다.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// 브라우저가 실제로 부르는 경로와 그 메서드. 이 밖은 프록시가 알지 못한다.
export const PROXY_ROUTES = new Map([
  ['/api/workspace', new Set(['GET', 'PUT'])],
  ['/auth/login', new Set(['GET'])],
  ['/auth/callback', new Set(['GET', 'POST'])],
  ['/auth/logout', new Set(['POST'])]
]);

// hop-by-hop과, 위임되면 위험한 것만 내린다. 쿠키·content-type·accept는 그대로 지난다.
const DROPPED_REQUEST_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
const DROPPED_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'content-encoding', 'content-length', 'transfer-encoding']);

export const PROXY_ORIGIN_ENV = 'LOVETREE_API_ORIGIN';

export class ProxyConfigError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** scheme+host(+port)만 남긴다. 리다이렉트로 읽힐 수 있는 조각은 모두 거부한다. */
export function normalizeOrigin(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new ProxyConfigError('proxy_origin_missing');
  let parsed;
  try { parsed = new URL(value); } catch { throw new ProxyConfigError('proxy_origin_unparsable'); }
  const loopback = LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new ProxyConfigError('proxy_origin_scheme_invalid');
  }
  if (!parsed.hostname) throw new ProxyConfigError('proxy_origin_host_missing');
  if (parsed.username || parsed.password) throw new ProxyConfigError('proxy_origin_credentials_forbidden');
  if (parsed.search || parsed.hash) throw new ProxyConfigError('proxy_origin_query_forbidden');
  if (parsed.pathname.replace(/\/+$/, '') !== '') throw new ProxyConfigError('proxy_origin_path_forbidden');
  return parsed.origin;
}

function json(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function setCookieValues(headers) {
  const listed = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : null;
  if (Array.isArray(listed)) return listed;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export function createApiProxy({ env = {}, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  let origin = null;
  let configError = null;
  try {
    origin = normalizeOrigin(env[PROXY_ORIGIN_ENV]);
  } catch (error) {
    configError = error.code ?? 'proxy_origin_invalid';
  }

  return async function proxy(request) {
    if (configError) return json(503, 'proxy_not_configured', '저장 연결이 이 배포에 설정되지 않았어요.');

    const url = new URL(request.url);
    const allowed = PROXY_ROUTES.get(url.pathname);
    if (!allowed) return json(404, 'not_found', '요청을 찾을 수 없어요.');
    if (!allowed.has(request.method)) return json(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');

    const headers = new Headers();
    for (const [name, value] of request.headers.entries()) {
      if (!DROPPED_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
    }

    const target = new URL(origin);
    target.pathname = url.pathname;
    target.search = url.search;

    const init = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body ?? await request.arrayBuffer();
      init.duplex = 'half';
    }

    let upstream;
    try {
      upstream = await fetchImpl(target.href, init);
    } catch {
      return json(502, 'upstream_unavailable', '저장 서버에 닿지 못했어요. 기록은 이 기기에 남아 있어요.');
    }

    const sent = new Headers();
    for (const [name, value] of upstream.headers.entries()) {
      if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) sent.append(name, value);
    }
    // Headers 반복자는 같은 이름을 한 줄로 합친다. 쿠키 두 개가 섞여 하나가 되는 일을
    // 막으려고 set-cookie는 원본 값으로 다시 채운다.
    sent.delete('set-cookie');
    for (const cookie of setCookieValues(upstream.headers)) sent.append('set-cookie', cookie);
    sent.set('cache-control', 'no-store');

    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: sent });
  };
}

let cached;
let cachedOrigin;

/** Pages Function 진입점. `env`는 배포 설정이고, 같은 origin 동안 처리기를 재사용한다. */
export async function handleProxy({ request, env }) {
  const origin = env?.[PROXY_ORIGIN_ENV] ?? '';
  if (!cached || cachedOrigin !== origin) {
    cached = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: origin } });
    cachedOrigin = origin;
  }
  return cached(request);
}
